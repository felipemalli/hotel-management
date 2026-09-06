from __future__ import annotations

from drf_spectacular.utils import OpenApiExample

ROOM_UNAVAILABLE_EXAMPLE = OpenApiExample(
    "ROOM_UNAVAILABLE",
    value={
        "code": "ROOM_UNAVAILABLE",
        "detail": "Quarto 101 indisponível no período solicitado.",
        "extra": {
            "room_id": 1,
            "conflicting_reservation_id": 7,
            "conflicting_status": "PENDING",
            "conflicting_checkin_date": "2026-09-05",
        },
    },
    response_only=True,
)

INVALID_STATUS_EXAMPLE = OpenApiExample(
    "INVALID_STATUS",
    value={
        "code": "INVALID_STATUS",
        "detail": "Transição inválida: CHECKED_OUT -> CHECKED_OUT.",
        "extra": {"status": "CHECKED_OUT"},
    },
    response_only=True,
)

T7_STATEMENT_EXAMPLE = OpenApiExample(
    "Extrato do caso T7 (SPEC 3.3)",
    value={
        "reservation_id": 7,
        "guest": {"id": 1, "full_name": "Ana Souza"},
        "checked_in_at": "2025-03-07T15:00:00-03:00",
        "checked_out_at": "2025-03-09T12:01:00-03:00",
        "lines": [
            {
                "date": "2025-03-07",
                "weekday": "sexta-feira",
                "daily_rate": "120.00",
                "parking_fee": "15.00",
            },
            {
                "date": "2025-03-08",
                "weekday": "sábado",
                "daily_rate": "180.00",
                "parking_fee": "20.00",
            },
        ],
        "subtotal_daily": "300.00",
        "subtotal_parking": "35.00",
        "late_fee": {"applied": True, "base_rate": "180.00", "amount": "90.00"},
        "total": "425.00",
    },
    response_only=True,
)

__all__ = [
    "INVALID_STATUS_EXAMPLE",
    "ROOM_UNAVAILABLE_EXAMPLE",
    "T7_STATEMENT_EXAMPLE",
]
