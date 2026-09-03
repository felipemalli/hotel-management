"""
Camada de mutacao das reservas (SPEC 3.2, 1.5).

Aqui vive a orquestracao com ORM: valida a transicao de status, converte os
timestamps para hora local antes de aplicar regra (SPEC 0.3), delega TODO o
dinheiro para `pricing` (puro) e congela os totais na linha, dentro de
`transaction.atomic` + `select_for_update`.

O relogio e injetado: `now` e sempre parametro explicito -- a view passa
`timezone.now()`, o teste e o seed passam o que quiserem.
"""

from __future__ import annotations

from collections.abc import Sequence
from datetime import date, datetime
from typing import TYPE_CHECKING

from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from hotel import selectors
from hotel.models import (
    RESV_ONE_ACTIVE_PER_ROOM,
    RESV_ROOM_NO_OVERLAP,
    Guest,
    PaymentMethod,
    Reservation,
    ReservationStatus,
    Room,
    StatementLine,
)
from hotel.services import pricing
from hotel.services.catalog import rate_table_of
from hotel.services.errors import (
    DomainError,
    DomainValidationError,
    translate_integrity_error,
)
from hotel.services.pricing import Bill

if TYPE_CHECKING:  # pragma: no cover - apenas para anotacao
    from django.contrib.auth.models import AbstractBaseUser

# ORDEM DE LOCK, obrigatoria em todo caminho que trave mais de uma linha:
#
#     Guest -> Room -> Reservation
#
# Duas transacoes que travem as mesmas linhas em ordens diferentes fazem
# deadlock (o PG mata uma com `deadlock detected`, e o atendente ve um 500). A
# ordem e por TABELA e, dentro de `Guest`, por pk crescente. `create_reservation`
# nao trava nada -- a autoridade dela e o `EXCLUDE`, sob savepoint.
#
# Transicoes validas (SPEC 1.5). Qualquer outra e rejeitada.
ALLOWED_TRANSITIONS: dict[str, frozenset[str]] = {
    ReservationStatus.PENDING: frozenset(
        {ReservationStatus.CHECKED_IN, ReservationStatus.CANCELLED}
    ),
    ReservationStatus.CHECKED_IN: frozenset({ReservationStatus.CHECKED_OUT}),
    ReservationStatus.CHECKED_OUT: frozenset(),
    ReservationStatus.CANCELLED: frozenset(),
}

# Toda coluna que uma transicao escreve entra aqui: e o que faz a instancia do
# chamador ficar em dia com a linha sem um segundo SELECT. Lista manual de
# proposito -- derivar de `update_fields` esconderia o esquecimento --, e
# `test_sync_matches_refresh_from_db` e o alarme de quem esquecer.
SYNCED_FIELDS = (
    "status",
    "policy_id",
    "paid_at",
    "payment_method",
    "paid_by_id",
    "checked_in_at",
    "checked_out_at",
    "cancelled_at",
    "checked_in_by_id",
    "checked_out_by_id",
    "cancelled_by_id",
    "total_daily",
    "total_parking",
    "late_fee",
    "late_fee_base",
    "total_amount",
)


class ReservationError(DomainError):
    """Erro de dominio da reserva -- 409 com o codigo do envelope (SPEC 4.1)."""

    code = "INVALID_STATUS"
    default_detail = "Operação inválida para esta reserva."


class InvalidStatusError(ReservationError):
    """Transicao de status ilegal -- 409 INVALID_STATUS (SPEC 4.1)."""

    code = "INVALID_STATUS"
    default_detail = "Transição de status inválida."


class RoomUnavailableError(ReservationError):
    """Quarto indisponivel -- 409 ROOM_UNAVAILABLE.

    Um codigo so para as tres causas (agenda sobreposta, quarto ainda ocupado,
    chegada antecipada em quarto prometido) porque a acao do atendente e a
    mesma nas tres: escolher outro quarto ou outra data. Distinguir por codigo
    daria ao cliente tres ramos que fariam a mesma coisa; o `extra` diz qual
    reserva conflita, que e a informacao acionavel.
    """

    code = "ROOM_UNAVAILABLE"
    default_detail = "Quarto indisponível para o período."


class EarlyCheckinError(ReservationError):
    """Check-in antes da abertura, sem override -- 409 EARLY_CHECKIN (D4).

    O `default_detail` sobrevive com "14:00" porque e o default do briefing e o
    fallback de quem levanta o erro sem `detail`. Quem levanta de verdade
    (`check_in`) interpola o horario da politica vigente: com a politica default
    a mensagem sai byte a byte igual a de antes, e com uma politica de 15:00 ela
    para de mentir. `extra["opens_at"]` da ao cliente o horario sem parsear
    texto.
    """

    code = "EARLY_CHECKIN"
    default_detail = "Check-in permitido a partir das 14:00."


