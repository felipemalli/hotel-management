from __future__ import annotations

from django.db import transaction
from django.db.models.deletion import ProtectedError

from core.errors import DomainError, DomainValidationError, translate_integrity_error
from hotel.reservations import selectors as reservation_selectors

# Unica dependencia de uma folha do grafo de camadas para `reservations`:
# as guardas de desativacao, exclusao e de capacidade sao leituras da agenda.
# O selector encapsula os status, entao `rooms` nao conhece o ciclo de vida
# da reserva.
from hotel.rooms.models import ROOM_NUMBER_UNIQUE, Room


class DuplicateRoomNumberError(DomainError):
    code = "VALIDATION_ERROR"
    status_code = 400
    default_detail = "Dados inválidos."

    def __init__(self) -> None:
        super().__init__(extra={"number": ["Já existe um quarto com este número."]})


class RoomInUseError(DomainError):
    code = "INVALID_STATUS"
    default_detail = "Quarto com reserva ativa não pode ser desativado."


class RoomHasHistoryError(DomainError):
    code = "INVALID_STATUS"
    default_detail = "Quarto com histórico de reserva não pode ser excluído."


def create_room(*, number: str, capacity: int) -> Room:
    with translate_integrity_error({ROOM_NUMBER_UNIQUE: DuplicateRoomNumberError}):
        return Room.objects.create(number=number, capacity=capacity)


def update_room(room: Room, *, capacity: int | None = None, is_active: bool | None = None) -> Room:
    with transaction.atomic():
        # Room e a linha que este caminho compartilha com check_in e add_companions:
        # sem o lock, a leitura da agenda aqui e a escrita de la nao se enxergam, e o
        # quarto acaba desativado com hospede dentro ou menor que um grupo ja aceito.
        locked = Room.objects.select_for_update().get(pk=room.pk)
        fields: list[str] = []

        if is_active is False and reservation_selectors.active_reservations_of(locked).exists():
            raise RoomInUseError()

        if capacity is not None:
            occupants = reservation_selectors.largest_active_party(locked)
            if capacity < occupants:
                raise DomainValidationError(
                    "capacity",
                    f"O quarto {locked.number} tem reserva ativa para {occupants} pessoas.",
                )
            locked.capacity = capacity
            fields.append("capacity")

        if is_active is not None:
            locked.is_active = is_active
            fields.append("is_active")

        if fields:
            locked.save(update_fields=fields)

    return locked


def delete_room(room: Room) -> None:
    if reservation_selectors.has_reservation_history(room):
        raise RoomHasHistoryError()
    try:
        room.delete()
    except ProtectedError as exc:
        raise RoomHasHistoryError() from exc
