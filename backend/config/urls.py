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
from hotel.views import (
    GuestViewSet,
    PricingPolicyViewSet,
    ReservationViewSet,
    RoomViewSet,
)

router = SimpleRouter()
router.register("guests", GuestViewSet, basename="guest")
router.register("reservations", ReservationViewSet, basename="reservation")
router.register("pricing-policies", PricingPolicyViewSet, basename="pricing-policy")
router.register("rooms", RoomViewSet, basename="room")

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/health/", health, name="health"),
    # SimpleJWT nasce com permission_classes = (), senao IsAuthenticated tranca o login.
    path("api/auth/token/", ThrottledTokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("api/auth/token/refresh/", ThrottledTokenRefreshView.as_view(), name="token_refresh"),
    path("api/auth/me/", CurrentUserView.as_view(), name="current_user"),
    path("api/", include(router.urls)),
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
