"""
Views de reservas e transicoes (SPEC 4.2-4.4).

Relogio injetavel (SPEC 0.3): a view e o unico lugar que chama
`timezone.now()` / `timezone.localdate()`; a regra recebe `now`/`today` como
parametro e por isso o teste pode congelar o tempo sem monkeypatch de dominio.
"""

from __future__ import annotations

from django.utils import timezone
from drf_spectacular.utils import (
    OpenApiExample,
    OpenApiParameter,
    OpenApiResponse,
    extend_schema,
    extend_schema_view,
)
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.request import Request
from rest_framework.response import Response

from hotel import selectors
from hotel.models import Reservation, ReservationStatus
from hotel.serializers import (
    CheckInRequestSerializer,
    ErrorEnvelopeSerializer,
    ReservationCreateSerializer,
    ReservationSerializer,
    StatementSerializer,
    build_statement,
)
from hotel.services import reservations as reservations_service
from hotel.views.openapi import (
    INVALID_STATUS_EXAMPLE,
    RESERVATIONS_TAG,
    T7_STATEMENT_EXAMPLE,
)


@extend_schema(tags=[RESERVATIONS_TAG])
@extend_schema_view(
    list=extend_schema(
        summary="Lista reservas",
        parameters=[
            OpenApiParameter(
                name="status",
                description="Filtra por status.",
                required=False,
                enum=[choice.value for choice in ReservationStatus],
            ),
            OpenApiParameter(
                name="guest",
                description="Filtra por id de hóspede.",
                required=False,
                type=int,
            ),
        ],
        responses={200: ReservationSerializer(many=True), 400: ErrorEnvelopeSerializer},
    ),
    retrieve=extend_schema(
        summary="Detalhe da reserva",
        responses={200: ReservationSerializer, 404: ErrorEnvelopeSerializer},
    ),
    create=extend_schema(
        summary="Cria reserva",
        description=(
            "Nasce `PENDING` com campos financeiros `null`. Exige `checkout_date > "
            "checkin_date` (D13) e `checkin_date >= hoje` local (D11)."
        ),
        request=ReservationCreateSerializer,
        responses={201: ReservationSerializer, 400: ErrorEnvelopeSerializer},
        examples=[
            OpenApiExample(
                "Reserva de 3 noites com vaga",
                value={
                    "guest_id": 1,
                    "checkin_date": "2026-09-05",
                    "checkout_date": "2026-09-08",
                    "has_vehicle": True,
                },
                request_only=True,
            )
        ],
    ),
)
class ReservationViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    viewsets.GenericViewSet,
):
    """Reservas e transições de status (RF2, RF6, RF7)."""

    queryset = Reservation.objects.select_related("guest")

    def get_serializer_class(self):
        if self.action == "create":
            return ReservationCreateSerializer
        return ReservationSerializer

    def get_queryset(self):
        if self.action != "list":
            return Reservation.objects.select_related("guest")
        return selectors.list_reservations(
            status=self._status_filter(),
            guest_id=self._guest_filter(),
        )

    def _status_filter(self) -> str | None:
        raw = self.request.query_params.get("status")
        if not raw:
            return None
        if raw not in ReservationStatus.values:
            raise serializers.ValidationError(
                {"status": [f"Status inválido. Use um de: {', '.join(ReservationStatus.values)}."]}
            )
        return raw

    def _guest_filter(self) -> int | None:
        raw = self.request.query_params.get("guest")
        if not raw:
            return None
        try:
            return int(raw)
        except ValueError:
            raise serializers.ValidationError(
                {"guest": ["Informe o id numérico do hóspede."]}
            ) from None

    def create(self, request: Request, *args, **kwargs) -> Response:
        serializer = ReservationCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        reservation = reservations_service.create_reservation(
            **serializer.validated_data,
            today=timezone.localdate(),  # relogio injetado (SPEC 0.3)
        )
        return Response(
            ReservationSerializer(reservation).data,
            status=status.HTTP_201_CREATED,
        )

    @extend_schema(
        summary="Efetiva o check-in",
        description=(
            "Antes das 14:00 locais responde `409 EARLY_CHECKIN` com o horário do "
            "servidor — alerta, não bloqueio (D4). O atendente reenvia com "
            "`allow_early: true` para confirmar."
        ),
        request=CheckInRequestSerializer,
        responses={
            200: ReservationSerializer,
            409: OpenApiResponse(
                response=ErrorEnvelopeSerializer,
                description="Check-in antecipado (D4) ou transição ilegal (SPEC 1.5).",
                examples=[
                    OpenApiExample(
                        "EARLY_CHECKIN",
                        value={
                            "code": "EARLY_CHECKIN",
                            "detail": "Check-in permitido a partir das 14:00.",
                            "extra": {"server_time": "13:45"},
                        },
                        response_only=True,
                    ),
                    INVALID_STATUS_EXAMPLE,
                ],
            ),
            404: ErrorEnvelopeSerializer,
        },
    )
    @action(detail=True, methods=["post"], url_path="check-in")
    def check_in(self, request: Request, pk: str | None = None) -> Response:
        reservation = self.get_object()
        payload = CheckInRequestSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        reservations_service.check_in(
            reservation,
            now=timezone.now(),  # relogio injetado (SPEC 0.3)
            allow_early=payload.validated_data["allow_early"],
        )
        return Response(ReservationSerializer(reservation).data)

    @extend_schema(
        summary="Efetiva o checkout e devolve o extrato",
        description=(
            "Exige `CHECKED_IN`. Congela os totais na mesma transação; duplo "
            "checkout responde `409 INVALID_STATUS`. O extrato é calculado pelos "
            "fatos reais (D6) por `services/pricing.py` — a view não faz dinheiro."
        ),
        request=None,
        responses={
            200: StatementSerializer,
            409: OpenApiResponse(
                response=ErrorEnvelopeSerializer,
                description="Reserva não está `CHECKED_IN` (SPEC 1.5).",
                examples=[INVALID_STATUS_EXAMPLE],
            ),
            404: ErrorEnvelopeSerializer,
        },
        examples=[T7_STATEMENT_EXAMPLE],
    )
    @action(detail=True, methods=["post"], url_path="checkout")
    def checkout(self, request: Request, pk: str | None = None) -> Response:
        reservation = self.get_object()
        bill = reservations_service.check_out(reservation, now=timezone.now())
        return Response(StatementSerializer(build_statement(reservation, bill)).data)

    @extend_schema(
        summary="2ª via do extrato de uma reserva finalizada",
        description=(
            "RN6 exige o extrato **durante** o checkout, e o POST acima cumpre isso. "
            "Esta rota cobre a operação de balcão: o atendente fechou o modal e o "
            "hóspede quer o recibo de novo. Não guarda estado novo — recomputa dos "
            "fatos congelados (SPEC 1.3), então o valor confere com `total_amount`. "
            "Reserva que ainda não fez checkout responde `409 INVALID_STATUS`."
        ),
        responses={
            200: StatementSerializer,
            409: OpenApiResponse(
                response=ErrorEnvelopeSerializer,
                description="Reserva ainda não finalizada.",
                examples=[INVALID_STATUS_EXAMPLE],
            ),
            404: ErrorEnvelopeSerializer,
        },
    )
    @action(detail=True, methods=["get"], url_path="statement")
    def statement(self, request: Request, pk: str | None = None) -> Response:
        reservation = self.get_object()
        bill = reservations_service.statement(reservation)
        return Response(StatementSerializer(build_statement(reservation, bill)).data)

    @extend_schema(
        summary="Cancela uma reserva pendente",
        description="`PENDING -> CANCELLED`. Nenhum outro estado cancela (D8).",
        request=None,
        responses={
            200: ReservationSerializer,
            409: OpenApiResponse(
                response=ErrorEnvelopeSerializer,
                description="Reserva não está `PENDING` (D8).",
                examples=[INVALID_STATUS_EXAMPLE],
            ),
            404: ErrorEnvelopeSerializer,
        },
    )
    @action(detail=True, methods=["post"], url_path="cancel")
    def cancel(self, request: Request, pk: str | None = None) -> Response:
        reservation = self.get_object()
        reservations_service.cancel(reservation)
        return Response(ReservationSerializer(reservation).data)
