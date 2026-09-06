from __future__ import annotations

from django.contrib.postgres.indexes import GinIndex, OpClass
from django.db import models
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
