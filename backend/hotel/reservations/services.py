from __future__ import annotations

from collections.abc import Sequence
from datetime import date, datetime
from typing import TYPE_CHECKING

from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from core.errors import DomainValidationError, translate_integrity_error
from hotel.billing import engine
from hotel.billing import selectors as billing_selectors
from hotel.billing.services import rate_table_of
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
from hotel.reservations import selectors
from hotel.reservations.errors import (
    EarlyCheckinError,
    InvalidStatusError,
    RoomUnavailableError,
)

if TYPE_CHECKING:  # pragma: no cover
    from django.contrib.auth.models import AbstractBaseUser

# Ordem de lock: Guest (pk asc) -> Room -> Reservation. Inverter isso deadlocks.
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

        # Cedo ou nao usa a politica vigente agora; a amarracao e duas linhas abaixo.
        policy = billing_selectors.policy_in_force(now)
        rates = rate_table_of(policy)

        local_now = timezone.localtime(now)
        if engine.early_checkin(local_now, rates) and not allow_early:
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


def check_out(reservation: Reservation, *, now: datetime, actor: AbstractBaseUser) -> engine.Bill:
    with transaction.atomic():
        locked = _lock(reservation)
        _assert_transition(locked, ReservationStatus.CHECKED_OUT)
        if locked.checked_in_at is None:
            raise InvalidStatusError("Reserva sem check-in registrado.")

        # Cobranca pelos fatos, em hora local, com a politica amarrada no check-in.
        bill = engine.calculate_bill(
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
    with transaction.atomic():
        locked = _lock(reservation)
        _assert_transition(locked, ReservationStatus.CANCELLED)
        locked.status = ReservationStatus.CANCELLED
        locked.cancelled_at = now
        locked.cancelled_by = actor
        locked.save(update_fields=["status", "cancelled_at", "cancelled_by"])

    return _sync(reservation, locked)


def statement(reservation: Reservation) -> engine.Bill:
    """Reemite o snapshot congelado. Nao recomputa."""
    if reservation.status != ReservationStatus.CHECKED_OUT:
        raise InvalidStatusError("Extrato disponível apenas após o checkout.")

    lines = [
        engine.BillLine(
            date=line.date,
            weekday_label=engine.weekday_label(line.date),
            daily_rate=line.daily_rate,
            parking_fee=line.parking_fee,
        )
        for line in reservation.statement_lines.all()
    ]
    if not lines:
        raise InvalidStatusError("Extrato indisponível: esta reserva não tem linhas gravadas.")

    return engine.Bill(
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
                extra={"paid_at": timezone.localtime(locked.paid_at).isoformat()},
            )

        locked.paid_at = now
        locked.payment_method = PaymentMethod(payment_method)
        locked.paid_by = actor
        locked.save(update_fields=["paid_at", "payment_method", "paid_by"])

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
