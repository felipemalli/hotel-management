"""
Views da API (SPEC 4.2-4.4).

Views **finas** por invariante (SPEC 0.3): elas resolvem HTTP, leem o relogio
e delegam. Nenhuma view calcula dinheiro nem monta QuerySet a mao -- leitura
vem de `selectors`, mutacao e dinheiro vem de `services`.

Relogio injetavel (SPEC 0.3): a view e o unico lugar que chama
`timezone.now()`; a regra recebe `now` como parametro e por isso o teste pode
congelar o tempo sem monkeypatch de dominio.

Documentacao (SPEC 4.4): toda action custom carrega `@extend_schema` com
request, response e exemplo de erro -- `/api/docs/` e contrato navegavel.
"""

from __future__ import annotations

from django.db import IntegrityError
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
from hotel.exceptions import DuplicateDocumentError
from hotel.models import Guest, Reservation, ReservationStatus
from hotel.serializers import (
    CheckInRequestSerializer,
    ErrorEnvelopeSerializer,
    GuestCreateSerializer,
    GuestDetailSerializer,
    GuestInHotelSerializer,
    GuestPendingCheckinSerializer,
    GuestSerializer,
    ReservationCreateSerializer,
    ReservationSerializer,
    StatementSerializer,
    build_statement,
)
from hotel.services import reservations as reservations_service

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


@extend_schema(tags=[GUESTS_TAG])
@extend_schema_view(
    list=extend_schema(
        summary="Lista e busca hóspedes",
        description=(
            "PII **sempre mascarada** (SPEC 2.2). `search` acha nome por fragmento "
            "(trigram) e documento/telefone por valor exato em qualquer formatação "
            "(blind index, D5)."
        ),
        parameters=[
            OpenApiParameter(
                name="search",
                description="Nome (fragmento), documento ou telefone (valor exato).",
                required=False,
                type=str,
            )
        ],
        responses={200: GuestSerializer(many=True)},
    ),
    retrieve=extend_schema(
        summary="Detalhe do hóspede (PII completa)",
        description="Único endpoint que devolve documento e telefone sem máscara (SPEC 2.2).",
        responses={200: GuestDetailSerializer, 404: ErrorEnvelopeSerializer},
    ),
    create=extend_schema(
        summary="Cadastra hóspede",
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
                    "phone": "(21) 98888-7777",
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
    """Hóspedes (RF1, RF3, RF4, RF5). Registros imutáveis após criação (SPEC 0.1)."""

    queryset = Guest.objects.all()

    def get_queryset(self):
        if self.action == "list":
            return selectors.search_guests(self.request.query_params.get("search"))
        return Guest.objects.all()

    def get_serializer_class(self):
        if self.action == "retrieve":
            return GuestDetailSerializer
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
        try:
            guest = serializer.save()
        except IntegrityError as exc:
            # Corrida entre dois cadastros do mesmo documento: a constraint
            # unica de `document_hash` e a autoridade final (D12).
            raise DuplicateDocumentError from exc
        # Resposta mascarada, como toda listagem (SPEC 4.3).
        return Response(GuestSerializer(guest).data, status=status.HTTP_201_CREATED)

    @extend_schema(
        summary="Hóspedes que ainda estão no hotel",
        description="Reserva `CHECKED_IN` (RF4). `active_reservation` é único (SPEC 1.5).",
        responses={200: GuestInHotelSerializer(many=True)},
    )
    @action(detail=False, methods=["get"], url_path="in-hotel")
    def in_hotel(self, request: Request) -> Response:
        return self._paginated(selectors.guests_in_hotel(), GuestInHotelSerializer)

    @extend_schema(
        summary="Hóspedes com reserva sem check-in",
        description=(
            "Reservas `PENDING` (RF5). Pendência vencida continua listada até "
            "ação do atendente (D14)."
        ),
        responses={200: GuestPendingCheckinSerializer(many=True)},
    )
    @action(detail=False, methods=["get"], url_path="pending-checkin")
    def pending_checkin(self, request: Request) -> Response:
        return self._paginated(selectors.guests_pending_checkin(), GuestPendingCheckinSerializer)

    def _paginated(self, queryset, serializer_class) -> Response:
        page = self.paginate_queryset(queryset)
        if page is not None:
            return self.get_paginated_response(serializer_class(page, many=True).data)
        return Response(serializer_class(queryset, many=True).data)


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
        reservation = serializer.save()
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
        examples=[
            OpenApiExample(
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
        ],
    )
    @action(detail=True, methods=["post"], url_path="checkout")
    def checkout(self, request: Request, pk: str | None = None) -> Response:
        reservation = self.get_object()
        bill = reservations_service.check_out(reservation, now=timezone.now())
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
