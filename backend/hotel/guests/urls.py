from __future__ import annotations

from rest_framework.routers import SimpleRouter

from hotel.guests.views import GuestViewSet

router = SimpleRouter()
router.register("guests", GuestViewSet, basename="guest")

urlpatterns = router.urls