def create_reservation(
    *,
    guest: Guest,
    room: Room,
    companions: Sequence[Guest] = (),
    checkin_date: date,
    checkout_date: date,
    has_vehicle: bool = False,
    actor: AbstractBaseUser,
    today: date,
) -> Reservation:
    """Agenda uma reserva (RF2). Nasce `PENDING`, sem dinheiro (SPEC 4.4).

    `today` e parametro, nao `timezone.localdate()` lido aqui dentro: D11 e uma
    regra de data local e o invariante SPEC 0.3 vale para a criacao como vale
    para o check-in -- quem materializa "hoje" e a view.

    `actor` e obrigatorio como nas transicoes: quem abriu a reserva e parte do
    registro. A coluna continua nulavel para a linha que nasceu fora da API (o
    shell), nao para tornar o parametro opcional aqui.
    """
    if checkin_date < today:
        # D11: reserva e compromisso futuro. O passado entra no sistema pelos
        # fatos (check-in/checkout reais), nunca pelo agendamento.
        raise DomainValidationError("checkin_date", "Data de check-in não pode ser no passado.")
    if checkout_date <= checkin_date:
        # D13: agendamento exige no minimo 1 noite (espelha a constraint SPEC 1.5).
        raise DomainValidationError(
            "checkout_date", "Data de checkout deve ser posterior à de check-in."
        )
    if not room.is_active:
        # Estado do recurso, nao forma do payload: por isso no servico e nao no
        # serializer. O quarto EXISTE -- so nao esta em operacao.
        raise DomainValidationError("room_id", f"Quarto {room.number} está desativado.")

    _assert_party(guest, companions, room)
    _assert_room_free(room, checkin_date=checkin_date, checkout_date=checkout_date, today=today)

    with transaction.atomic():
        # A guarda acima da a mensagem boa; o `EXCLUDE` e a autoridade na
        # corrida entre dois atendentes reservando o mesmo quarto ao mesmo
        # tempo. O savepoint traduz a violacao no MESMO 409, para que a corrida
        # nao vire 500 com corpo HTML.
        with translate_integrity_error(
            {
                RESV_ROOM_NO_OVERLAP: lambda: RoomUnavailableError(
                    extra={"room_id": room.pk},
                )
            }
        ):
            reservation = Reservation.objects.create(
                guest=guest,
                room=room,
                checkin_date=checkin_date,
                checkout_date=checkout_date,
                has_vehicle=has_vehicle,
                created_by=actor,
            )
        # Dentro do MESMO `atomic`: reserva com quarto cheio e sem os
        # acompanhantes gravados seria uma reserva que ninguem consegue
        # explicar -- e a capacidade ja foi consumida.
        if companions:
            reservation.companions.set(companions)
        return reservation


def check_in(
    reservation: Reservation,
    *,
    now: datetime,
    actor: AbstractBaseUser,
    allow_early: bool = False,
) -> Reservation:
    """Efetiva o check-in. Antes das 14h locais exige `allow_early` (D4).

    `actor` e obrigatorio: a transicao grava quem a fez, e um default silencioso
    (`None`) deixaria a linha do tempo com buracos justo onde ela e interessante
    -- "quem hospedou este hospede as 2h da manha".
    """
    with transaction.atomic():
        # Trava o HOSPEDE, nao apenas a reserva: a invariante "no maximo uma
        # estadia ativa" (SPEC 1.5, `resv_one_active_per_guest`) vale ENTRE
        # linhas, e travar so a reserva deixaria dois atendentes passarem pela
        # checagem ao mesmo tempo, em reservas diferentes do mesmo hospede.
        people_ids = _lock_people(reservation)
        # Ordem Guest -> Room -> Reservation (ver o topo do modulo).
        Room.objects.select_for_update().get(pk=reservation.room_id)
        locked = _lock(reservation)
        _assert_transition(locked, ReservationStatus.CHECKED_IN)
        _assert_no_active_stay(locked, people_ids)
        _assert_room_ready(locked, now=now)

        # A politica VIGENTE NO ATO decide se e cedo -- este e o unico valor
        # que nao pode vir da politica amarrada, porque a amarracao acontece
        # duas linhas abaixo (D15).
        policy = selectors.policy_in_force(now)
        rates = rate_table_of(policy)

        local_now = timezone.localtime(now)
        if pricing.early_checkin(local_now, rates) and not allow_early:
            # Alerta, nao proibicao: o atendente reenvia com allow_early=True.
            opens_at = f"{rates.checkin_opens:%H:%M}"
            raise EarlyCheckinError(
                detail=f"Check-in permitido a partir das {opens_at}.",
                extra={"server_time": local_now.strftime("%H:%M"), "opens_at": opens_at},
            )

        locked.status = ReservationStatus.CHECKED_IN
        locked.checked_in_at = now
        locked.checked_in_by = actor
        locked.policy = policy
        with translate_integrity_error(
            {
                RESV_ONE_ACTIVE_PER_ROOM: lambda: RoomUnavailableError(
                    extra={"room_id": locked.room_id},
                )
            }
        ):
            locked.save(update_fields=["status", "checked_in_at", "checked_in_by", "policy"])

    return _sync(reservation, locked)


