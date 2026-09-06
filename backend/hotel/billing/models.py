from __future__ import annotations

from decimal import Decimal

from django.conf import settings
from django.db import models
from django.db.models import F, Q

POLICY_MONEY_NON_NEGATIVE = "policy_money_non_negative"
POLICY_CHECKOUT_BEFORE_CHECKIN = "policy_checkout_before_checkin"


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
