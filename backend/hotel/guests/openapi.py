from __future__ import annotations

from drf_spectacular.utils import OpenApiExample, OpenApiParameter, OpenApiResponse

from core.serializers import ErrorEnvelopeSerializer

GUEST_SEARCH_PARAMETER = OpenApiParameter(
    name="search",
    description="Nome, documento ou telefone, por fragmento.",
    required=False,
    type=str,
)

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

__all__ = ["DUPLICATE_DOCUMENT_RESPONSE", "GUEST_SEARCH_PARAMETER"]
