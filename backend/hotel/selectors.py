"""
Camada de leitura (SPEC 0.3): consultas nomeadas, sem efeito colateral.

Nenhuma view monta QuerySet a mao e nenhum selector muta estado ou calcula
dinheiro -- dinheiro e de `services/pricing.py`.
"""

from __future__ import annotations

from django.db.models import Prefetch, Q, QuerySet

from hotel.models import Guest, Reservation, ReservationStatus
from hotel.normalization import normalize_document, normalize_phone

# Atributos preenchidos pelos prefetches abaixo, consumidos pelos
# serializers das abas "no hotel" e "pendentes" (SPEC 4.3).
ACTIVE_RESERVATIONS_ATTR = "active_reservations"
PENDING_RESERVATIONS_ATTR = "pending_reservations"


def search_guests(term: str | None = None) -> QuerySet[Guest]:
    """Nome, documento e telefone por fragmento (SPEC 4.3, D5).

    Documento e telefone sao normalizados antes do `icontains`, entao o termo
    aceita mascara (`789-01`, `(21) 98888`) e ainda assim casa o valor gravado.
    """
    queryset = Guest.objects.all()
    term = (term or "").strip()
    if not term:
        return queryset

    predicate = Q(full_name__icontains=term)

    document = normalize_document(term)
    if document:
        predicate |= Q(document__icontains=document)

    phone = normalize_phone(term)
    if phone:
        predicate |= Q(phone__icontains=phone)

    return queryset.filter(predicate)


def guests_in_hotel() -> QuerySet[Guest]:
    """Hospedes com reserva CHECKED_IN (RF4).

    A constraint `resv_one_active_per_guest` (SPEC 1.5) garante que a lista
    prefetchada tem no maximo um item -- e o `active_reservation` da SPEC 4.3.
    """
    return (
        Guest.objects.filter(reservations__status=ReservationStatus.CHECKED_IN)
        .prefetch_related(
            Prefetch(
                "reservations",
                queryset=Reservation.objects.filter(status=ReservationStatus.CHECKED_IN),
                to_attr=ACTIVE_RESERVATIONS_ATTR,
            )
        )
        .distinct()
    )


def guests_pending_checkin() -> QuerySet[Guest]:
    """Hospedes com reserva PENDING (RF5), inclusive vencidas (D14).

    Um hospede pode ter mais de uma reserva futura, logo a lista e plural.
    """
    return (
        Guest.objects.filter(reservations__status=ReservationStatus.PENDING)
        .prefetch_related(
            Prefetch(
                "reservations",
                queryset=Reservation.objects.filter(status=ReservationStatus.PENDING),
                to_attr=PENDING_RESERVATIONS_ATTR,
            )
        )
        .distinct()
    )


def list_reservations(*, status: str | None = None, guest_id: int | None = None):
    """Reservas filtradas por status e/ou hospede (SPEC 4.2)."""
    queryset = Reservation.objects.select_related("guest")
    if status:
        queryset = queryset.filter(status=status)
    if guest_id is not None:
        queryset = queryset.filter(guest_id=guest_id)
    return queryset
