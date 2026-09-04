from __future__ import annotations

from datetime import datetime, time
from decimal import Decimal
from typing import TYPE_CHECKING

from hotel.models import ROOM_NUMBER_UNIQUE, PricingPolicy, ReservationStatus, Room
from hotel.services import pricing
from hotel.services.errors import (
    DomainError,
    DomainValidationError,
    translate_integrity_error,
)

if TYPE_CHECKING:  # pragma: no cover
    from django.contrib.auth.models import AbstractBaseUser


class DuplicateRoomNumberError(DomainError):
    code = "VALIDATION_ERROR"
    status_code = 400
    default_detail = "Dados inválidos."

    def __init__(self) -> None:
        super().__init__(extra={"number": ["Já existe um quarto com este número."]})


def create_room(*, number: str, capacity: int) -> Room:
    with translate_integrity_error({ROOM_NUMBER_UNIQUE: DuplicateRoomNumberError}):
        return Room.objects.create(number=number, capacity=capacity)


def update_room(room: Room, *, capacity: int | None = None, is_active: bool | None = None) -> Room:
    fields: list[str] = []

    if is_active is False and _has_active_reservation(room):
        raise RoomInUseError()

    if capacity is not None:
        occupants = _largest_active_party(room)
        if capacity < occupants:
            raise DomainValidationError(
                "capacity",
                f"O quarto {room.number} tem reserva ativa para {occupants} pessoas.",
            )
        room.capacity = capacity
        fields.append("capacity")

    if is_active is not None:
        room.is_active = is_active
        fields.append("is_active")

    if fields:
        room.save(update_fields=fields)
    return room


class RoomInUseError(DomainError):
    code = "INVALID_STATUS"
    default_detail = "Quarto com reserva ativa não pode ser desativado."


def _has_active_reservation(room: Room) -> bool:
    return room.reservations.filter(
        status__in=[ReservationStatus.PENDING, ReservationStatus.CHECKED_IN]
    ).exists()


def _largest_active_party(room: Room) -> int:
    active = room.reservations.filter(
        status__in=[ReservationStatus.PENDING, ReservationStatus.CHECKED_IN]
    )
    return max((1 for _ in active), default=0)


def rate_table_of(policy: PricingPolicy) -> pricing.RateTable:
    return pricing.RateTable(
        weekday_rate=policy.weekday_rate,
        weekend_rate=policy.weekend_rate,
        weekday_park=policy.weekday_park,
        weekend_park=policy.weekend_park,
        late_fee_factor=policy.late_fee_factor,
        checkin_opens=policy.checkin_opens,
        checkout_limit=policy.checkout_limit,
    )


def create_policy(
    *,
    actor: AbstractBaseUser,
    now: datetime,
    weekday_rate: Decimal,
    weekend_rate: Decimal,
    weekday_park: Decimal,
    weekend_park: Decimal,
    late_fee_factor: Decimal,
    checkin_opens: time,
    checkout_limit: time,
    note: str = "",
) -> PricingPolicy:
    if checkout_limit > checkin_opens:
        raise DomainValidationError(
            "checkout_limit",
            "O limite de checkout deve ser anterior ao horário de abertura do check-in.",
        )

    return PricingPolicy.objects.create(
        weekday_rate=weekday_rate,
        weekend_rate=weekend_rate,
        weekday_park=weekday_park,
        weekend_park=weekend_park,
        late_fee_factor=late_fee_factor,
        checkin_opens=checkin_opens,
        checkout_limit=checkout_limit,
        note=note,
        effective_from=now,
        created_by=actor,
    )
