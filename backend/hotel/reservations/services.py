from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date, datetime, time
from typing import TYPE_CHECKING

from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from core.errors import DomainValidationError, translate_integrity_error
from core.money import ZERO
from hotel.billing import engine
from hotel.billing import selectors as billing_selectors
from hotel.billing import services as billing
from hotel.billing.models import LineKind, PricingPolicy
from hotel.billing.services import rate_table_of
from hotel.guests.models import Guest
from hotel.reservations import selectors
from hotel.reservations.errors import (
    EarlyCheckinError,
    InvalidStatusError,
    RoomUnavailableError,
)
from hotel.reservations.models import (
    RESV_ONE_ACTIVE_PER_ROOM,
    RESV_ROOM_NO_OVERLAP,
    Reservation,
    ReservationStatus,
)
from hotel.reservations.statement import Statement, statement_from_lines
from hotel.rooms.models import Room

if TYPE_CHECKING:  # pragma: no cover
    from django.contrib.auth.models import AbstractBaseUser

# Ordem de lock: Guest (pk asc) -> Room -> Reservation -> Account. Inverter isso deadlocks.
# create_reservation nao trava: a autoridade e o EXCLUDE sob savepoint.
ALLOWED_TRANSITIONS: dict[str, frozenset[str]] = {
    ReservationStatus.PENDING: frozenset(
        {ReservationStatus.CHECKED_IN, ReservationStatus.CANCELLED}
    ),
    ReservationStatus.CHECKED_IN: frozenset({ReservationStatus.CHECKED_OUT}),
    ReservationStatus.CHECKED_OUT: frozenset(),
    ReservationStatus.CANCELLED: frozenset(),
}

# Lista manual: derivar de update_fields esconderia o esquecimento.
# "account" e o objeto, nao "account_id": o id nao muda no checkout nem no
# pagamento, entao copiar so o _id deixaria o objeto do select_related em cache
# com a conta aberta e o total nulo.
SYNCED_FIELDS = (
    "status",
    "policy_id",
    "account",
    "checked_in_at",
    "checked_out_at",
    "cancelled_at",
    "checked_in_by_id",
    "checked_out_by_id",
    "cancelled_by_id",
)


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
    if checkin_date < today:
        raise DomainValidationError("checkin_date", "Data de check-in não pode ser no passado.")
    if checkout_date <= checkin_date:
        raise DomainValidationError(
            "checkout_date", "Data de checkout deve ser posterior à de check-in."
        )
    if not room.is_active:
        raise DomainValidationError("room_id", f"Quarto {room.number} está desativado.")

    _assert_party(guest, companions, room)
    _assert_room_free(room, checkin_date=checkin_date, checkout_date=checkout_date, today=today)

    with transaction.atomic():
        # A guarda da a mensagem; o EXCLUDE e a autoridade na corrida. O savepoint
        # traduz a violacao no mesmo 409, em vez de 500 com corpo HTML.
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
        if companions:
            reservation.companions.set(companions)
        return reservation


@dataclass(frozen=True)
class CheckinWindow:
    """A politica vigente e o que ela diz sobre a hora de agora (D15)."""

    policy: PricingPolicy
    is_early: bool
    opens_at: time
    server_time: datetime  # ja em hora local


def checkin_window(*, now: datetime) -> CheckinWindow:
    # Uma consulta e uma fonte de verdade para o 409 do check-in e para quem so
    # precisa narrar o horario: cedo ou nao, a politica e a vigente agora, porque
    # a amarracao na reserva (D15) acontece depois desta leitura.
    policy = billing_selectors.policy_in_force(now)
    rates = rate_table_of(policy)
    local_now = timezone.localtime(now)
    return CheckinWindow(
        policy=policy,
        is_early=engine.early_checkin(local_now.time(), rates),
        opens_at=rates.checkin_opens,
        server_time=local_now,
    )


