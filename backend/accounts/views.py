from __future__ import annotations

from typing import Any

from django.middleware.csrf import rotate_token
from drf_spectacular.utils import OpenApiResponse, extend_schema, inline_serializer
from rest_framework import serializers, status
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from accounts.cookies import delete_refresh_cookie, read_refresh_cookie, set_refresh_cookie
from accounts.csrf import enforce_csrf
from accounts.models import Role

AUTH_TAG = "auth"

ERROR_ENVELOPE = inline_serializer(
    name="AuthErrorEnvelope",
    fields={
        "code": serializers.CharField(),
        "detail": serializers.CharField(),
        "extra": serializers.DictField(),
    },
)

CSRF_FAILED_RESPONSE = OpenApiResponse(
    response=ERROR_ENVELOPE,
    description=(
        "`CSRF_FAILED`. A rota se autentica pelo cookie, então exige o header "
        "`X-CSRFToken` com o valor do cookie `csrftoken`."
    ),
)


class LoginRateThrottle(AnonRateThrottle):
    scope = "login"


class RefreshRateThrottle(AnonRateThrottle):
    scope = "refresh"


class CurrentUserSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    username = serializers.CharField()
    role = serializers.ChoiceField(choices=Role.choices)


class AccessTokenSerializer(serializers.Serializer):
    access = serializers.CharField()


@extend_schema(
    tags=[AUTH_TAG],
    summary="Login",
    description=(
        "Devolve o `access` no corpo e entrega o **refresh em cookie `HttpOnly`** "
        "(`Secure`, `SameSite=Strict`, `Path=/api/auth/`) — fora do alcance de um "
        "XSS. O cookie `csrftoken` acompanha a resposta: é dele que o cliente "
        "monta o header `X-CSRFToken` das rotas de sessão."
    ),
    responses={
        200: AccessTokenSerializer,
        401: OpenApiResponse(response=ERROR_ENVELOPE, description="`NOT_AUTHENTICATED`."),
        429: OpenApiResponse(response=ERROR_ENVELOPE, description="`THROTTLED`."),
    },
)
class LoginView(TokenObtainPairView):
    throttle_classes = [LoginRateThrottle]

    def post(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        response = super().post(request, *args, **kwargs)
        if response.status_code == status.HTTP_200_OK:
            set_refresh_cookie(response, response.data.pop("refresh"))
            rotate_token(request)
        return response


@extend_schema(
    tags=[AUTH_TAG],
    summary="Renova o access a partir do cookie",
    description=(
        "Não recebe corpo: o refresh vem do cookie `HttpOnly`. O `exp` carimbado no "
        "login é o teto absoluto da sessão — renovar devolve um access novo e não "
        "estende o prazo. Um refresh revogado pelo logout encontra a denylist."
    ),
    request=None,
    responses={
        200: AccessTokenSerializer,
        401: OpenApiResponse(
            response=ERROR_ENVELOPE,
            description="`NOT_AUTHENTICATED`: sem cookie, token revogado ou sessão vencida.",
        ),
        403: CSRF_FAILED_RESPONSE,
    },
)
class RefreshFromCookieView(TokenRefreshView):
    throttle_classes = [RefreshRateThrottle]

    def post(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        enforce_csrf(request)

        raw = read_refresh_cookie(request)
        if raw is None:
            raise InvalidToken("Nenhuma sessão para renovar.")

        # Vencido, revogado pelo logout ou forjado: o SimpleJWT recusa na decodificacao.
        serializer = self.get_serializer(data={"refresh": raw})
        try:
            serializer.is_valid(raise_exception=True)
        except TokenError as error:
            raise InvalidToken(error.args[0]) from error

        return Response(serializer.validated_data, status=status.HTTP_200_OK)

    def finalize_response(self, request: Request, response: Response, *args: Any, **kwargs: Any):
        response = super().finalize_response(request, response, *args, **kwargs)
        # Recusado é fim de sessão: sem apagar, o navegador reenvia um token morto para sempre.
        if response.status_code == status.HTTP_401_UNAUTHORIZED:
            delete_refresh_cookie(response)
        return response


@extend_schema(
    tags=[AUTH_TAG],
    summary="Encerra a sessão",
    description=(
        "Revoga o refresh do cookie na denylist e apaga o cookie. É o único ponto "
        "em que a sessão morre no **servidor**: limpar o cliente deixaria o refresh "
        "válido até o fim da vida dele. Idempotente."
    ),
    request=None,
    responses={204: None, 403: CSRF_FAILED_RESPONSE},
)
class LogoutView(APIView):
    # A posse do cookie é a credencial: um access vencido não pode impedir o sign-out.
    authentication_classes = ()
    permission_classes = (AllowAny,)

    def post(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        enforce_csrf(request)

        raw = read_refresh_cookie(request)
        if raw is not None:
            try:
                RefreshToken(raw).blacklist()
            except TokenError:
                pass

        response = Response(status=status.HTTP_204_NO_CONTENT)
        delete_refresh_cookie(response)
        return response


class CurrentUserView(APIView):
    """O access token do SimpleJWT so carrega user_id; esta rota diz quem e o portador."""

    @extend_schema(
        tags=[AUTH_TAG],
        summary="Identidade do usuário autenticado",
        description=(
            "Devolve `id`, `username` e `role`. O papel define quais rotas "
            "administrativas o cliente pode oferecer na interface."
        ),
        responses={200: CurrentUserSerializer},
    )
    def get(self, request: Request) -> Response:
        return Response(CurrentUserSerializer(request.user).data)
