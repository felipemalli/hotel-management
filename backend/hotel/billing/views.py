from __future__ import annotations

from django.utils import timezone
from drf_spectacular.utils import OpenApiExample, extend_schema, extend_schema_view
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.request import Request
from rest_framework.response import Response

from accounts.permissions import IsHotelAdmin
from core.openapi import PERMISSION_DENIED_RESPONSE, PRICING_TAG
from core.serializers import ErrorEnvelopeSerializer
from hotel.billing import selectors
from hotel.billing import services as billing_service
from hotel.billing.models import PricingPolicy
from hotel.billing.serializers import PricingPolicyCreateSerializer, PricingPolicySerializer


@extend_schema(tags=[PRICING_TAG])
@extend_schema_view(
    list=extend_schema(
        summary="Histórico de políticas de tarifa",
        description=(
            "Da mais recente para a mais antiga. A tabela é **append-only**: não "
            "há `PATCH` nem `DELETE` — corrigir é publicar outra linha, e o "
            "histórico continua visível."
        ),
        responses={200: PricingPolicySerializer(many=True)},
    ),
    create=extend_schema(
        summary="Publica uma política de tarifa",
        description=(
            "Restrito ao `ADMIN`. A vigência é o instante da publicação, definida "
            "pelo **servidor** — vigência retroativa reescreveria o passado de "
            "reservas já fechadas. A política rege a estadia inteira a partir do "
            "check-in que a amarrar (D15): diárias, vaga, fator da multa e limite "
            "de checkout. Horários em `HH:MM` (precisão de minuto)."
        ),
        request=PricingPolicyCreateSerializer,
        responses={
            201: PricingPolicySerializer,
            400: ErrorEnvelopeSerializer,
            403: PERMISSION_DENIED_RESPONSE,
        },
        examples=[
            OpenApiExample(
                "Valores do briefing",
                value={
                    "weekday_rate": "120.00",
                    "weekend_rate": "180.00",
                    "weekday_park": "15.00",
                    "weekend_park": "20.00",
                    "late_fee_factor": "0.5000",
                    "checkin_opens": "14:00",
                    "checkout_limit": "12:00",
                    "note": "tarifa de referência",
                },
                request_only=True,
            )
        ],
    ),
)
class PricingPolicyViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    viewsets.GenericViewSet,
):
    queryset = PricingPolicy.objects.all()

    def get_permissions(self):
        if self.action == "create":
            return [IsHotelAdmin()]
        return super().get_permissions()

    def get_serializer_class(self):
        if self.action == "create":
            return PricingPolicyCreateSerializer
        return PricingPolicySerializer

    def get_queryset(self):
        return selectors.list_policies()

    def create(self, request: Request, *args, **kwargs) -> Response:
        serializer = PricingPolicyCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        policy = billing_service.create_policy(
            **serializer.validated_data,
            actor=request.user,
            now=timezone.now(),
        )
        return Response(
            PricingPolicySerializer(policy).data,
            status=status.HTTP_201_CREATED,
        )

    @extend_schema(
        summary="Política vigente agora",
        description=(
            "O que o balcão vai cobrar neste instante. Sem política publicada, a "
            "linha do briefing (120/180/15/20, multa de 50%, 14:00/12:00) inserida "
            "pela migração de bootstrap."
        ),
        responses={200: PricingPolicySerializer, 404: ErrorEnvelopeSerializer},
    )
    @action(detail=False, methods=["get"], url_path="current")
    def current(self, request: Request) -> Response:
        policy = selectors.policy_in_force(timezone.now())
        return Response(PricingPolicySerializer(policy).data)


__all__ = ["PricingPolicyViewSet"]
