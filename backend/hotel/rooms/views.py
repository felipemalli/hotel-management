from __future__ import annotations

from drf_spectacular.utils import (
    OpenApiExample,
    OpenApiParameter,
    extend_schema,
    extend_schema_view,
)
from rest_framework import mixins, status, viewsets
from rest_framework.request import Request
from rest_framework.response import Response

from accounts.permissions import IsHotelAdmin
from core.openapi import PERMISSION_DENIED_RESPONSE, ROOMS_TAG
from core.serializers import ErrorEnvelopeSerializer
from hotel.models import Room
from hotel.rooms import selectors
from hotel.rooms import services as catalog_service
from hotel.rooms.serializers import RoomCreateSerializer, RoomSerializer, RoomUpdateSerializer


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
            ),
            OpenApiParameter(
                name="search",
                description="Número do quarto, por fragmento.",
                required=False,
                type=str,
            ),
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
        return selectors.list_rooms(
            active_only=raw is None or raw.lower() != "false",
            search=self.request.query_params.get("search"),
        )

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


__all__ = ["RoomViewSet"]
