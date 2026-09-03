"""
Camada de leitura (SPEC 0.3): consultas nomeadas, sem efeito colateral.

Nenhuma view monta QuerySet a mao e nenhum selector muta estado ou calcula
dinheiro -- dinheiro e de `services/pricing.py`.
"""

from __future__ import annotations

from datetime import date, datetime

from django.db.models import Exists, OuterRef, Prefetch, Q, QuerySet

from hotel.models import Guest, PricingPolicy, Reservation, ReservationStatus, Room
from hotel.normalization import normalize_document, normalize_phone

# Atributos preenchidos pelos prefetches abaixo, consumidos pelos
# serializers das abas "no hotel" e "pendentes" (SPEC 4.3).
ACTIVE_RESERVATIONS_ATTR = "active_reservations"
PENDING_RESERVATIONS_ATTR = "pending_reservations"
# As duas relacoes tem nomes distintos no ORM (`reservations` e
# `companion_reservations`), entao sao dois prefetches e dois atributos; o
# serializer concatena.
ACTIVE_COMPANION_RESERVATIONS_ATTR = "active_companion_reservations"
PENDING_COMPANION_RESERVATIONS_ATTR = "pending_companion_reservations"


def search_guests(term: str | None = None) -> QuerySet[Guest]:
    """Nome, documento e telefone por fragmento (SPEC 4.3, D5).

    Documento e telefone sao normalizados antes do `icontains`, entao o termo
    aceita mascara (`789-01`, `(21) 98888`) e ainda assim casa o valor gravado.
    """
    queryset = Guest.objects.all()
    term = (term or "").strip()
    if not term:
        return queryset

    predicate = Q(full_name__icontains=term)

    document = normalize_document(term)
    if document:
        predicate |= Q(document__icontains=document)

    phone = normalize_phone(term)
    if phone:
        predicate |= Q(phone__icontains=phone)

    return queryset.filter(predicate)


def _by_status(status: str, *, attr_own: str, attr_companion: str) -> QuerySet[Guest]:
    """Hospedes com reserva no status dado, como titular OU acompanhante.

    A raiz continua em `Guest` porque RF4/RF5 pedem "localizar HOSPEDES" e a
    contagem da paginacao e por PESSOA -- inverter para `Reservation` faria
    `count` contar reservas e um acompanhante de duas reservas apareceria duas
    vezes. `distinct()` porque o `OR` sobre duas relacoes multivaloradas
    duplica a linha.

    Dois `Prefetch` e nao um: as duas relacoes tem nomes diferentes no ORM
    (`reservations` e `companion_reservations`) e nao ha como uni-las num
    prefetch so. O serializer concatena as duas listas.
    """
    reservations = Reservation.objects.filter(status=status).select_related("room")
    return (
        Guest.objects.filter(
            Q(reservations__status=status) | Q(companion_reservations__status=status)
        )
        .prefetch_related(
            Prefetch("reservations", queryset=reservations, to_attr=attr_own),
            Prefetch("companion_reservations", queryset=reservations, to_attr=attr_companion),
        )
        .distinct()
    )


def guests_in_hotel() -> QuerySet[Guest]:
    """Hospedes no hotel (RF4) -- titulares E acompanhantes.

    O acompanhante ESTA no hotel: nao lista-lo faria a aba mentir sobre quem
    esta hospedado, que e a unica pergunta que ela responde. A constraint
    `resv_one_active_per_guest` garante no maximo uma ativa por titular, e o
    lock de `_lock_people` garante o mesmo para acompanhante -- entao a
    concatenacao das duas listas tem no maximo um item, que e o
    `active_reservation` da SPEC 4.3.
    """
    return _by_status(
        ReservationStatus.CHECKED_IN,
        attr_own=ACTIVE_RESERVATIONS_ATTR,
        attr_companion=ACTIVE_COMPANION_RESERVATIONS_ATTR,
    )


def guests_pending_checkin() -> QuerySet[Guest]:
    """Hospedes com reserva PENDING (RF5), inclusive vencidas (D14).

    Inclui acompanhantes por SIMETRIA com RF4: se um acompanhante conta como
    hospedado depois do check-in, ele conta como esperado antes dele -- e a
    pergunta de RF5 e "quem tem reserva e ainda nao entrou". Um hospede pode
    ter mais de uma reserva futura, logo a lista e plural.
    """
    return _by_status(
        ReservationStatus.PENDING,
        attr_own=PENDING_RESERVATIONS_ATTR,
        attr_companion=PENDING_COMPANION_RESERVATIONS_ATTR,
    )


# Tudo o que `ReservationSerializer` le fora da propria linha. Sem isto a
# listagem paginada faz uma consulta por reserva POR relacao -- 20 linhas com 6
# relacoes sao 120 idas ao banco para uma tela. `django_assert_num_queries` no
# teste e o que impede a regressao silenciosa.
RESERVATION_RELATIONS = (
    "guest",
    "room",
    "policy",
    "created_by",
    "checked_in_by",
    "checked_out_by",
    "cancelled_by",
    "paid_by",
)


def reservation_queryset() -> QuerySet[Reservation]:
    """Base com tudo o que o serializer le, sem N+1.

    `companions` e M2M, logo `prefetch_related` e nao `select_related`: uma
    segunda consulta para todas as linhas, em vez de uma por linha.
    """
    return Reservation.objects.select_related(*RESERVATION_RELATIONS).prefetch_related(
        "companions"
    )


