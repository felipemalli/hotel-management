from __future__ import annotations

from django.conf import settings
from django.contrib.postgres.constraints import ExclusionConstraint
from django.contrib.postgres.fields import DateRangeField, RangeBoundary, RangeOperators
from django.db import models
from django.db.models import F, Func, Q

from hotel.billing.models import PaymentMethod

RESV_ACTIVE_HAS_POLICY = "resv_active_has_policy"
RESV_PAYMENT_COMPLETE = "resv_payment_complete"
RESV_PAID_REQUIRES_CHECKED_OUT = "resv_paid_requires_checked_out"
STMTLINE_UNIQUE_DATE = "stmtline_unique_date"
RESV_ROOM_NO_OVERLAP = "resv_room_no_overlap"
RESV_ONE_ACTIVE_PER_ROOM = "resv_one_active_per_room"


class ReservationStatus(models.TextChoices):
    PENDING = "PENDING", "Reserva pendente"
    CHECKED_IN = "CHECKED_IN", "Hospede no hotel"
    CHECKED_OUT = "CHECKED_OUT", "Finalizada"
    CANCELLED = "CANCELLED", "Cancelada"


class DateRange(Func):
    """daterange(checkin, checkout, '[)') para o EXCLUDE. Estadias adjacentes nao se sobrepoem."""

    function = "daterange"
    output_field = DateRangeField()


class Reservation(models.Model):
    guest = models.ForeignKey(
        "guests.Guest",
        on_delete=models.PROTECT,
        related_name="reservations",
    )
    room = models.ForeignKey(
        "rooms.Room",
        on_delete=models.PROTECT,
        related_name="reservations",
    )
    companions = models.ManyToManyField(
        "guests.Guest",
        related_name="companion_reservations",
        blank=True,
    )
    checkin_date = models.DateField()
    checkout_date = models.DateField()
    has_vehicle = models.BooleanField(default=False)
    status = models.CharField(
        max_length=11,
        choices=ReservationStatus,
        default=ReservationStatus.PENDING,
    )
    # Amarrada no check-in (nao na criacao nem no checkout). Null enquanto PENDING.
    policy = models.ForeignKey(
        "billing.PricingPolicy",
        on_delete=models.PROTECT,
        related_name="reservations",
        null=True,
        blank=True,
    )
    checked_in_at = models.DateTimeField(null=True, blank=True)
    checked_out_at = models.DateTimeField(null=True, blank=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="reservations_created",
        null=True,
        blank=True,
    )
    checked_in_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="reservations_checked_in",
        null=True,
        blank=True,
    )
    checked_out_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="reservations_checked_out",
        null=True,
        blank=True,
    )
    cancelled_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="reservations_cancelled",
        null=True,
        blank=True,
    )
    total_daily = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    total_parking = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    late_fee = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    # late_fee_applied do extrato deriva de `late_fee_base IS NOT NULL`.
    late_fee_base = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    total_amount = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    paid_at = models.DateTimeField(null=True, blank=True)
    # null=True e deliberado (DJ001): as tres colunas do pagamento nascem juntas.
    # "" seria uma segunda representacao de "nao pago" e um valor fora do enum.
    payment_method = models.CharField(  # noqa: DJ001
        max_length=8,
        choices=PaymentMethod,
        null=True,
        blank=True,
    )
    paid_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="reservations_paid",
        null=True,
        blank=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["checkin_date", "id"]
        indexes = [
            models.Index(fields=["status", "checkin_date"], name="resv_status_checkin"),
        ]
        constraints = [
            models.CheckConstraint(
                name="resv_checkout_after_checkin",
                condition=Q(checkout_date__gt=F("checkin_date")),
            ),
            models.UniqueConstraint(
                name="resv_one_active_per_guest",
                fields=["guest"],
                condition=Q(status="CHECKED_IN"),
            ),
            # Agenda: estadias ativas nao se sobrepoem. '[)' deixa passar datas adjacentes.
            # Nao DEFERRABLE: o savepoint em volta do INSERT basta para traduzir o erro.
            ExclusionConstraint(
                name=RESV_ROOM_NO_OVERLAP,
                expressions=[
                    ("room", RangeOperators.EQUAL),
                    (
                        DateRange("checkin_date", "checkout_date", RangeBoundary()),
                        RangeOperators.OVERLAPS,
                    ),
                ],
                condition=Q(status__in=["PENDING", "CHECKED_IN"]),
            ),
            # Ocupacao fisica: overstay continua CHECKED_IN depois do checkout_date,
            # entao o EXCLUDE (datas agendadas) nao pega duas pessoas no quarto.
            models.UniqueConstraint(
                name=RESV_ONE_ACTIVE_PER_ROOM,
                fields=["room"],
                condition=Q(status="CHECKED_IN"),
            ),
            models.CheckConstraint(
                name=RESV_ACTIVE_HAS_POLICY,
                condition=Q(status__in=["PENDING", "CANCELLED"]) | Q(policy__isnull=False),
            ),
            models.CheckConstraint(
                name="resv_checked_out_complete",
                condition=~Q(status="CHECKED_OUT")
                | (Q(checked_out_at__isnull=False) & Q(total_amount__isnull=False)),
            ),
            models.CheckConstraint(
                name=RESV_PAYMENT_COMPLETE,
                condition=(
                    Q(paid_at__isnull=True)
                    & Q(payment_method__isnull=True)
                    & Q(paid_by__isnull=True)
                )
                | (
                    Q(paid_at__isnull=False)
                    & Q(payment_method__isnull=False)
                    & Q(paid_by__isnull=False)
                ),
            ),
            models.CheckConstraint(
                name=RESV_PAID_REQUIRES_CHECKED_OUT,
                condition=Q(paid_at__isnull=True) | Q(status="CHECKED_OUT"),
            ),
        ]

    def __str__(self) -> str:
        return f"{self.guest_id} {self.checkin_date} -> {self.checkout_date} ({self.status})"


class StatementLine(models.Model):
    """Uma diaria congelada no checkout. weekday_label deriva da data, nao e coluna."""

    reservation = models.ForeignKey(
        Reservation,
        on_delete=models.CASCADE,
        related_name="statement_lines",
    )
    date = models.DateField()
    daily_rate = models.DecimalField(max_digits=10, decimal_places=2)
    parking_fee = models.DecimalField(max_digits=10, decimal_places=2)

    class Meta:
        ordering = ["date"]
        constraints = [
            models.UniqueConstraint(
                fields=["reservation", "date"],
                name=STMTLINE_UNIQUE_DATE,
            ),
        ]

    def __str__(self) -> str:
        return f"{self.reservation_id} {self.date} {self.daily_rate}"
