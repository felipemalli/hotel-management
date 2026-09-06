from __future__ import annotations

from django.urls import path
from rest_framework.routers import SimpleRouter

from hotel.reservations.views import (
    AvailableRoomsView,
    GuestsInHotelView,
    GuestsPendingCheckinView,
    ReservationViewSet,
)

router = SimpleRouter()
router.register("reservations", ReservationViewSet, basename="reservation")

# Estes tres paths tem de ser incluidos ANTES dos routers de guests e rooms:
# o detail `/guests/{pk}/` casa `[^/.]+` e engoliria `/guests/in-hotel/`.
urlpatterns = [
    path("guests/in-hotel/", GuestsInHotelView.as_view(), name="guest-in-hotel"),
    path(
        "guests/pending-checkin/",
        GuestsPendingCheckinView.as_view(),
        name="guest-pending-checkin",
    ),
    path("rooms/available/", AvailableRoomsView.as_view(), name="room-available"),
    *router.urls,
]
