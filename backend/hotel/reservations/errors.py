from __future__ import annotations

from core.errors import DomainError


class ReservationError(DomainError):
    code = "INVALID_STATUS"
    default_detail = "Operação inválida para esta reserva."


class InvalidStatusError(ReservationError):
    code = "INVALID_STATUS"
    default_detail = "Transição de status inválida."


class RoomUnavailableError(ReservationError):
    code = "ROOM_UNAVAILABLE"
    default_detail = "Quarto indisponível para o período."


class EarlyCheckinError(ReservationError):
    code = "EARLY_CHECKIN"
    default_detail = "Check-in permitido a partir das 14:00."
