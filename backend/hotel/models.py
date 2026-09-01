"""
Modelos do dominio (SPEC 1.2-1.5).

Models enxutos (SPEC 0.3): nenhum calculo de dinheiro aqui -- isso e de
`services/pricing.py`. A unica logica que sobrevive no model e a
sincronizacao dos blind indexes, que precisa valer para qualquer caminho de
escrita (API, seed, admin, shell).
"""

from __future__ import annotations

from django.contrib.postgres.indexes import GinIndex, OpClass
from django.db import models
from django.db.models import F, Q
from django.db.models.functions import Upper

from hotel.crypto import blind_index, normalize_document, normalize_phone
from hotel.fields import EncryptedCharField


class ReservationStatus(models.TextChoices):
    PENDING = "PENDING", "Reserva pendente"
    CHECKED_IN = "CHECKED_IN", "Hospede no hotel"
    CHECKED_OUT = "CHECKED_OUT", "Finalizada"
    CANCELLED = "CANCELLED", "Cancelada"


class Guest(models.Model):
    """Hospede. `full_name` em claro (busca parcial trigram); PII cifrada (D5)."""

    full_name = models.CharField(max_length=140)
    document = EncryptedCharField()
    document_hash = models.CharField(max_length=64, unique=True, editable=False)
    phone = EncryptedCharField()
    phone_hash = models.CharField(max_length=64, db_index=True, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["full_name", "id"]
        indexes = [
            # Indice FUNCIONAL: casa o SQL real do icontains no PG,
            # `UPPER("full_name"::text) LIKE UPPER(%s)` (SPEC 1.4, V4+V5).
            GinIndex(
                OpClass(Upper("full_name"), name="gin_trgm_ops"),
                name="guest_name_trgm_upper",
            ),
        ]

    def __str__(self) -> str:
        return self.full_name

    def save(self, *args, update_fields=None, **kwargs):
        """Mantem `document_hash`/`phone_hash` sincronizados com o valor claro (SPEC 2.1)."""
        self.document_hash = blind_index(normalize_document(self.document))
        self.phone_hash = blind_index(normalize_phone(self.phone))
        if update_fields is not None:
            update_fields = set(update_fields)
            if "document" in update_fields:
                update_fields.add("document_hash")
            if "phone" in update_fields:
                update_fields.add("phone_hash")
        super().save(*args, update_fields=update_fields, **kwargs)


class Reservation(models.Model):
    """Reserva. Datas agendadas + fatos reais; totais congelados no checkout."""

    guest = models.ForeignKey(
        Guest,
        on_delete=models.PROTECT,
        related_name="reservations",
    )
    checkin_date = models.DateField()
    checkout_date = models.DateField()
    has_vehicle = models.BooleanField(default=False)
    status = models.CharField(
        max_length=11,
        choices=ReservationStatus,
        default=ReservationStatus.PENDING,
        db_index=True,
    )
    # Fatos reais: e por eles que se cobra (D6), nunca pelas datas agendadas.
    checked_in_at = models.DateTimeField(null=True, blank=True)
    checked_out_at = models.DateTimeField(null=True, blank=True)
    # Congelados no checkout para auditoria; o extrato linha a linha e
    # recomputavel deterministicamente de checked_in_at/checked_out_at.
    total_daily = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    total_parking = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    late_fee = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    total_amount = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["checkin_date", "id"]
        indexes = [
            # Serve as abas "no hotel" / "pendentes" ordenadas por data (SPEC 1.4).
            models.Index(fields=["status", "checkin_date"], name="resv_status_checkin"),
        ]
        constraints = [
            # Agendamento exige no minimo 1 noite (D13); day-use real e coberto
            # por D1 no motor financeiro, nao aqui.
            models.CheckConstraint(
                name="resv_checkout_after_checkin",
                condition=Q(checkout_date__gt=F("checkin_date")),
            ),
            # No maximo UMA reserva CHECKED_IN por hospede: e o que garante que
            # `active_reservation` da aba "no hotel" e unico (SPEC 4.3).
            models.UniqueConstraint(
                name="resv_one_active_per_guest",
                fields=["guest"],
                condition=Q(status="CHECKED_IN"),
            ),
            # Estado terminal exige timestamp e total congelado.
            models.CheckConstraint(
                name="resv_checked_out_complete",
                condition=~Q(status="CHECKED_OUT")
                | (Q(checked_out_at__isnull=False) & Q(total_amount__isnull=False)),
            ),
        ]

    def __str__(self) -> str:
        return f"{self.guest_id} {self.checkin_date} -> {self.checkout_date} ({self.status})"
