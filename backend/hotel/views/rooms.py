"""
Views do inventario de quartos (SPEC 4.2-4.4).

Leitura para qualquer autenticado -- o atendente escolhe o quarto no balcao.
Escrita so para `IsHotelAdmin`. Sem `DELETE`: a FK e `PROTECT` e o quarto
carrega historico; tirar de operacao e `PATCH is_active=false`.
"""

from __future__ import annotations

from django.utils import timezone
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

from accounts.permissions import IsHotelAdmin
from hotel import selectors
from hotel.models import Room
from hotel.serializers import (
    ErrorEnvelopeSerializer,
    RoomAvailabilityQuerySerializer,
    RoomCreateSerializer,
    RoomSerializer,
    RoomUpdateSerializer,
)
from hotel.services import catalog as catalog_service
from hotel.views.openapi import PERMISSION_DENIED_RESPONSE, ROOMS_TAG


@extend_schema(tags=[ROOMS_TAG])
@extend_schema_view(
    list=extend_schema(
        summary="Lista quartos",
        parameters=[
            OpenApiParameter(
                name="is_active",
                description="`false` inclui os fora de operação. Sem o parâmetro, só os ativos.",
                required=False,
                type=bool,
            )
        ],
        responses={200: RoomSerializer(many=True)},
    ),
    retrieve=extend_schema(
        summary="Detalhe do quarto",
        responses={200: RoomSerializer, 404: ErrorEnvelopeSerializer},
    ),
    create=extend_schema(
        summary="Cadastra um quarto",
        description="Restrito ao `ADMIN`. Número duplicado responde `400` no campo.",
        request=RoomCreateSerializer,
        responses={
            201: RoomSerializer,
            400: ErrorEnvelopeSerializer,
            403: PERMISSION_DENIED_RESPONSE,
        },
        examples=[
            OpenApiExample(
                "Quarto triplo",
                value={"number": "301", "capacity": 3},
                request_only=True,
            )
        ],
    ),
    partial_update=extend_schema(
        summary="Ajusta capacidade ou operação",
        description=(
            "Restrito ao `ADMIN`. `number` não muda — renumerar quarto é mudar de "
            "quarto, e o histórico aponta para o número antigo. Desativar um quarto "
            "com reserva ativa responde `409 INVALID_STATUS`; reduzir a capacidade "
            "abaixo de uma reserva já aceita responde `400` em `capacity`."
        ),
        request=RoomUpdateSerializer,
        responses={
            200: RoomSerializer,
            400: ErrorEnvelopeSerializer,
            403: PERMISSION_DENIED_RESPONSE,
            409: ErrorEnvelopeSerializer,
        },
    ),
)
class RoomViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    viewsets.GenericViewSet,
):
    """Inventário de quartos (E1)."""

    queryset = Room.objects.all()
    serializer_class = RoomSerializer

    def get_permissions(self):
        if self.action in {"create", "partial_update"}:
            return [IsHotelAdmin()]
        return super().get_permissions()

    def get_queryset(self):
        if self.action != "list":
            return Room.objects.all()
        raw = self.request.query_params.get("is_active")
        return selectors.list_rooms(active_only=raw is None or raw.lower() != "false")

    def create(self, request: Request, *args, **kwargs) -> Response:
        serializer = RoomCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        room = catalog_service.create_room(**serializer.validated_data)
        return Response(RoomSerializer(room).data, status=status.HTTP_201_CREATED)

    def partial_update(self, request: Request, *args, **kwargs) -> Response:
        room = self.get_object()
        payload = RoomUpdateSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        updated = catalog_service.update_room(room, **payload.validated_data)
        return Response(RoomSerializer(updated).data)

    @extend_schema(
        summary="Quartos disponíveis para um período",
        description=(
            "Ativos, com capacidade suficiente e sem reserva ativa cruzando o "
            "intervalo. Quando o período começa hoje ou antes, quartos com hóspede "
            "ainda dentro (`CHECKED_IN` de qualquer data) também saem da lista — "
            "a agenda pode ter liberado, o quarto não (D6/D7/D14)."
        ),
        parameters=[RoomAvailabilityQuerySerializer],
        responses={200: RoomSerializer(many=True), 400: ErrorEnvelopeSerializer},
    )
    @action(detail=False, methods=["get"], url_path="available")
    def available(self, request: Request) -> Response:
        query = RoomAvailabilityQuerySerializer(data=request.query_params)
        query.is_valid(raise_exception=True)
        rooms = selectors.available_rooms(
            **query.validated_data,
            today=timezone.localdate(),  # relogio injetado (SPEC 0.3)
        )
        page = self.paginate_queryset(rooms)
        if page is not None:
            return self.get_paginated_response(RoomSerializer(page, many=True).data)
        return Response(RoomSerializer(rooms, many=True).data)


__all__ = ["RoomViewSet"]
