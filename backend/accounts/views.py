from __future__ import annotations

from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from accounts.models import Role


class LoginRateThrottle(AnonRateThrottle):
    scope = "login"


class ThrottledTokenObtainPairView(TokenObtainPairView):
    throttle_classes = [LoginRateThrottle]


class ThrottledTokenRefreshView(TokenRefreshView):
    throttle_classes = [LoginRateThrottle]


class CurrentUserSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    username = serializers.CharField()
    role = serializers.ChoiceField(choices=Role.choices)


class CurrentUserView(APIView):
    """O access token do SimpleJWT so carrega user_id; esta rota diz quem e o portador."""

    @extend_schema(
        tags=["auth"],
        summary="Identidade do usuário autenticado",
        description=(
            "Devolve `id`, `username` e `role`. O papel define quais rotas "
            "administrativas o cliente pode oferecer na interface."
        ),
        responses={200: CurrentUserSerializer},
    )
    def get(self, request: Request) -> Response:
        return Response(CurrentUserSerializer(request.user).data)
