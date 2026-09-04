from __future__ import annotations

from datetime import date, datetime

from django.db.models import Exists, OuterRef, Prefetch, Q, QuerySet

from hotel.models import Guest, PricingPolicy, Reservation, ReservationStatus, Room
from hotel.normalization import normalize_document, normalize_phone

ACTIVE_RESERVATIONS_ATTR = "active_reservations"
PENDING_RESERVATIONS_ATTR = "pending_reservations"
ACTIVE_COMPANION_RESERVATIONS_ATTR = "active_companion_reservations"
PENDING_COMPANION_RESERVATIONS_ATTR = "pending_companion_reservations"


def search_guests(term: str | None = None) -> QuerySet[Guest]:
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


def _by_status(status: str, *, attr_own: str, attr_companion: str) -> QuerySet[Guest]:
    # Raiz em Guest para a paginacao contar pessoas. distinct(): OR sobre duas
    # relacoes multivaloradas duplica a linha. Dois Prefetches: os nomes do ORM
    # (reservations / companion_reservations) nao se unificam.
    reservations = Reservation.objects.filter(status=status).select_related("room")
    return (
        Guest.objects.filter(
            Q(reservations__status=status) | Q(companion_reservations__status=status)
        )
        .prefetch_related(
            Prefetch("reservations", queryset=reservations, to_attr=attr_own),
            Prefetch("companion_reservations", queryset=reservations, to_attr=attr_companion),
        )
        .distinct()
    )


def guests_in_hotel() -> QuerySet[Guest]:
    return _by_status(
        ReservationStatus.CHECKED_IN,
        attr_own=ACTIVE_RESERVATIONS_ATTR,
        attr_companion=ACTIVE_COMPANION_RESERVATIONS_ATTR,
    )


def guests_pending_checkin() -> QuerySet[Guest]:
    return _by_status(
        ReservationStatus.PENDING,
        attr_own=PENDING_RESERVATIONS_ATTR,
        attr_companion=PENDING_COMPANION_RESERVATIONS_ATTR,
    )


# Tudo que ReservationSerializer le fora da linha. Sem isto, 20 linhas x 6
# relacoes = 120 consultas.
RESERVATION_RELATIONS = (
    "guest",
    "room",
    "policy",
    "created_by",
    "checked_in_by",
    "checked_out_by",
    "cancelled_by",
    "paid_by",
)


def reservation_queryset() -> QuerySet[Reservation]:
    return Reservation.objects.select_related(*RESERVATION_RELATIONS).prefetch_related("companions")


def list_reservations(
    *,
    status: str | None = None,
    guest_id: int | None = None,
    paid: bool | None = None,
):
    queryset = reservation_queryset()
    if status:
        queryset = queryset.filter(status=status)
    if guest_id is not None:
        queryset = queryset.filter(guest_id=guest_id)
    if paid is not None:
        queryset = queryset.filter(paid_at__isnull=not paid)
    return queryset


def policy_in_force(at: datetime) -> PricingPolicy:
    policy = (
        PricingPolicy.objects.filter(effective_from__lte=at)
        .order_by("-effective_from", "-id")
        .first()
    )
    if policy is None:
        # Banco sem bootstrap, nao erro do cliente. Um codigo de dominio fingiria
        # que a requisicao resolve isso.
        raise RuntimeError(
            "nenhuma PricingPolicy vigente: o bootstrap nao foi aplicado (rode migrate)"
        )
    return policy


def list_policies() -> QuerySet[PricingPolicy]:
    return PricingPolicy.objects.select_related("created_by").all()


OCCUPYING_STATUSES = (ReservationStatus.PENDING, ReservationStatus.CHECKED_IN)


def list_rooms(*, active_only: bool = True) -> QuerySet[Room]:
    queryset = Room.objects.all()
    if active_only:
        queryset = queryset.filter(is_active=True)
    return queryset


def _overlapping(checkin_date: date, checkout_date: date) -> QuerySet[Reservation]:
    # Meio-aberto: saida no dia 09 e entrada no dia 09 nao se cruzam.
    return Reservation.objects.filter(
        status__in=OCCUPYING_STATUSES,
        checkin_date__lt=checkout_date,
        checkout_date__gt=checkin_date,
    )


def available_rooms(
    *,
    checkin_date: date,
    checkout_date: date,
    people: int,
    today: date,
) -> QuerySet[Room]:
    queryset = list_rooms(active_only=True).filter(capacity__gte=people)

    # ~Exists, nao exclude(reservations__...): em relacao multivalorada o
    # exclude vira NOT IN sobre a juncao e descarta o quarto se QUALQUER
    # reserva casa parte do predicado.
    scheduled = _overlapping(checkin_date, checkout_date).filter(room=OuterRef("pk"))
    queryset = queryset.filter(~Exists(scheduled))

    if checkin_date <= today:
        occupied_now = Reservation.objects.filter(
            room=OuterRef("pk"), status=ReservationStatus.CHECKED_IN
        )
        queryset = queryset.filter(~Exists(occupied_now))

    return queryset


def conflicting_reservation(
    room: Room,
    *,
    checkin_date: date,
    checkout_date: date,
    today: date,
) -> Reservation | None:
    conflict = _overlapping(checkin_date, checkout_date).filter(room=room).first()
    if conflict is not None:
        return conflict
    if checkin_date <= today:
        return (
            Reservation.objects.filter(room=room, status=ReservationStatus.CHECKED_IN)
            .order_by("checkin_date", "id")
            .first()
        )
    return None
