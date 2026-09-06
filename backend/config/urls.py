from csp.decorators import csp_exempt
from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

from accounts.views import (
    CurrentUserView,
    LoginView,
    LogoutView,
    RefreshFromCookieView,
)
from config.health import health

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/health/", health, name="health"),
    # SimpleJWT nasce com permission_classes = (), senao IsAuthenticated tranca o login.
    path("api/auth/token/", LoginView.as_view(), name="token_obtain_pair"),
    path("api/auth/token/refresh/", RefreshFromCookieView.as_view(), name="token_refresh"),
    path("api/auth/logout/", LogoutView.as_view(), name="logout"),
    path("api/auth/me/", CurrentUserView.as_view(), name="current_user"),
    # `reservations` antes de `guests`/`rooms`: as leituras cruzadas
    # (`/guests/in-hotel/`, `/guests/pending-checkin/`, `/rooms/available/`)
    # moram nele, e o detail `/guests/{pk}/` casaria `in-hotel` primeiro.
    path("api/", include("hotel.reservations.urls")),
    path("api/", include("hotel.guests.urls")),
    path("api/", include("hotel.rooms.urls")),
    path("api/", include("hotel.billing.urls")),
    path("api/ai/", include("ai.urls")),
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    # Bootstrap inline do Swagger nao passa por default-src 'self'.
    # django-csp 4: o decorador exige parenteses — a forma nua levanta RuntimeError.
    path(
        "api/docs/",
        csp_exempt()(SpectacularSwaggerView.as_view(url_name="schema")),
        name="docs",
    ),
]
