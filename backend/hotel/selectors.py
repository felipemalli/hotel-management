"""
Camada de leitura (SPEC 0.3): consultas nomeadas, sem efeito colateral.

Nenhuma view monta QuerySet a mao e nenhum selector muta estado ou calcula
dinheiro -- dinheiro e de `services/pricing.py`.
"""

from __future__ import annotations

from datetime import datetime

from django.db.models import Prefetch, Q, QuerySet

from hotel.models import Guest, PricingPolicy, Reservation, ReservationStatus
from hotel.normalization import normalize_document, normalize_phone

# Atributos preenchidos pelos prefetches abaixo, consumidos pelos
# serializers das abas "no hotel" e "pendentes" (SPEC 4.3).
ACTIVE_RESERVATIONS_ATTR = "active_reservations"
PENDING_RESERVATIONS_ATTR = "pending_reservations"


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


def guests_in_hotel() -> QuerySet[Guest]:
    """Hospedes com reserva CHECKED_IN (RF4).

    A constraint `resv_one_active_per_guest` (SPEC 1.5) garante que a lista
    prefetchada tem no maximo um item -- e o `active_reservation` da SPEC 4.3.
    """
    return (
        Guest.objects.filter(reservations__status=ReservationStatus.CHECKED_IN)
        .prefetch_related(
            Prefetch(
                "reservations",
                queryset=Reservation.objects.filter(status=ReservationStatus.CHECKED_IN),
                to_attr=ACTIVE_RESERVATIONS_ATTR,
            )
        )
        .distinct()
    )


def guests_pending_checkin() -> QuerySet[Guest]:
    """Hospedes com reserva PENDING (RF5), inclusive vencidas (D14).

    Um hospede pode ter mais de uma reserva futura, logo a lista e plural.
    """
    return (
        Guest.objects.filter(reservations__status=ReservationStatus.PENDING)
        .prefetch_related(
            Prefetch(
                "reservations",
                queryset=Reservation.objects.filter(status=ReservationStatus.PENDING),
                to_attr=PENDING_RESERVATIONS_ATTR,
            )
        )
        .distinct()
    )


# Tudo o que `ReservationSerializer` le fora da propria linha. Sem isto a
# listagem paginada faz uma consulta por reserva POR relacao -- 20 linhas com 6
# relacoes sao 120 idas ao banco para uma tela. `django_assert_num_queries` no
# teste e o que impede a regressao silenciosa.
RESERVATION_RELATIONS = (
    "guest",
    "policy",
    "created_by",
    "checked_in_by",
    "checked_out_by",
    "cancelled_by",
    "paid_by",
)


def list_reservations(
    *,
    status: str | None = None,
    guest_id: int | None = None,
    paid: bool | None = None,
):
    """Reservas filtradas por status, hospede e/ou pagamento (SPEC 4.2)."""
    queryset = Reservation.objects.select_related(*RESERVATION_RELATIONS)
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
