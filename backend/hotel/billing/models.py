from __future__ import annotations

from decimal import Decimal

from django.conf import settings
from django.db import models
from django.db.models import F, Q

POLICY_MONEY_NON_NEGATIVE = "policy_money_non_negative"
POLICY_CHECKOUT_BEFORE_CHECKIN = "policy_checkout_before_checkin"
ACCOUNT_TOTAL_NON_NEGATIVE = "account_total_non_negative"
ACCOUNT_CLOSED_IS_COMPLETE = "account_closed_is_complete"
ACCOUNTLINE_QUANTITY_NON_NEGATIVE = "accountline_quantity_non_negative"
ACCOUNTLINE_MONEY_NON_NEGATIVE = "accountline_money_non_negative"
ACCOUNTLINE_ONE_PER_KIND_DATE = "accountline_one_per_kind_date"
ACCOUNTLINE_ONE_LATE_FEE = "accountline_one_late_fee"
PAYMENT_AMOUNT_NON_NEGATIVE = "payment_amount_non_negative"


class PaymentMethod(models.TextChoices):
    CASH = "CASH", "Dinheiro"
    CARD = "CARD", "Cartão"
    PIX = "PIX", "Pix"
    OTHER = "OTHER", "Outro"


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


class AccountStatus(models.TextChoices):
    OPEN = "OPEN", "Em aberto"
    CLOSED = "CLOSED", "Fechada"
    PAID = "PAID", "Paga"


class LineKind(models.TextChoices):
    DAILY = "DAILY", "Diária"
    PARKING = "PARKING", "Vaga"
    LATE_FEE = "LATE_FEE", "Multa de checkout tardio"
    EXTRA = "EXTRA", "Lançamento avulso"


class Account(models.Model):
    status = models.CharField(
        max_length=6,
        choices=AccountStatus,
        default=AccountStatus.OPEN,
    )
    # Duplica checked_in_at de proposito: billing nao le reservations.
    opened_at = models.DateTimeField()
    closed_at = models.DateTimeField(null=True, blank=True)
    total_amount = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)

    class Meta:
        ordering = ["id"]
        constraints = [
            models.CheckConstraint(
                name=ACCOUNT_TOTAL_NON_NEGATIVE,
                condition=Q(total_amount__isnull=True) | Q(total_amount__gte=0),
            ),
            models.CheckConstraint(
                name=ACCOUNT_CLOSED_IS_COMPLETE,
                condition=(
                    Q(status="OPEN")
                    & Q(closed_at__isnull=True)
                    & Q(total_amount__isnull=True)
                )
                | (
                    Q(status__in=["CLOSED", "PAID"])
                    & Q(closed_at__isnull=False)
                    & Q(total_amount__isnull=False)
                ),
            ),
        ]

    def __str__(self) -> str:
        return f"conta {self.pk} ({self.status})"


class AccountLine(models.Model):
    account = models.ForeignKey(Account, on_delete=models.CASCADE, related_name="lines")
    kind = models.CharField(max_length=8, choices=LineKind)
    service_date = models.DateField()
    description = models.CharField(max_length=140, blank=True, default="")
    # 7,4 comporta o late_fee_factor da politica (5,4).
    quantity = models.DecimalField(max_digits=7, decimal_places=4, default=Decimal("1"))
    unit_amount = models.DecimalField(max_digits=10, decimal_places=2)
    # Sem CHECK aritmetico: quantity 0.3333 x unit nao fecha em `numeric`.
    # Esta coluna e a autoridade; quantity e unit_amount explicam como se chegou nela.
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    posted_at = models.DateTimeField()
    posted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="account_lines_posted",
        null=True,
        blank=True,
    )

    class Meta:
        ordering = ["service_date", "kind", "id"]
        constraints = [
            models.CheckConstraint(
                name=ACCOUNTLINE_QUANTITY_NON_NEGATIVE,
                # >= 0, nao > 0: fator de multa 0 e politica valida.
                condition=Q(quantity__gte=0),
            ),
            models.CheckConstraint(
                name=ACCOUNTLINE_MONEY_NON_NEGATIVE,
                condition=Q(unit_amount__gte=0) & Q(amount__gte=0),
            ),
            models.UniqueConstraint(
                name=ACCOUNTLINE_ONE_PER_KIND_DATE,
                fields=["account", "kind", "service_date"],
                condition=Q(kind__in=["DAILY", "PARKING"]),
            ),
            models.UniqueConstraint(
                name=ACCOUNTLINE_ONE_LATE_FEE,
                fields=["account"],
                condition=Q(kind="LATE_FEE"),
            ),
        ]

    def __str__(self) -> str:
        return f"{self.account_id} {self.service_date} {self.kind} {self.amount}"


class Payment(models.Model):
    account = models.OneToOneField(Account, on_delete=models.PROTECT, related_name="payment")
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    method = models.CharField(max_length=8, choices=PaymentMethod)
    paid_at = models.DateTimeField()
    # NOT NULL: nao ha recebimento sem caixa.
    received_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="payments_received",
    )

    class Meta:
        ordering = ["paid_at", "id"]
        constraints = [
            models.CheckConstraint(
                name=PAYMENT_AMOUNT_NON_NEGATIVE,
                condition=Q(amount__gte=0),
            ),
        ]

    def __str__(self) -> str:
        return f"{self.account_id} {self.method} {self.amount}"