def check_out(reservation: Reservation, *, now: datetime, actor: AbstractBaseUser) -> Bill:
    """Efetiva o checkout, congela os totais e devolve o extrato (SPEC 4.4)."""
    with transaction.atomic():
        locked = _lock(reservation)
        _assert_transition(locked, ReservationStatus.CHECKED_OUT)
        if locked.checked_in_at is None:
            raise InvalidStatusError("Reserva sem check-in registrado.")

        # Cobranca pelos fatos reais, em hora local (D6, SPEC 0.3), com a
        # politica AMARRADA no check-in -- nao a vigente agora (D15). Se um
        # admin publicar tarifa nova durante a estadia, a conta continua a que
        # foi combinada na entrada.
        bill = pricing.calculate_bill(
            checkin=timezone.localtime(locked.checked_in_at),
            checkout=timezone.localtime(now),
            has_vehicle=locked.has_vehicle,
            rates=rate_table_of(locked.policy),
        )

        locked.status = ReservationStatus.CHECKED_OUT
        locked.checked_out_at = now
        locked.checked_out_by = actor
        locked.total_daily = bill.subtotal_daily
        locked.total_parking = bill.subtotal_parking
        locked.late_fee = bill.late_fee
        locked.late_fee_base = bill.late_fee_base
        locked.total_amount = bill.total
        locked.save(
            update_fields=[
                "status",
                "checked_out_at",
                "checked_out_by",
                "total_daily",
                "total_parking",
                "late_fee",
                "late_fee_base",
                "total_amount",
            ]
        )
        # As linhas entram na MESMA transacao dos totais: extrato com total
        # congelado e sem linhas seria um recibo que nao se explica.
        StatementLine.objects.bulk_create(
            StatementLine(
                reservation=locked,
                date=line.date,
                daily_rate=line.daily_rate,
                parking_fee=line.parking_fee,
            )
            for line in bill.lines
        )

    _sync(reservation, locked)
    return bill


def cancel(reservation: Reservation, *, now: datetime, actor: AbstractBaseUser) -> Reservation:
    """`PENDING -> CANCELLED`. Nenhum outro estado cancela (D8)."""
    with transaction.atomic():
        locked = _lock(reservation)
        _assert_transition(locked, ReservationStatus.CANCELLED)
        locked.status = ReservationStatus.CANCELLED
        locked.cancelled_at = now
        locked.cancelled_by = actor
        locked.save(update_fields=["status", "cancelled_at", "cancelled_by"])

    return _sync(reservation, locked)


def statement(reservation: Reservation) -> Bill:
    """Reemite o extrato congelado. NAO recomputa (D18).

    Hidrata o `Bill` das colunas e das `StatementLine` gravadas no checkout.
    Recomputar faria o recibo de uma estadia encerrada depender de o motor
    continuar produzindo o mesmo numero para a mesma entrada -- e um recibo nao
    e uma funcao, e um fato. `pricing.calculate_bill` fica com um unico
    chamador no modulo: `check_out`.

    `weekday_label` deriva da data aqui e nao de coluna: nome de dia da semana e
    formatacao, e guarda-lo congelaria o idioma junto com o dinheiro.
    """
    if reservation.status != ReservationStatus.CHECKED_OUT:
        raise InvalidStatusError("Extrato disponível apenas após o checkout.")

    lines = [
        pricing.BillLine(
            date=line.date,
            weekday_label=pricing.weekday_label(line.date),
            daily_rate=line.daily_rate,
            parking_fee=line.parking_fee,
        )
        for line in reservation.statement_lines.all()
    ]
    if not lines:
        # Reserva encerrada antes de o extrato passar a ser persistido, ou
        # escrita que driblou `check_out`. Melhor um 409 explicito que um
        # recibo de zero diarias.
        raise InvalidStatusError("Extrato indisponível: esta reserva não tem linhas gravadas.")

    return Bill(
        lines=lines,
        subtotal_daily=reservation.total_daily,
        subtotal_parking=reservation.total_parking,
        late_fee_applied=reservation.late_fee_base is not None,
        late_fee_base=reservation.late_fee_base,
        late_fee=reservation.late_fee,
        total=reservation.total_amount,
    )


