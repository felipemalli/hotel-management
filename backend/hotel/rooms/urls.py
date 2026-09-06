from __future__ import annotations

from rest_framework.routers import SimpleRouter

from hotel.rooms.views import RoomViewSet

router = SimpleRouter()
router.register("rooms", RoomViewSet, basename="room")

urlpatterns = router.urls
