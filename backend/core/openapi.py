from __future__ import annotations

from drf_spectacular.utils import OpenApiExample, OpenApiResponse

from core.serializers import ErrorEnvelopeSerializer

GUESTS_TAG = "guests"
RESERVATIONS_TAG = "reservations"
PRICING_TAG = "pricing"
ROOMS_TAG = "rooms"

PERMISSION_DENIED_RESPONSE = OpenApiResponse(
    response=ErrorEnvelopeSerializer,
    description="Rota restrita ao `ADMIN` (`IsHotelAdmin`).",
    examples=[
        OpenApiExample(
            "PERMISSION_DENIED",
            value={
                "code": "PERMISSION_DENIED",
                "detail": "Ação restrita ao administrador do hotel.",
                "extra": {},
            },
            response_only=True,
        )
    ],
)

__all__ = [
    "GUESTS_TAG",
    "PERMISSION_DENIED_RESPONSE",
    "PRICING_TAG",
    "RESERVATIONS_TAG",
    "ROOMS_TAG",
]