def mark_paid(
    reservation: Reservation,
    *,
    now: datetime,
    actor: AbstractBaseUser,
    payment_method: str,
) -> Reservation:
    """Registra o pagamento unico e integral da conta fechada (D18).

    Nao e transicao de status: `CHECKED_OUT` continua sendo o estado terminal
    (ver `PaymentMethod`). Por isso a guarda e explicita em vez de passar por
    `_assert_transition` -- e sai como `INVALID_STATUS`, nao como um codigo
    `ALREADY_PAID` proprio: pagar duas vezes e uma operacao ilegal para o
    estado atual do recurso, exatamente o significado de D8/`INVALID_STATUS`. O
    `extra.paid_at` diz ao cliente QUANDO foi pago, que e o que a tela precisa.
    """
    with transaction.atomic():
        locked = _lock(reservation)
        if locked.status != ReservationStatus.CHECKED_OUT:
            raise InvalidStatusError(
                "Pagamento disponível apenas após o checkout.",
                extra={"status": locked.status},
            )
        if locked.paid_at is not None:
            raise InvalidStatusError(
                "Esta conta já foi paga.",
                # Hora LOCAL, como todo timestamp que a API devolve: o banco
                # guarda UTC, e um `extra` em UTC ao lado de um `paid_at` local
                # no mesmo payload faria a tela mostrar dois horarios.
                extra={"paid_at": timezone.localtime(locked.paid_at).isoformat()},
            )

        locked.paid_at = now
        locked.payment_method = PaymentMethod(payment_method)
        locked.paid_by = actor
        locked.save(update_fields=["paid_at", "payment_method", "paid_by"])

    return _sync(reservation, locked)


def _assert_party(guest: Guest, companions: Sequence[Guest], room: Room) -> None:
    """Regras do GRUPO -- de agregado, logo do servico e nao do serializer.

    O serializer sabe se cada id existe; ele nao sabe se o titular esta na
    propria lista de acompanhantes, nem quantas pessoas o quarto comporta.
    """
    if not companions:
        return

    companion_ids = [companion.pk for companion in companions]
    if guest.pk in companion_ids:
        raise DomainValidationError(
            "companion_ids", "O titular da reserva não pode ser também acompanhante."
        )
    if len(set(companion_ids)) != len(companion_ids):
        raise DomainValidationError(
            "companion_ids", "Há acompanhantes repetidos na lista."
        )

    party = 1 + len(companion_ids)
    if party > room.capacity:
        raise DomainValidationError(
            "companion_ids",
            f"Quarto {room.number} comporta {room.capacity} pessoas.",
        )


def _lock_people(reservation: Reservation) -> list[int]:
    """Trava titular e acompanhantes, e devolve os ids travados.

    UNICA funcao que trava pessoas -- ter duas seria ter duas ordens de lock.
    Tres detalhes, cada um com uma falha real por tras:

    * `sorted(...)`: duas transacoes que travem as mesmas pessoas em ordens
      diferentes fazem deadlock. Ordem por pk crescente resolve por convencao.
    * SEM JOIN (`filter(pk__in=ids)`, nunca `filter(companion_reservations=...)`):
      o PostgreSQL recusa `FOR UPDATE` no lado anulavel de um outer join, e o
      ORM gera outer join ao atravessar M2M.
    * `list(...)`: queryset e preguicoso. Sem materializar, o `SELECT ... FOR
      UPDATE` nunca chega a ser executado e ninguem trava nada -- o codigo
      pareceria correto e a invariante ficaria desprotegida.
    """
    ids = sorted({reservation.guest_id, *reservation.companions.values_list("pk", flat=True)})
    list(Guest.objects.filter(pk__in=ids).order_by("pk").select_for_update())
    return ids


def _assert_room_free(
    room: Room,
    *,
    checkin_date: date,
    checkout_date: date,
    today: date,
) -> None:
    """Guarda de leitura da criacao: agenda cruzada ou quarto com overstay."""
    conflict = selectors.conflicting_reservation(
        room, checkin_date=checkin_date, checkout_date=checkout_date, today=today
    )
    if conflict is None:
        return
    raise RoomUnavailableError(
        f"Quarto {room.number} indisponível no período solicitado.",
        extra={
            "room_id": room.pk,
            "conflicting_reservation_id": conflict.pk,
            "conflicting_status": conflict.status,
            "conflicting_checkin_date": conflict.checkin_date.isoformat(),
        },
    )


