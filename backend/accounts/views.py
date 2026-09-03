"""
Views de autenticacao e identidade (SPEC 2.3).

O SimpleJWT ja entrega login e refresh; aqui se acrescenta limite de taxa e a
rota que diz **quem** e o portador do token.
"""

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
    """Por IP: quem chama estas rotas ainda nao tem identidade."""

    scope = "login"


class ThrottledTokenObtainPairView(TokenObtainPairView):
    throttle_classes = [LoginRateThrottle]


class ThrottledTokenRefreshView(TokenRefreshView):
    throttle_classes = [LoginRateThrottle]


class CurrentUserSerializer(serializers.Serializer):
    """Identidade do portador do token. Sem PII e sem permissoes derivadas."""

    id = serializers.IntegerField()
    username = serializers.CharField()
    role = serializers.ChoiceField(choices=Role.choices)


class CurrentUserView(APIView):
    """`GET /api/auth/me/`.

    O access token do SimpleJWT carrega apenas `user_id`: o cliente sabe que
    esta autenticado e nao sabe como quem. Sem esta rota o frontend teria de
    inferir o papel por tentativa e erro (bater numa rota de admin e ler o
    403), ou o papel entraria como claim no token -- e claim nao expira junto
    com a mudanca de papel, so junto com o token.
    """

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