def check_in(
    reservation: Reservation,
    *,
    now: datetime,
    actor: AbstractBaseUser,
    allow_early: bool = False,
) -> Reservation:
    with transaction.atomic():
        # Trava as pessoas, nao so a reserva: "uma estadia ativa" vale entre linhas.
        people_ids = _lock_people(reservation)
        Room.objects.select_for_update().get(pk=reservation.room_id)
        locked = _lock(reservation)
        _assert_transition(locked, ReservationStatus.CHECKED_IN)
        _assert_no_active_stay(locked, people_ids)
        _assert_room_ready(locked, now=now)

        window = checkin_window(now=now)
        if window.is_early and not allow_early:
            opens_at = f"{window.opens_at:%H:%M}"
            raise EarlyCheckinError(
                detail=f"Check-in permitido a partir das {opens_at}.",
                extra={
                    "server_time": window.server_time.strftime("%H:%M"),
                    "opens_at": opens_at,
                },
            )

        locked.status = ReservationStatus.CHECKED_IN
        locked.checked_in_at = now
        locked.checked_in_by = actor
        locked.policy = window.policy
        locked.account = billing.open_account(now=now)
        with translate_integrity_error(
            {
                RESV_ONE_ACTIVE_PER_ROOM: lambda: RoomUnavailableError(
                    extra={"room_id": locked.room_id},
                )
            }
        ):
            locked.save(
                update_fields=["status", "checked_in_at", "checked_in_by", "policy", "account"]
            )

    return _sync(reservation, locked)


def preview_checkout(reservation: Reservation, *, now: datetime) -> Statement:
    """Quanto sairia se o checkout fosse agora. Sem lock, sem escrita."""
    bill = _bill_for(reservation, now=now)
    extras = reservation.account.lines.filter(kind=LineKind.EXTRA)
    return Statement.from_bill(bill, extras=extras)


def check_out(reservation: Reservation, *, now: datetime, actor: AbstractBaseUser) -> Statement:
    with transaction.atomic():
        locked = _lock(reservation)
        _assert_transition(locked, ReservationStatus.CHECKED_OUT)
        bill = _bill_for(locked, now=now)

        rates = rate_table_of(locked.policy)
        billing.post_lines(
            locked.account,
            _line_inputs(bill, rates=rates, now=now),
            posted_by=actor,
            now=now,
        )
        locked.account = billing.close_account(locked.account, now=now)

        locked.status = ReservationStatus.CHECKED_OUT
        locked.checked_out_at = now
        locked.checked_out_by = actor
        locked.save(update_fields=["status", "checked_out_at", "checked_out_by"])

    _sync(reservation, locked)
    # Reconstruido do livro: a 2a via e o extrato do checkout percorrem um so caminho.
    return statement(locked)


def _bill_for(reservation: Reservation, *, now: datetime) -> engine.Bill:
    if reservation.status != ReservationStatus.CHECKED_IN:
        raise InvalidStatusError(
            f"Transição inválida: {reservation.status} -> {ReservationStatus.CHECKED_OUT}.",
            extra={"status": reservation.status},
        )
    if reservation.checked_in_at is None:
        raise InvalidStatusError("Reserva sem check-in registrado.")

    # Cobranca pelos fatos, com a politica amarrada no check-in. A conversao
    # para hora local mora aqui: o motor so aceita date/time, sem fuso para errar.
    checkin_local = timezone.localtime(reservation.checked_in_at)
    checkout_local = timezone.localtime(now)
    return engine.calculate_bill(
        checkin_day=checkin_local.date(),
        checkout_day=checkout_local.date(),
        checkout_time=checkout_local.time(),
        booked_checkout_day=reservation.checkout_date,
        has_vehicle=reservation.has_vehicle,
        rates=rate_table_of(reservation.policy),
    )


