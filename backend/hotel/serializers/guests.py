from __future__ import annotations

from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from hotel.models import Guest
from hotel.normalization import (
    DOCUMENT_MAX_LENGTH,
    DOCUMENT_MIN_LENGTH,
    PHONE_MAX_LENGTH,
    normalize_document,
)
from hotel.selectors import (
    ACTIVE_COMPANION_RESERVATIONS_ATTR,
    ACTIVE_RESERVATIONS_ATTR,
    PENDING_COMPANION_RESERVATIONS_ATTR,
    PENDING_RESERVATIONS_ATTR,
)
from hotel.serializers.reservations import ReservationSummarySerializer


class GuestSerializer(serializers.ModelSerializer):
    class Meta:
        model = Guest
        fields = ["id", "full_name", "document", "phone", "nationality", "created_at"]
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


class GuestInHotelSerializer(GuestSerializer):
    active_reservation = serializers.SerializerMethodField()

    class Meta(GuestSerializer.Meta):
        fields = [*GuestSerializer.Meta.fields, "active_reservation"]

    @extend_schema_field(ReservationSummarySerializer(allow_null=True))
    def get_active_reservation(self, guest: Guest) -> dict | None:
        reservations = _merged(guest, ACTIVE_RESERVATIONS_ATTR, ACTIVE_COMPANION_RESERVATIONS_ATTR)
        if not reservations:
            return None
        return ReservationSummarySerializer(reservations[0]).data


class GuestPendingCheckinSerializer(GuestSerializer):
    pending_reservations = serializers.SerializerMethodField()

    class Meta(GuestSerializer.Meta):
        fields = [*GuestSerializer.Meta.fields, "pending_reservations"]

    @extend_schema_field(ReservationSummarySerializer(many=True))
    def get_pending_reservations(self, guest: Guest) -> list[dict]:
        reservations = _merged(
            guest, PENDING_RESERVATIONS_ATTR, PENDING_COMPANION_RESERVATIONS_ATTR
        )
        return ReservationSummarySerializer(reservations, many=True).data


def _merged(guest: Guest, own_attr: str, companion_attr: str) -> list:
    # Ordena em Python: sao dois prefetches, e concatenar ja ordenados
    # intercalaria vencidas no meio.
    own = getattr(guest, own_attr, None) or []
    companion = getattr(guest, companion_attr, None) or []
    return sorted([*own, *companion], key=lambda r: (r.checkin_date, r.pk))