def list_reservations(
    *,
    status: str | None = None,
    guest_id: int | None = None,
    paid: bool | None = None,
):
    """Reservas filtradas por status, hospede e/ou pagamento (SPEC 4.2)."""
    queryset = reservation_queryset()
    if status:
        queryset = queryset.filter(status=status)
    if guest_id is not None:
        queryset = queryset.filter(guest_id=guest_id)
    if paid is not None:
        # `paid_at` e a coluna canonica do pagamento: a CHECK
        # `resv_payment_complete` garante que os tres campos andam juntos, entao
        # testar um responde pelos tres.
        queryset = queryset.filter(paid_at__isnull=not paid)
    return queryset


def policy_in_force(at: datetime) -> PricingPolicy:
    """A politica vigente no instante `at` (SPEC 3.1).

    `at` e parametro, nao `timezone.now()` lido aqui: a mesma consulta responde
    "qual era a politica na sexta passada", e e assim que o seed e o teste
    conseguem se situar no passado sem congelar o relogio do processo.

    Empate em `effective_from` (duas publicacoes no mesmo instante) e desfeito
    por `-id`: vence a ultima inserida.
    """
    policy = (
        PricingPolicy.objects.filter(effective_from__lte=at)
        .order_by("-effective_from", "-id")
        .first()
    )
    if policy is None:
        # Nao e erro de dominio: e banco sem bootstrap. Um codigo de envelope
        # aqui (`POLICY_MISSING`) fingiria que o cliente pode resolver isso
        # mudando a requisicao. O traceback e a resposta certa.
        raise RuntimeError(
            "nenhuma PricingPolicy vigente: o bootstrap nao foi aplicado (rode migrate)"
        )
    return policy


def list_policies() -> QuerySet[PricingPolicy]:
    """Historico de politicas, da mais recente para a mais antiga."""
    return PricingPolicy.objects.select_related("created_by").all()


# -- quartos ------------------------------------------------------------------

# Reservas que ocupam a agenda de um quarto. Cancelada e finalizada nao contam:
# o quarto volta a ser oferecivel no instante do cancel/checkout.
OCCUPYING_STATUSES = (ReservationStatus.PENDING, ReservationStatus.CHECKED_IN)


def list_rooms(*, active_only: bool = True) -> QuerySet[Room]:
    """Quartos do inventario. Por default so os em operacao."""
    queryset = Room.objects.all()
    if active_only:
        queryset = queryset.filter(is_active=True)
    return queryset


def _overlapping(checkin_date: date, checkout_date: date) -> QuerySet[Reservation]:
    """Reservas ativas cujo intervalo cruza `[checkin_date, checkout_date)`.

    Intervalos meio-abertos: `a.inicio < b.fim AND a.fim > b.inicio`. Sai dia 09
    e entra dia 09 NAO se cruzam -- a mesma semantica de D1 e do `[)` do
    `EXCLUDE`.
    """
    return Reservation.objects.filter(
        status__in=OCCUPYING_STATUSES,
        checkin_date__lt=checkout_date,
        checkout_date__gt=checkin_date,
    )


def available_rooms(
    *,
    checkin_date: date,
    checkout_date: date,
    people: int,
    today: date,
) -> QuerySet[Room]:
    """Quartos ofereciveis para o periodo e o numero de pessoas.

    Duas exclusoes, e a segunda e a que nao daria para expressar em constraint:

    1. Agenda cruzada, por `~Exists`. Nao `exclude(reservations__...)`: numa
       relacao multivalorada o `exclude` gera um `NOT IN` sobre a juncao e
       descarta o quarto quando QUALQUER reserva dele casa parte do predicado,
       nao quando UMA reserva casa o predicado inteiro.
    2. Overstay: se o periodo comeca hoje ou antes, um quarto com hospede ainda
       dentro (CHECKED_IN de qualquer data) nao esta livre -- por mais que a
       agenda diga que sim (D6/D7/D14). Isso depende de "hoje", logo e guarda de
       leitura e nao constraint.
    """
    queryset = list_rooms(active_only=True).filter(capacity__gte=people)

    scheduled = _overlapping(checkin_date, checkout_date).filter(room=OuterRef("pk"))
    queryset = queryset.filter(~Exists(scheduled))

    if checkin_date <= today:
        occupied_now = Reservation.objects.filter(
            room=OuterRef("pk"), status=ReservationStatus.CHECKED_IN
        )
        queryset = queryset.filter(~Exists(occupied_now))

    return queryset


def conflicting_reservation(
    room: Room,
    *,
    checkin_date: date,
    checkout_date: date,
    today: date,
) -> Reservation | None:
    """A reserva que impede este quarto neste periodo, ou `None`.

    Mesmo predicado de `available_rooms`, mas devolvendo a linha: e ela que
    alimenta o `extra` do `409 ROOM_UNAVAILABLE` com o id do conflito, para o
    atendente saber o que consultar em vez de receber "indisponivel" e nada.
    """
    conflict = _overlapping(checkin_date, checkout_date).filter(room=room).first()
    if conflict is not None:
        return conflict
    if checkin_date <= today:
        return (
            Reservation.objects.filter(room=room, status=ReservationStatus.CHECKED_IN)
            .order_by("checkin_date", "id")
            .first()
        )
    return None
