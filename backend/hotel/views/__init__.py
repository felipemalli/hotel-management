from __future__ import annotations

from hotel.views.guests import GuestViewSet
from hotel.views.policies import PricingPolicyViewSet
from hotel.views.reservations import ReservationViewSet
from hotel.views.rooms import RoomViewSet

__all__ = [
    "GuestViewSet",
    "PricingPolicyViewSet",
    "ReservationViewSet",
    "RoomViewSet",
]
