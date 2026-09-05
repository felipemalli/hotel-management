from __future__ import annotations

from drf_spectacular.utils import (
    OpenApiExample,
    OpenApiParameter,
    extend_schema,
    extend_schema_view,
)
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.request import Request
from rest_framework.response import Response

from hotel import selectors
from hotel.models import Guest
from hotel.serializers import (
    ErrorEnvelopeSerializer,
    GuestCreateSerializer,
    GuestInHotelSerializer,
    GuestPendingCheckinSerializer,
    GuestSerializer,
)
from hotel.services import guests as guests_service
from hotel.views.openapi import DUPLICATE_DOCUMENT_RESPONSE, GUESTS_TAG


GUEST_SEARCH_PARAMETER = OpenApiParameter(
    name="search",
    description="Nome, documento ou telefone, por fragmento.",
    required=False,
    type=str,
)


@extend_schema(tags=[GUESTS_TAG])
@extend_schema_view(
    list=extend_schema(
        summary="Lista e busca hóspedes",
        description=(
            "`search` acha nome, documento e telefone por fragmento (trigram, D5). "
            "Documento e telefone aceitam máscara no termo (D9)."
        ),
        parameters=[GUEST_SEARCH_PARAMETER],
        responses={200: GuestSerializer(many=True)},
    ),
    retrieve=extend_schema(
        summary="Detalhe do hóspede",
        description="Devolve o valor gravado (documento e telefone já normalizados, SPEC 2.1).",
        responses={200: GuestSerializer, 404: ErrorEnvelopeSerializer},
    ),
    create=extend_schema(
        summary="Cadastra hóspede",
        description=(
            "O telefone exige o código do país com `+` (D9): sem ele, os dígitos "
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
        if self.action == "in_hotel":
            return GuestInHotelSerializer
        if self.action == "pending_checkin":
            return GuestPendingCheckinSerializer
        return GuestSerializer

    def create(self, request: Request, *args, **kwargs) -> Response:
        serializer = GuestCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        guest = guests_service.create_guest(**serializer.validated_data)
        return Response(GuestSerializer(guest).data, status=status.HTTP_201_CREATED)

    @extend_schema(
        summary="Hóspedes que ainda estão no hotel",
        description=(
            "Reserva `CHECKED_IN` (RF4). `active_reservation` é único (SPEC 1.5). "
            "`search` compõe com a aba: mesmo termo de `GET /guests/`, sobre quem está no hotel."
        ),
        parameters=[GUEST_SEARCH_PARAMETER],
        responses={200: GuestInHotelSerializer(many=True)},
    )
    @action(detail=False, methods=["get"], url_path="in-hotel")
    def in_hotel(self, request: Request) -> Response:
        return self._paginated(
            selectors.guests_in_hotel(request.query_params.get("search")),
            GuestInHotelSerializer,
        )

    @extend_schema(
        summary="Hóspedes com reserva sem check-in",
        description=(
            "Reservas `PENDING` (RF5). Pendência vencida continua listada até "
            "ação do atendente (D14). `search` compõe com a aba: mesmo termo de "
            "`GET /guests/`, sobre quem tem check-in pendente."
        ),
        parameters=[GUEST_SEARCH_PARAMETER],
        responses={200: GuestPendingCheckinSerializer(many=True)},
    )
    @action(detail=False, methods=["get"], url_path="pending-checkin")
    def pending_checkin(self, request: Request) -> Response:
        return self._paginated(
            selectors.guests_pending_checkin(request.query_params.get("search")),
            GuestPendingCheckinSerializer,
        )

    def _paginated(self, queryset, serializer_class) -> Response:
        page = self.paginate_queryset(queryset)
        if page is not None:
            return self.get_paginated_response(serializer_class(page, many=True).data)
        return Response(serializer_class(queryset, many=True).data)