def _assert_room_ready(reservation: Reservation, *, now: datetime) -> None:
    """Duas guardas que dependem de "hoje" e por isso nao podem ser constraint.

    (a) OVERSTAY: outra estadia ainda dentro do quarto. A agenda pode ja ter
        liberado a data, mas o hospede anterior nao saiu (D6/D7/D14).
    (b) CHEGADA ANTECIPADA: check-in antes da data agendada continua permitido
        (D7), salvo quando adiantar-se toma um quarto que esta prometido a
        OUTRA reserva no periodo que a chegada antecipada realmente ocupa.
    """
    occupant = (
        Reservation.objects.filter(
            room_id=reservation.room_id, status=ReservationStatus.CHECKED_IN
        )
        .exclude(pk=reservation.pk)
        .first()
    )
    if occupant is not None:
        raise RoomUnavailableError(
            "Quarto ainda ocupado por outra estadia.",
            extra={
                "room_id": reservation.room_id,
                "conflicting_reservation_id": occupant.pk,
                "conflicting_status": occupant.status,
                "conflicting_checkin_date": occupant.checkin_date.isoformat(),
            },
        )

    today = timezone.localdate(now)
    if today >= reservation.checkin_date:
        return

    promised = (
        Reservation.objects.filter(
            room_id=reservation.room_id,
            status=ReservationStatus.PENDING,
            checkin_date__lt=reservation.checkout_date,
            checkout_date__gt=today,
        )
        .exclude(pk=reservation.pk)
        .order_by("checkin_date", "id")
        .first()
    )
    if promised is not None:
        raise RoomUnavailableError(
            f"Chegada antecipada tomaria o quarto de outra reserva a partir de "
            f"{promised.checkin_date.isoformat()}.",
            extra={
                "room_id": reservation.room_id,
                "conflicting_reservation_id": promised.pk,
                "conflicting_status": promised.status,
                "conflicting_checkin_date": promised.checkin_date.isoformat(),
            },
        )


def _lock(reservation: Reservation) -> Reservation:
    """Rele a linha sob `select_for_update`: dois atendentes nao concluem a mesma acao."""
    return Reservation.objects.select_for_update().get(pk=reservation.pk)


def _assert_no_active_stay(reservation: Reservation, people_ids: list[int]) -> None:
    """Ninguem do grupo pode ter estadia em curso -- nem titular, nem acompanhante.

    Para o TITULAR a autoridade final e a constraint `resv_one_active_per_guest`
    (sem a guarda, o `IntegrityError` viraria 500 com corpo HTML numa condicao
    legitima de negocio). Para ACOMPANHANTE nao ha constraint cross-table
    possivel sem denormalizar `status`, entao a autoridade e o lock de
    `_lock_people` mais esta leitura: sob READ COMMITTED, a segunda transacao
    espera no lock e rele depois do commit da primeira.

    Fraqueza declarada: escrita que nao passe por `check_in` fura a regra do
    acompanhante. Hoje nao existe outra -- acompanhante so e gravado na criacao,
    que nasce PENDING. Gatilho para uma tabela unica de participantes com
    constraint: o SEGUNDO caminho de escrita.
    """
    active = (
        Reservation.objects.filter(status=ReservationStatus.CHECKED_IN)
        .filter(Q(guest_id__in=people_ids) | Q(companions__in=people_ids))
        .exclude(pk=reservation.pk)
        .values_list("pk", "guest_id")
        .first()
    )
    if active is not None:
        active_pk, active_guest_id = active
        raise InvalidStatusError(
            "Hóspede já possui uma estadia ativa; faça o checkout antes de um novo check-in.",
            extra={
                "status": reservation.status,
                "guest_id": active_guest_id,
                "active_reservation_id": active_pk,
            },
        )


def _assert_transition(reservation: Reservation, target: str) -> None:
    if target not in ALLOWED_TRANSITIONS[reservation.status]:
        raise InvalidStatusError(
            f"Transição inválida: {reservation.status} -> {target}.",
            extra={"status": reservation.status},
        )


def _sync(reservation: Reservation, locked: Reservation) -> Reservation:
    """Devolve a instancia do chamador em dia com a linha, sem novo SELECT."""
    for field in SYNCED_FIELDS:
        setattr(reservation, field, getattr(locked, field))
    return reservation
