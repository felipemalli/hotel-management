from __future__ import annotations

from django.conf import settings
from django.contrib.postgres.constraints import ExclusionConstraint
from django.contrib.postgres.fields import DateRangeField, RangeBoundary, RangeOperators
from django.db import models
from django.db.models import F, Func, Q

RESV_ACTIVE_HAS_POLICY = "resv_active_has_policy"
RESV_ACCOUNT_MATCHES_STATUS = "resv_account_matches_status"
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
    # Aberta no check-in, fechada no checkout. Todo o dinheiro da estadia vive nela.
    account = models.OneToOneField(
        "billing.Account",
        on_delete=models.PROTECT,
        related_name="reservation",
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
                condition=~Q(status="CHECKED_OUT") | Q(checked_out_at__isnull=False),
            ),
            models.CheckConstraint(
                name=RESV_ACCOUNT_MATCHES_STATUS,
                condition=(
                    Q(status__in=["CHECKED_IN", "CHECKED_OUT"]) & Q(account__isnull=False)
                )
                | (Q(status__in=["PENDING", "CANCELLED"]) & Q(account__isnull=True)),
            ),
        ]

    def __str__(self) -> str:
        return f"{self.guest_id} {self.checkin_date} -> {self.checkout_date} ({self.status})"

