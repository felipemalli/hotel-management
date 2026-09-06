from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal

from django.db.models import Count, Exists, OuterRef, Prefetch, Q, QuerySet, Sum, Value

from core.money import ZERO, quantize_money
from hotel.billing.models import AccountLine, AccountStatus, LineKind
from hotel.guests.models import Guest
from hotel.guests.selectors import guest_search_predicate
from hotel.reservations.models import Reservation, ReservationStatus
from hotel.rooms.models import Room
from hotel.rooms.selectors import list_rooms

ACTIVE_RESERVATIONS_ATTR = "active_reservations"
PENDING_RESERVATIONS_ATTR = "pending_reservations"
ACTIVE_COMPANION_RESERVATIONS_ATTR = "active_companion_reservations"
PENDING_COMPANION_RESERVATIONS_ATTR = "pending_companion_reservations"

OCCUPYING_STATUSES = (ReservationStatus.PENDING, ReservationStatus.CHECKED_IN)

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
    "account",
    "account__payment",
    "account__payment__received_by",
)


def _by_status(
    status: str, *, attr_own: str, attr_companion: str, search: str | None = None
) -> QuerySet[Guest]:
    # Raiz em Guest para a paginacao contar pessoas. distinct(): OR sobre duas
    # relacoes multivaloradas duplica a linha. Dois Prefetches: os nomes do ORM
    # (reservations / companion_reservations) nao se unificam.
    reservations = Reservation.objects.filter(status=status).select_related("room")
    queryset = Guest.objects.filter(
        Q(reservations__status=status) | Q(companion_reservations__status=status)
    )

    # O termo casa a pessoa da linha, nao o titular: acompanhante achado pelo
    # proprio nome continua na lista da aba.
    term = (search or "").strip()
    if term:
        queryset = queryset.filter(guest_search_predicate(term))

    return queryset.prefetch_related(
        Prefetch("reservations", queryset=reservations, to_attr=attr_own),
        Prefetch("companion_reservations", queryset=reservations, to_attr=attr_companion),
    ).distinct()


def guests_in_hotel(search: str | None = None) -> QuerySet[Guest]:
    return _by_status(
        ReservationStatus.CHECKED_IN,
        attr_own=ACTIVE_RESERVATIONS_ATTR,
        attr_companion=ACTIVE_COMPANION_RESERVATIONS_ATTR,
        search=search,
    )


def guests_pending_checkin(search: str | None = None) -> QuerySet[Guest]:
    return _by_status(
        ReservationStatus.PENDING,
        attr_own=PENDING_RESERVATIONS_ATTR,
        attr_companion=PENDING_COMPANION_RESERVATIONS_ATTR,
        search=search,
    )


def reservation_queryset() -> QuerySet[Reservation]:
    return Reservation.objects.select_related(*RESERVATION_RELATIONS).prefetch_related("companions")


def list_reservations(
    *,
    status: str | None = None,
    guest_id: int | None = None,
    paid: bool | None = None,
    search: str | None = None,
):
    queryset = reservation_queryset()
    if status:
        queryset = queryset.filter(status=status)
    if guest_id is not None:
        queryset = queryset.filter(guest_id=guest_id)
    if paid is not None:
        # `paid=false` inclui reserva sem conta: em aberto e tudo que nao esta pago.
        queryset = (
            queryset.filter(account__status=AccountStatus.PAID)
            if paid
            else queryset.exclude(account__status=AccountStatus.PAID)
        )
    if search:
        queryset = queryset.filter(_reservation_search_predicate(search))
    return queryset


def _reservation_search_predicate(term: str) -> Q:
    # Nº da reserva (com ou sem "#"), titular ou quarto — nunca acompanhante:
    # a tela lista por reserva, e o papel de acompanhante não é um campo aqui.
    term = term.strip()
    predicate = Q(guest__full_name__icontains=term) | Q(room__number__icontains=term)
    numeric = term.removeprefix("#")
    if numeric.isdigit():
        predicate |= Q(pk=int(numeric))
    return predicate


def search_stays(*, status: str, term: str = "") -> QuerySet[Reservation]:
    """Reservas de um status cujo titular, acompanhante, quarto ou nº casa o termo."""
    queryset = reservation_queryset().filter(status=status)
    term = term.strip()
    if not term:
        return queryset
    # Acompanhante entra aqui e nao em list_reservations: quem pergunta por uma
    # pessoa nao sabe se ela e titular; a tela de reservas lista por reserva (D19).
    return queryset.filter(
        _reservation_search_predicate(term) | Q(companions__full_name__icontains=term)
    ).distinct()


@dataclass(frozen=True)
class RevenueSummary:
    stays: int
    billed: Decimal
    paid: Decimal
    late_fees: Decimal


def revenue_summary(*, since: datetime | None = None) -> RevenueSummary:
    """Faturamento das estadias encerradas: fechado, ja recebido e multas."""
    stays = Reservation.objects.filter(status=ReservationStatus.CHECKED_OUT)
    if since is not None:
        stays = stays.filter(checked_out_at__gte=since)

    # Tres consultas simples em vez de um aggregate com dois joins: somar
    # total_amount e amount na mesma linha multiplicaria cada um pela
    # cardinalidade do outro.
    billed = stays.aggregate(total=Sum("account__total_amount"))["total"]
    paid = stays.filter(account__status=AccountStatus.PAID).aggregate(
        total=Sum("account__total_amount")
    )["total"]
    late = AccountLine.objects.filter(
        kind=LineKind.LATE_FEE, account__in=stays.values("account_id")
    ).aggregate(total=Sum("amount"))["total"]

    return RevenueSummary(
        stays=stays.count(),
        billed=quantize_money(billed or ZERO),
        paid=quantize_money(paid or ZERO),
        late_fees=quantize_money(late or ZERO),
    )


def active_reservations_of(room: Room) -> QuerySet[Reservation]:
    """Agenda viva do quarto. Encapsula os status: `rooms` nao os conhece."""
    return room.reservations.filter(status__in=OCCUPYING_STATUSES)


def largest_active_party(room: Room) -> int:
    """Maior grupo ja aceito para o quarto; 0 sem reserva ativa."""
    parties = active_reservations_of(room).annotate(party=Value(1) + Count("companions"))
    return max(parties.values_list("party", flat=True), default=0)


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
