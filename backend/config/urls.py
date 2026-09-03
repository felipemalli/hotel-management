"""
Rotas raiz (SPEC 4.2).

Base `/api/`. Tudo autenticado por JWT, exceto as quatro rotas abertas por
decisao explicita da SPEC 2.3: `/api/auth/token/`, `/api/auth/token/refresh/`,
`/api/health/` e o par `/api/schema/` + `/api/docs/`.
"""

from csp.decorators import csp_exempt
from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView
from rest_framework.routers import SimpleRouter

from accounts.views import (
    CurrentUserView,
    ThrottledTokenObtainPairView,
    ThrottledTokenRefreshView,
)
from config.health import health
from hotel.views import GuestViewSet, ReservationViewSet

router = SimpleRouter()
router.register("guests", GuestViewSet, basename="guest")
router.register("reservations", ReservationViewSet, basename="reservation")

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/health/", health, name="health"),
    # SimpleJWT nasce com `permission_classes = ()`, logo a permissao global
    # IsAuthenticated (SPEC 2.3) nao tranca a propria porta de entrada.
    path("api/auth/token/", ThrottledTokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("api/auth/token/refresh/", ThrottledTokenRefreshView.as_view(), name="token_refresh"),
    path("api/auth/me/", CurrentUserView.as_view(), name="current_user"),
    path("api/", include(router.urls)),
    # Feature opcional da SPEC 7. Esta linha e a unica amarra do app `ai/` ao
    # projeto: apaga-la (com o proprio pacote) e o corte limpo da SPEC 8.4/C1.
    path("api/ai/", include("ai.urls")),
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    # O bootstrap inline da pagina de docs nao passa por `default-src 'self'`:
    # excecao pontual de CSP nesta view (SPEC 2.4, V2). No django-csp 4 o
    # decorador exige parenteses -- a forma nua levanta RuntimeError.
    path(
        "api/docs/",
        csp_exempt()(SpectacularSwaggerView.as_view(url_name="schema")),
        name="docs",
    ),
]
