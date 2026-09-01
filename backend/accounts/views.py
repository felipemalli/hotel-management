"""
Views de autenticacao (SPEC 2.3).

O SimpleJWT ja entrega o comportamento; aqui so se acrescenta limite de taxa.
Sem ele, `/api/auth/token/` aceita tentativas ilimitadas de senha sem qualquer
atraso -- e o endpoint e anonimo, logo nao ha nada mais barrando forca bruta.
"""

from rest_framework.throttling import AnonRateThrottle
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView


class LoginRateThrottle(AnonRateThrottle):
    """Por IP: quem chama estas rotas ainda nao tem identidade."""

    scope = "login"


class ThrottledTokenObtainPairView(TokenObtainPairView):
    throttle_classes = [LoginRateThrottle]


class ThrottledTokenRefreshView(TokenRefreshView):
    throttle_classes = [LoginRateThrottle]
