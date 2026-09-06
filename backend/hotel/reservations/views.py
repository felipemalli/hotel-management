from __future__ import annotations

from django.utils import timezone
from drf_spectacular.utils import (
    OpenApiExample,
    OpenApiParameter,
    OpenApiResponse,
    extend_schema,
    extend_schema_view,
)
from rest_framework import generics, mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.request import Request
from rest_framework.response import Response

from core.openapi import GUESTS_TAG, RESERVATIONS_TAG, ROOMS_TAG
from core.serializers import ErrorEnvelopeSerializer
from hotel.guests.openapi import GUEST_SEARCH_PARAMETER
from hotel.reservations import selectors
from hotel.reservations import services as reservations_service
from hotel.reservations.models import ReservationStatus
from hotel.reservations.openapi import (
    INVALID_STATUS_EXAMPLE,
    ROOM_UNAVAILABLE_EXAMPLE,
    T7_STATEMENT_EXAMPLE,
)
from hotel.reservations.serializers import (
    CheckInRequestSerializer,
    GuestInHotelSerializer,
    GuestPendingCheckinSerializer,
    PaymentRequestSerializer,
    ReservationCreateSerializer,
    ReservationListQuerySerializer,
    ReservationSerializer,
    RoomAvailabilityQuerySerializer,
    StatementSerializer,
    build_statement,
)
from hotel.rooms.serializers import RoomSerializer


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
            OpenApiParameter(
                name="paid",
                description="`true` só contas pagas, `false` só em aberto.",
                required=False,
                type=bool,
            ),
            OpenApiParameter(
                name="search",
                description="Nº da reserva (com ou sem '#'), titular ou quarto, por fragmento.",
                required=False,
                type=str,
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
        responses={
            201: ReservationSerializer,
            400: ErrorEnvelopeSerializer,
            409: OpenApiResponse(
                response=ErrorEnvelopeSerializer,
                description="Quarto sem disponibilidade no período (D16).",
                examples=[ROOM_UNAVAILABLE_EXAMPLE],
            ),
        },
        examples=[
            OpenApiExample(
                "Reserva de 3 noites com vaga",
                value={
                    "guest_id": 1,
                    "room_id": 1,
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
    queryset = selectors.reservation_queryset()

    def get_serializer_class(self):
        if self.action == "create":
            return ReservationCreateSerializer
        return ReservationSerializer

    def get_queryset(self):
        base = selectors.reservation_queryset()
        if self.action != "list":
            return base
        query = ReservationListQuerySerializer(data=self.request.query_params)
        query.is_valid(raise_exception=True)
        return selectors.list_reservations(
            status=query.validated_data.get("status"),
            guest_id=query.validated_data.get("guest"),
            paid=query.validated_data.get("paid"),
            search=query.validated_data.get("search"),
        )

    def create(self, request: Request, *args, **kwargs) -> Response:
        serializer = ReservationCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        reservation = reservations_service.create_reservation(
            **serializer.validated_data,
            actor=request.user,
            today=timezone.localdate(),
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
            "`allow_early: true` para confirmar. Quarto ainda ocupado, ou chegada "
            "antecipada que tomaria o quarto de outra reserva, respondem "
            "`409 ROOM_UNAVAILABLE` (D7/D16)."
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
                    ROOM_UNAVAILABLE_EXAMPLE,
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
            now=timezone.now(),
            actor=request.user,
            allow_early=payload.validated_data["allow_early"],
        )
        return Response(ReservationSerializer(reservation).data)

    @extend_schema(
        summary="Efetiva o checkout e devolve o extrato",
        description=(
            "Exige `CHECKED_IN`. Congela os totais na mesma transação; duplo "
            "checkout responde `409 INVALID_STATUS`. O extrato é calculado pelos "
            "fatos reais (D6) por `hotel/billing/engine.py` — a view não faz dinheiro."
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
        bill = reservations_service.check_out(reservation, now=timezone.now(), actor=request.user)
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
        summary="Registra o pagamento da conta",
        description=(
            "Pagamento **único e integral** (D18): não há valor no payload, nem "
            "pagamento parcial, nem estorno. Exige `CHECKED_OUT` — só se paga o "
            "que foi fechado. Pagar duas vezes responde `409 INVALID_STATUS` com "
            "`extra.paid_at`: é uma operação ilegal para o estado atual do "
            "recurso, não um código de erro próprio. Devolve o extrato com o "
            "pagamento preenchido."
        ),
        request=PaymentRequestSerializer,
        responses={
            200: StatementSerializer,
            400: ErrorEnvelopeSerializer,
            409: OpenApiResponse(
                response=ErrorEnvelopeSerializer,
                description="Reserva não finalizada, ou conta já paga.",
                examples=[
                    OpenApiExample(
                        "ALREADY_PAID",
                        value={
                            "code": "INVALID_STATUS",
                            "detail": "Esta conta já foi paga.",
                            "extra": {"paid_at": "2025-03-09T12:30:00-03:00"},
                        },
                        response_only=True,
                    ),
                    INVALID_STATUS_EXAMPLE,
                ],
            ),
            404: ErrorEnvelopeSerializer,
        },
    )
    @action(detail=True, methods=["post"], url_path="pay")
    def pay(self, request: Request, pk: str | None = None) -> Response:
        reservation = self.get_object()
        payload = PaymentRequestSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        reservations_service.mark_paid(
            reservation,
            now=timezone.now(),
            actor=request.user,
            payment_method=payload.validated_data["payment_method"],
        )
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
        reservations_service.cancel(reservation, now=timezone.now(), actor=request.user)
        return Response(ReservationSerializer(reservation).data)


# As tres leituras a seguir sao sobre a agenda, nao sobre o cadastro: quem esta
# no hotel e quais quartos estao livres so existem porque ha reservas. Ficam
# aqui, com URL e operationId inalterados, para que `guests` e `rooms` sigam
# folhas do grafo.
@extend_schema(
    tags=[GUESTS_TAG],
    summary="Hóspedes que ainda estão no hotel",
    description=(
        "Reserva `CHECKED_IN` (RF4). `active_reservation` é único (SPEC 1.5). "
        "`search` compõe com a aba: mesmo termo de `GET /guests/`, sobre quem está no hotel."
    ),
    parameters=[GUEST_SEARCH_PARAMETER],
    responses={200: GuestInHotelSerializer(many=True)},
)
class GuestsInHotelView(generics.ListAPIView):
    serializer_class = GuestInHotelSerializer

    def get_queryset(self):
        return selectors.guests_in_hotel(self.request.query_params.get("search"))


@extend_schema(
    tags=[GUESTS_TAG],
    summary="Hóspedes com reserva sem check-in",
    description=(
        "Reservas `PENDING` (RF5). Pendência vencida continua listada até "
        "ação do atendente (D14). `search` compõe com a aba: mesmo termo de "
        "`GET /guests/`, sobre quem tem check-in pendente."
    ),
    parameters=[GUEST_SEARCH_PARAMETER],
    responses={200: GuestPendingCheckinSerializer(many=True)},
)
class GuestsPendingCheckinView(generics.ListAPIView):
    serializer_class = GuestPendingCheckinSerializer

    def get_queryset(self):
        return selectors.guests_pending_checkin(self.request.query_params.get("search"))


@extend_schema(
    tags=[ROOMS_TAG],
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
class AvailableRoomsView(generics.ListAPIView):
    serializer_class = RoomSerializer

    def get_queryset(self):
        query = RoomAvailabilityQuerySerializer(data=self.request.query_params)
        query.is_valid(raise_exception=True)
        return selectors.available_rooms(
            **query.validated_data,
            today=timezone.localdate(),
        )


__all__ = [
    "AvailableRoomsView",
    "GuestsInHotelView",
    "GuestsPendingCheckinView",
    "ReservationViewSet",
]
