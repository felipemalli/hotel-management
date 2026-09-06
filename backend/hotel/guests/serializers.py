from __future__ import annotations

from rest_framework import serializers

from hotel.guests.models import Guest
from hotel.guests.normalization import (
    DOCUMENT_MAX_LENGTH,
    DOCUMENT_MIN_LENGTH,
    PHONE_MAX_LENGTH,
    normalize_document,
)


class GuestSerializer(serializers.ModelSerializer):
    class Meta:
        model = Guest
        fields = ["id", "full_name", "document", "phone", "nationality", "created_at"]
        read_only_fields = fields


class GuestMinimalSerializer(serializers.ModelSerializer):
    class Meta:
        model = Guest
        fields = ["id", "full_name"]
        read_only_fields = fields


class GuestCreateSerializer(serializers.ModelSerializer):
    document = serializers.CharField(
        allow_blank=False,
        max_length=DOCUMENT_MAX_LENGTH,
        trim_whitespace=True,
    )
    nationality = serializers.CharField(
        allow_blank=False,
        min_length=2,
        max_length=2,
        trim_whitespace=True,
        help_text="Código ISO 3166-1 alpha-2, ex.: `BR`.",
    )
    phone = serializers.CharField(
        allow_blank=False,
        max_length=PHONE_MAX_LENGTH,
        trim_whitespace=True,
    )

    class Meta:
        model = Guest
        fields = ["full_name", "document", "phone", "nationality"]
        extra_kwargs = {
            "full_name": {"allow_blank": False, "trim_whitespace": True},
        }

    def validate_document(self, value: str) -> str:
        # Minimo aferido apos normalizar: `12.3` tem 4 caracteres e so 3 alfanumericos.
        normalized = normalize_document(value)
        if len(normalized) < DOCUMENT_MIN_LENGTH:
            raise serializers.ValidationError(
                f"Documento exige ao menos {DOCUMENT_MIN_LENGTH} caracteres alfanuméricos."
            )
        return value.strip()
