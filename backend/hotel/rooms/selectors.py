from __future__ import annotations

from django.db.models import QuerySet

from hotel.rooms.models import Room


def list_rooms(*, active_only: bool = True, search: str | None = None) -> QuerySet[Room]:
    queryset = Room.objects.all()
    if active_only:
        queryset = queryset.filter(is_active=True)
    search = (search or "").strip()
    if search:
        queryset = queryset.filter(number__icontains=search)
    return queryset
