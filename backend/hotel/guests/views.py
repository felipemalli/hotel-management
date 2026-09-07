from __future__ import annotations

from drf_spectacular.utils import OpenApiExample, extend_schema, extend_schema_view
from rest_framework import mixins, status, viewsets
from rest_framework.request import Request
from rest_framework.response import Response

from core.openapi import GUESTS_TAG
from core.serializers import ErrorEnvelopeSerializer
from hotel.guests import selectors
from hotel.guests import services as guests_service
from hotel.guests.models import Guest
from hotel.guests.openapi import DUPLICATE_DOCUMENT_RESPONSE, GUEST_SEARCH_PARAMETER
from hotel.guests.serializers import GuestCreateSerializer, GuestSerializer


@extend_schema(tags=[GUESTS_TAG])
@extend_schema_view(
    list=extend_schema(
        summary="Lista e busca hóspedes",
        description=(
            "`search` acha nome, documento e telefone por fragmento (trigram). "
            "Documento e telefone aceitam máscara no termo."
        ),
        parameters=[GUEST_SEARCH_PARAMETER],
        responses={200: GuestSerializer(many=True)},
    ),
    retrieve=extend_schema(
        summary="Detalhe do hóspede",
        description="Devolve o valor gravado (documento e telefone já normalizados).",
        responses={200: GuestSerializer, 404: ErrorEnvelopeSerializer},
    ),
    create=extend_schema(
        summary="Cadastra hóspede",
        description=(
            "O telefone exige o código do país com `+`: sem ele, os dígitos "
            "seriam interpretados como de outro país em silêncio. A coluna guarda "
            "apenas dígitos E.164 (`5521988887777`), e a busca por fragmento "
            "continua achando `98888`. `nationality` é ISO 3166-1 alpha-2."
        ),
        request=GuestCreateSerializer,
        responses={
            201: GuestSerializer,
            400: ErrorEnvelopeSerializer,
            409: DUPLICATE_DOCUMENT_RESPONSE,
        },
        examples=[
            OpenApiExample(
                "Cadastro mínimo do briefing",
                value={
                    "full_name": "Ana Souza",
                    "document": "123.456.789-01",
                    "phone": "+55 (21) 98888-7777",
                    "nationality": "BR",
                },
                request_only=True,
            )
        ],
    ),
)
class GuestViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    viewsets.GenericViewSet,
):
    queryset = Guest.objects.all()

    def get_queryset(self):
        if self.action == "list":
            return selectors.search_guests(self.request.query_params.get("search"))
        return Guest.objects.all()

    def get_serializer_class(self):
        if self.action == "create":
            return GuestCreateSerializer
        return GuestSerializer

    def create(self, request: Request, *args, **kwargs) -> Response:
        serializer = GuestCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        guest = guests_service.create_guest(**serializer.validated_data)
        return Response(GuestSerializer(guest).data, status=status.HTTP_201_CREATED)


__all__ = ["GuestViewSet"]
