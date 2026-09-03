"""
Modelos do dominio (SPEC 1.2-1.5).

Models enxutos (SPEC 0.3): nenhum calculo de dinheiro aqui -- isso e de
`services/pricing.py`. A unica logica que sobrevive no model e a
normalizacao de documento/telefone, que precisa valer para qualquer caminho de
escrita (API, seed, admin, shell).
"""

from __future__ import annotations

from django.conf import settings
from django.contrib.postgres.indexes import GinIndex, OpClass
from django.db import models
from django.db.models import F, Q
from django.db.models.functions import Upper

from hotel.normalization import (
    DOCUMENT_MAX_LENGTH,
    PHONE_MAX_LENGTH,
    normalize_country,
    normalize_document,
    normalize_phone,
)

# Nomes de constraint sao contrato: `services/errors.translate_integrity_error`
# casa por eles para transformar violacao em erro de dominio (SPEC 4.1). Por
# isso nenhuma constraint deste projeto nasce com nome gerado pelo Django.
GUEST_DOCUMENT_UNIQUE = "guest_document_unique"


class ReservationStatus(models.TextChoices):
    PENDING = "PENDING", "Reserva pendente"
    CHECKED_IN = "CHECKED_IN", "Hospede no hotel"
    CHECKED_OUT = "CHECKED_OUT", "Finalizada"
    CANCELLED = "CANCELLED", "Cancelada"


class GuestManager(models.Manager):
    """Recusa as escritas que passam por cima do `save()` do modelo.

    `bulk_create` e `QuerySet.update()` nao chamam `save()`, e e o `save()` que
    normaliza `document`/`phone` (SPEC 2.1, D9). Sem este guarda, o hospede era
    gravado com a mascara digitada: a unicidade de documento e a busca por
    fragmento falhariam em silencio. Falhar alto e melhor que gravar dado
    silenciosamente quebrado.
    """

    def bulk_create(self, *args, **kwargs):
        raise NotImplementedError(
            "Guest.objects.bulk_create nao normaliza document/phone "
            "(SPEC 2.1). Crie um por um com save(), ou use os services."
        )


class Guest(models.Model):
    """Hospede. Nome, documento e telefone em claro e buscaveis por fragmento (D5).

    `phone` guarda digitos E.164 SEM o `+` (D9): a presenca do DDI e garantida
    na ENTRADA por `services.guests.create_guest`, porque o `+` nao persiste e
    a coluna nao distingue "5521988887777" de um numero local de 13 digitos.
    """

    full_name = models.CharField(max_length=140)
    document = models.CharField(max_length=DOCUMENT_MAX_LENGTH)
    phone = models.CharField(max_length=PHONE_MAX_LENGTH)
    # Sem `default` no model: default silencioso faria todo hospede estrangeiro
    # nascer brasileiro no primeiro caminho de escrita que esquecesse o campo.
    # A migration usa um default one-off (`preserve_default=False`) so para
    # preencher linha existente. Sem CHECK regex: nao ha corrida a proteger, e a
    # autoridade da lista ISO e o servico.
    nationality = models.CharField(max_length=2)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = GuestManager()

    class Meta:
        ordering = ["full_name", "id"]
        constraints = [
            # `unique=True` no campo deixaria o PostgreSQL escolher o nome, e a
            # traducao de `IntegrityError` casa por nome (GUEST_DOCUMENT_UNIQUE).
            models.UniqueConstraint(fields=["document"], name=GUEST_DOCUMENT_UNIQUE),
        ]
        indexes = [
            # Indices FUNCIONAIS: casam o SQL real do icontains no PG,
            # `UPPER("coluna"::text) LIKE UPPER(%s)` (SPEC 1.4, V4+V5).
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
        """Normaliza documento, telefone e nacionalidade em qualquer escrita (D9)."""
        self.document = normalize_document(self.document)
        self.phone = normalize_phone(self.phone)
        self.nationality = normalize_country(self.nationality)
        super().save(*args, **kwargs)


class Reservation(models.Model):
    """Reserva. Datas agendadas + fatos reais; totais congelados no checkout.

    Sem `updated_at`: todo `save()` dos services usa `update_fields`, entao um
    `auto_now` nunca entraria na lista e a coluna mentiria para sempre. Os
    `*_at` por transicao, com o ator ao lado, sao a linha do tempo real.
    """

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
    )
    # Fatos reais: e por eles que se cobra (D6), nunca pelas datas agendadas.
    checked_in_at = models.DateTimeField(null=True, blank=True)
    checked_out_at = models.DateTimeField(null=True, blank=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)
    # Quem fez cada transicao. A maquina de estados e linear e cada transicao
    # ocorre no maximo uma vez, entao a coluna com o seu `*_at` ao lado E o
    # historico: nao ha o que uma tabela de eventos acrescentaria enquanto
    # nenhuma transicao for repetivel. `PROTECT` porque apagar o usuario
    # apagaria a autoria de um lancamento financeiro; `null` porque a linha
    # pode ter nascido antes da transicao (ou fora da API, pelo shell).
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
            # `status` NAO leva `db_index` proprio: e a coluna que lidera este
            # indice composto, logo o indice simples seria peso morto -- custo
            # de escrita e de espaco sem nenhuma consulta que o prefira.
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