def _line_inputs(
    bill: engine.Bill, *, rates: engine.RateTable, now: datetime
) -> list[billing.LineInput]:
    lines = [
        billing.LineInput(
            kind=LineKind.DAILY,
            service_date=line.date,
            unit_amount=line.daily_rate,
            description=line.weekday_label,
        )
        for line in bill.lines
    ]
    lines += [
        billing.LineInput(
            kind=LineKind.PARKING,
            service_date=line.date,
            unit_amount=line.parking_fee,
            description="vaga de estacionamento",
        )
        for line in bill.lines
        if line.parking_fee != ZERO
    ]
    if bill.late_fee_applied:
        lines.append(
            billing.LineInput(
                kind=LineKind.LATE_FEE,
                service_date=timezone.localdate(now),
                unit_amount=bill.late_fee_base,
                quantity=rates.late_fee_factor,
                description=f"checkout após {rates.checkout_limit:%H:%M}",
            )
        )
    return lines


def cancel(reservation: Reservation, *, now: datetime, actor: AbstractBaseUser) -> Reservation:
    with transaction.atomic():
        locked = _lock(reservation)
        _assert_transition(locked, ReservationStatus.CANCELLED)
        locked.status = ReservationStatus.CANCELLED
        locked.cancelled_at = now
        locked.cancelled_by = actor
        locked.save(update_fields=["status", "cancelled_at", "cancelled_by"])

    return _sync(reservation, locked)


def statement(reservation: Reservation) -> Statement:
    """Reemite o extrato do livro. Nao recomputa."""
    if reservation.status != ReservationStatus.CHECKED_OUT:
        raise InvalidStatusError("Extrato disponível apenas após o checkout.")

    account = reservation.account
    return statement_from_lines(billing_selectors.lines_of(account), total=account.total_amount)


def mark_paid(
    reservation: Reservation,
    *,
    now: datetime,
    actor: AbstractBaseUser,
    payment_method: str,
) -> Reservation:
    with transaction.atomic():
        locked = _lock(reservation)
        if locked.status != ReservationStatus.CHECKED_OUT:
            raise InvalidStatusError(
                "Pagamento disponível apenas após o checkout.",
                extra={"status": locked.status},
            )
        locked.account = billing.register_payment(
            locked.account, method=payment_method, now=now, actor=actor
        )

    return _sync(reservation, locked)


def _assert_party(guest: Guest, companions: Sequence[Guest], room: Room) -> None:
    if not companions:
        return

    companion_ids = [companion.pk for companion in companions]
    if guest.pk in companion_ids:
        raise DomainValidationError(
            "companion_ids", "O titular da reserva não pode ser também acompanhante."
        )
    if len(set(companion_ids)) != len(companion_ids):
        raise DomainValidationError("companion_ids", "Há acompanhantes repetidos na lista.")

    party = 1 + len(companion_ids)
    if party > room.capacity:
        raise DomainValidationError(
            "companion_ids",
            f"Quarto {room.number} comporta {room.capacity} pessoas.",
        )


def _lock_people(reservation: Reservation) -> list[int]:
    """Trava titular e acompanhantes, por pk crescente.

    * sorted: duas transacoes travando as mesmas pessoas em ordens diferentes deadlock.
    * filter(pk__in=...), nunca join de M2M: o PG recusa FOR UPDATE no lado
      anulavel de um outer join, que e o que o ORM emite ao atravessar M2M.
    * list(...): queryset e preguicoso; sem materializar, o FOR UPDATE nao roda.
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
    occupant = (
        Reservation.objects.filter(room_id=reservation.room_id, status=ReservationStatus.CHECKED_IN)
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
    return Reservation.objects.select_for_update().get(pk=reservation.pk)


def _assert_no_active_stay(reservation: Reservation, people_ids: list[int]) -> None:
    # Titular: constraint resv_one_active_per_guest. Acompanhante: nao ha
    # constraint cross-table sem denormalizar status; lock + esta leitura.
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
    for field in SYNCED_FIELDS:
        setattr(reservation, field, getattr(locked, field))
    return reservation
