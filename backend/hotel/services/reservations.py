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

from django.db import transaction
from django.utils import timezone

from hotel.models import Guest, Reservation, ReservationStatus
from hotel.services import pricing
from hotel.services.errors import DomainError, DomainValidationError
from hotel.services.pricing import Bill

# Transicoes validas (SPEC 1.5). Qualquer outra e rejeitada.
ALLOWED_TRANSITIONS: dict[str, frozenset[str]] = {
    ReservationStatus.PENDING: frozenset(
        {ReservationStatus.CHECKED_IN, ReservationStatus.CANCELLED}
    ),
    ReservationStatus.CHECKED_IN: frozenset({ReservationStatus.CHECKED_OUT}),
    ReservationStatus.CHECKED_OUT: frozenset(),
    ReservationStatus.CANCELLED: frozenset(),
}

SYNCED_FIELDS = (
    "status",
    "checked_in_at",
    "checked_out_at",
    "total_daily",
    "total_parking",
    "late_fee",
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
    """Check-in antes das 14h sem override -- 409 EARLY_CHECKIN (D4)."""

    code = "EARLY_CHECKIN"
    default_detail = "Check-in permitido a partir das 14:00."


def create_reservation(
    *,
    guest: Guest,
    checkin_date: date,
    checkout_date: date,
    has_vehicle: bool = False,
    today: date,
) -> Reservation:
    """Agenda uma reserva (RF2). Nasce `PENDING`, sem dinheiro (SPEC 4.4).

    `today` e parametro, nao `timezone.localdate()` lido aqui dentro: D11 e uma
    regra de data local e o invariante SPEC 0.3 vale para a criacao como vale
    para o check-in -- quem materializa "hoje" e a view.
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

    return Reservation.objects.create(
        guest=guest,
        checkin_date=checkin_date,
        checkout_date=checkout_date,
        has_vehicle=has_vehicle,
    )


def check_in(reservation: Reservation, *, now: datetime, allow_early: bool = False) -> Reservation:
    """Efetiva o check-in. Antes das 14h locais exige `allow_early` (D4)."""
    with transaction.atomic():
        # Trava o HOSPEDE, nao apenas a reserva: a invariante "no maximo uma
        # estadia ativa" (SPEC 1.5, `resv_one_active_per_guest`) vale ENTRE
        # linhas, e travar so a reserva deixaria dois atendentes passarem pela
        # checagem ao mesmo tempo, em reservas diferentes do mesmo hospede.
        Guest.objects.select_for_update().get(pk=reservation.guest_id)
        locked = _lock(reservation)
        _assert_transition(locked, ReservationStatus.CHECKED_IN)
        _assert_no_active_stay(locked)

        local_now = timezone.localtime(now)
        if pricing.early_checkin(local_now) and not allow_early:
            # Alerta, nao proibicao: o atendente reenvia com allow_early=True.
            raise EarlyCheckinError(extra={"server_time": local_now.strftime("%H:%M")})

        locked.status = ReservationStatus.CHECKED_IN
        locked.checked_in_at = now
        locked.save(update_fields=["status", "checked_in_at"])

    return _sync(reservation, locked)


def check_out(reservation: Reservation, *, now: datetime) -> Bill:
    """Efetiva o checkout, congela os totais e devolve o extrato (SPEC 4.4)."""
    with transaction.atomic():
        locked = _lock(reservation)
        _assert_transition(locked, ReservationStatus.CHECKED_OUT)
        if locked.checked_in_at is None:
            raise InvalidStatusError("Reserva sem check-in registrado.")

        # Cobranca pelos fatos reais, em hora local (D6, SPEC 0.3).
        bill = pricing.calculate_bill(
            checkin=timezone.localtime(locked.checked_in_at),
            checkout=timezone.localtime(now),
            has_vehicle=locked.has_vehicle,
        )

        locked.status = ReservationStatus.CHECKED_OUT
        locked.checked_out_at = now
        locked.total_daily = bill.subtotal_daily
        locked.total_parking = bill.subtotal_parking
        locked.late_fee = bill.late_fee
        locked.total_amount = bill.total
        locked.save(
            update_fields=[
                "status",
                "checked_out_at",
                "total_daily",
                "total_parking",
                "late_fee",
                "total_amount",
            ]
        )

    _sync(reservation, locked)
    return bill


def cancel(reservation: Reservation) -> Reservation:
    """`PENDING -> CANCELLED`. Nenhum outro estado cancela (D8)."""
    with transaction.atomic():
        locked = _lock(reservation)
        _assert_transition(locked, ReservationStatus.CANCELLED)
        locked.status = ReservationStatus.CANCELLED
        locked.save(update_fields=["status"])

    return _sync(reservation, locked)


def statement(reservation: Reservation) -> Bill:
    """Recomputa o extrato de uma reserva ja finalizada (SPEC 1.3: sem JSON no banco)."""
    if reservation.status != ReservationStatus.CHECKED_OUT:
        raise InvalidStatusError("Extrato disponível apenas após o checkout.")
    return pricing.calculate_bill(
        checkin=timezone.localtime(reservation.checked_in_at),
        checkout=timezone.localtime(reservation.checked_out_at),
        has_vehicle=reservation.has_vehicle,
    )


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
