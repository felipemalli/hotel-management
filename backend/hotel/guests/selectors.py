from __future__ import annotations

from django.db.models import Q, QuerySet

from hotel.guests.models import Guest
from hotel.guests.normalization import normalize_document, normalize_phone


def guest_search_predicate(term: str) -> Q:
    """Publico: as abas de reservas buscam pessoas com o mesmo termo de `GET /guests/`."""
    predicate = Q(full_name__icontains=term)

    document = normalize_document(term)
    if document:
        predicate |= Q(document__icontains=document)

    phone = normalize_phone(term)
    if phone:
        predicate |= Q(phone__icontains=phone)

    return predicate


def search_guests(term: str | None = None) -> QuerySet[Guest]:
    queryset = Guest.objects.all()
    term = (term or "").strip()
    if not term:
        return queryset

    return queryset.filter(guest_search_predicate(term))
