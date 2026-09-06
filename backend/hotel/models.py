from __future__ import annotations

from decimal import Decimal

from django.conf import settings
from django.contrib.postgres.constraints import ExclusionConstraint
from django.contrib.postgres.fields import DateRangeField, RangeBoundary, RangeOperators
from django.contrib.postgres.indexes import GinIndex, OpClass
from django.core.validators import MinValueValidator
from django.db import models
from django.db.models import F, Func, Q
from django.db.models.functions import Upper

from hotel.guests.normalization import (
    DOCUMENT_MAX_LENGTH,
    PHONE_MAX_LENGTH,
    normalize_country,
    normalize_document,
    normalize_phone,
)

# Nomes sao contrato: translate_integrity_error casa IntegrityError por eles.
GUEST_DOCUMENT_UNIQUE = "guest_document_unique"
POLICY_MONEY_NON_NEGATIVE = "policy_money_non_negative"
POLICY_CHECKOUT_BEFORE_CHECKIN = "policy_checkout_before_checkin"
RESV_ACTIVE_HAS_POLICY = "resv_active_has_policy"
RESV_PAYMENT_COMPLETE = "resv_payment_complete"
RESV_PAID_REQUIRES_CHECKED_OUT = "resv_paid_requires_checked_out"
STMTLINE_UNIQUE_DATE = "stmtline_unique_date"
ROOM_NUMBER_UNIQUE = "room_number_unique"
ROOM_CAPACITY_POSITIVE = "room_capacity_positive"
RESV_ROOM_NO_OVERLAP = "resv_room_no_overlap"
RESV_ONE_ACTIVE_PER_ROOM = "resv_one_active_per_room"


class ReservationStatus(models.TextChoices):
    PENDING = "PENDING", "Reserva pendente"
    CHECKED_IN = "CHECKED_IN", "Hospede no hotel"
    CHECKED_OUT = "CHECKED_OUT", "Finalizada"
    CANCELLED = "CANCELLED", "Cancelada"


class PaymentMethod(models.TextChoices):
    CASH = "CASH", "Dinheiro"
    CARD = "CARD", "Cartão"
    PIX = "PIX", "Pix"
    OTHER = "OTHER", "Outro"


class GuestManager(models.Manager):
    """bulk_create/QuerySet.update nao chamam save(), que e o que normaliza PII."""

    def bulk_create(self, *args, **kwargs):
        raise NotImplementedError(
            "Guest.objects.bulk_create nao normaliza document/phone "
            "(SPEC 2.1). Crie um por um com save(), ou use os services."
        )


class Guest(models.Model):
    full_name = models.CharField(max_length=140)
    document = models.CharField(max_length=DOCUMENT_MAX_LENGTH)
    # E.164 sem '+'. create_guest exige '+' na entrada: a coluna nao distingue
    # 5521988887777 de um numero local de 13 digitos.
    phone = models.CharField(max_length=PHONE_MAX_LENGTH)
    # Sem default: um BR silencioso faria todo estrangeiro esquecido nascer brasileiro.
    nationality = models.CharField(max_length=2)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = GuestManager()

    class Meta:
        ordering = ["full_name", "id"]
        constraints = [
            models.UniqueConstraint(fields=["document"], name=GUEST_DOCUMENT_UNIQUE),
        ]
        indexes = [
            # GIN em Upper(...) casa o icontains do PG: UPPER("col"::text) LIKE UPPER(%s)
            GinIndex(
                OpClass(Upper("full_name"), name="gin_trgm_ops"),
                name="guest_name_trgm_upper",
            ),
            GinIndex(
                OpClass(Upper("document"), name="gin_trgm_ops"),
                name="guest_document_trgm_upper",
            ),
            GinIndex(
                OpClass(Upper("phone"), name="gin_trgm_ops"),
                name="guest_phone_trgm_upper",
            ),
        ]

    def __str__(self) -> str:
        return self.full_name

    def save(self, *args, **kwargs):
        self.document = normalize_document(self.document)
        self.phone = normalize_phone(self.phone)
        self.nationality = normalize_country(self.nationality)
        super().save(*args, **kwargs)


class DateRange(Func):
    """daterange(checkin, checkout, '[)') para o EXCLUDE. Estadias adjacentes nao se sobrepoem."""

    function = "daterange"
    output_field = DateRangeField()


class Room(models.Model):
    number = models.CharField(max_length=10)
    capacity = models.PositiveSmallIntegerField(validators=[MinValueValidator(1)])
    # FK e PROTECT: sem esta flag um quarto em reforma nao pode ser escondido.
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["number"]
        constraints = [
            models.UniqueConstraint(fields=["number"], name=ROOM_NUMBER_UNIQUE),
            models.CheckConstraint(
                name=ROOM_CAPACITY_POSITIVE,
                condition=Q(capacity__gte=1),
            ),
        ]

    def __str__(self) -> str:
        return self.number


class PricingPolicy(models.Model):
    """Tarifas a partir de um instante. Append-only: nao ha caminho de update/delete."""

    weekday_rate = models.DecimalField(max_digits=10, decimal_places=2)
    weekend_rate = models.DecimalField(max_digits=10, decimal_places=2)
    weekday_park = models.DecimalField(max_digits=10, decimal_places=2)
    weekend_park = models.DecimalField(max_digits=10, decimal_places=2)
    # Fator (0.5000 = 50%), nao dinheiro. Sem teto: multa de 100% e plausivel.
    late_fee_factor = models.DecimalField(max_digits=5, decimal_places=4, default=Decimal("0.5"))
    checkin_opens = models.TimeField()
    checkout_limit = models.TimeField()
    # Definido pelo servidor. Sem unique: erro de digitacao se corrige publicando outra linha.
    effective_from = models.DateTimeField(db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="pricing_policies",
        null=True,
        blank=True,
    )
    note = models.CharField(max_length=200, blank=True)

    class Meta:
        ordering = ["-effective_from", "-id"]
        constraints = [
            models.CheckConstraint(
                name=POLICY_MONEY_NON_NEGATIVE,
                condition=Q(weekday_rate__gte=0)
                & Q(weekend_rate__gte=0)
                & Q(weekday_park__gte=0)
                & Q(weekend_park__gte=0)
                & Q(late_fee_factor__gte=0),
            ),
            models.CheckConstraint(
                name=POLICY_CHECKOUT_BEFORE_CHECKIN,
                condition=Q(checkout_limit__lte=F("checkin_opens")),
            ),
        ]

    def __str__(self) -> str:
        return f"politica de {self.effective_from:%Y-%m-%d %H:%M}"


class Reservation(models.Model):
    guest = models.ForeignKey(
        Guest,
        on_delete=models.PROTECT,
        related_name="reservations",
    )
    room = models.ForeignKey(
        "hotel.Room",
        on_delete=models.PROTECT,
        related_name="reservations",
    )
    companions = models.ManyToManyField(
        Guest,
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
        "hotel.PricingPolicy",
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
