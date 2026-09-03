"""
Pecas de OpenAPI compartilhadas entre views (SPEC 4.4).

`/api/docs/` e contrato navegavel, e isso custa `@extend_schema`. Os
decoradores ficam **colados** as actions -- e o idioma do drf-spectacular e a
proximidade e o que os mantem verdadeiros. O que vem para ca e apenas o que
mais de uma view usa: respostas e exemplos de erro. Sem isso o exemplo do
envelope era copiado por rota e divergia em silencio.
"""

from __future__ import annotations

from drf_spectacular.utils import OpenApiExample, OpenApiResponse

from hotel.serializers import ErrorEnvelopeSerializer

GUESTS_TAG = "guests"
RESERVATIONS_TAG = "reservations"

DUPLICATE_DOCUMENT_RESPONSE = OpenApiResponse(
    response=ErrorEnvelopeSerializer,
    description="Documento já cadastrado (D12).",
    examples=[
        OpenApiExample(
            "DUPLICATE_DOCUMENT",
            value={
                "code": "DUPLICATE_DOCUMENT",
                "detail": "Documento já cadastrado para outro hóspede.",
                "extra": {},
            },
            response_only=True,
        )
    ],
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
    "DUPLICATE_DOCUMENT_RESPONSE",
    "GUESTS_TAG",
    "INVALID_STATUS_EXAMPLE",
    "RESERVATIONS_TAG",
    "T7_STATEMENT_EXAMPLE",
]
