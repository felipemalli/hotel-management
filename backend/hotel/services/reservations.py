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

from datetime import date, datetime
from typing import TYPE_CHECKING

from django.db import transaction
from django.utils import timezone

from hotel import selectors
from hotel.models import Guest, PaymentMethod, Reservation, ReservationStatus, StatementLine
from hotel.services import pricing
from hotel.services.catalog import rate_table_of
from hotel.services.errors import DomainError, DomainValidationError
from hotel.services.pricing import Bill

if TYPE_CHECKING:  # pragma: no cover - apenas para anotacao
    from django.contrib.auth.models import AbstractBaseUser

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

    # `atomic` mesmo com uma unica escrita: criacao parcial de reserva nao
    # existe, e e esta transacao que da ao savepoint de traducao de constraint
    # (`errors.translate_integrity_error`) um lugar para aninhar.
    with transaction.atomic():
        return Reservation.objects.create(
            guest=guest,
            checkin_date=checkin_date,
            checkout_date=checkout_date,
            has_vehicle=has_vehicle,
            created_by=actor,
        )


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
        Guest.objects.select_for_update().get(pk=reservation.guest_id)
        locked = _lock(reservation)
        _assert_transition(locked, ReservationStatus.CHECKED_IN)
        _assert_no_active_stay(locked)

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


def _lock(reservation: Reservation) -> Reservation:
    """Rele a linha sob `select_for_update`: dois atendentes nao concluem a mesma acao."""
    return Reservation.objects.select_for_update().get(pk=reservation.pk)


def _assert_no_active_stay(reservation: Reservation) -> None:
    """Hospede com estadia em curso nao faz novo check-in.

    Sem esta checagem a `UniqueConstraint` do banco estoura como
    `IntegrityError`, que o handler da SPEC 4.1 nao classifica -- virava HTTP
    500 com corpo HTML numa condicao legitima de negocio (hospede com duas
    reservas PENDING). Invariante violada e `409 INVALID_STATUS`.
    """
    active = (
        Reservation.objects.filter(
            guest_id=reservation.guest_id, status=ReservationStatus.CHECKED_IN
        )
        .exclude(pk=reservation.pk)
        .values_list("pk", flat=True)
        .first()
    )
    if active is not None:
        raise InvalidStatusError(
            "Hóspede já possui uma estadia ativa; faça o checkout antes de um novo check-in.",
            extra={"status": reservation.status, "active_reservation_id": active},
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
