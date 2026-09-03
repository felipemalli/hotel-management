"""
I/O dos hospedes (SPEC 4.3).

Fronteira de I/O e nada mais: nenhuma regra de negocio e nenhuma leitura de
relogio (SPEC 0.3). Formato de documento e telefone (D9) e **forma** e fica
aqui; unicidade de documento (D12) depende do estado do banco e mora em
`services.guests.create_guest`.
"""

from __future__ import annotations

from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from hotel.models import Guest
from hotel.normalization import (
    DOCUMENT_MAX_LENGTH,
    DOCUMENT_MIN_LENGTH,
    PHONE_MAX_LENGTH,
    PHONE_MIN_LENGTH,
    normalize_document,
    normalize_phone,
)
from hotel.selectors import ACTIVE_RESERVATIONS_ATTR, PENDING_RESERVATIONS_ATTR
from hotel.serializers.reservations import ReservationSummarySerializer


class GuestSerializer(serializers.ModelSerializer):
    """Listagens, detalhe e abas: valor gravado, ja normalizado (SPEC 2.1)."""

    class Meta:
        model = Guest
        fields = ["id", "full_name", "document", "phone", "created_at"]
        read_only_fields = fields


class GuestCreateSerializer(serializers.ModelSerializer):
    """Forma do cadastro (SPEC 4.3). Os 3 campos minimos do briefing sao obrigatorios.

    Formato de documento e telefone (D9) e forma, e fica aqui. Unicidade do
    documento (D12) depende do estado do banco e e regra de negocio: mora em
    `services.guests.create_guest` (SPEC 3.4), que traduz a violacao da
    constraint nomeada em `409 DUPLICATE_DOCUMENT`.

    `document` e `phone` sao declarados explicitamente para carregar
    `allow_blank=False` e o maximo de entrada de D9 -- e para que o duplicado
    nunca saia como `400 VALIDATION_ERROR` comparando valor nao normalizado.
    """

    document = serializers.CharField(
        allow_blank=False,
        max_length=DOCUMENT_MAX_LENGTH,
        trim_whitespace=True,
    )
    phone = serializers.CharField(
        allow_blank=False,
        max_length=PHONE_MAX_LENGTH,
        trim_whitespace=True,
    )

    class Meta:
        model = Guest
        fields = ["full_name", "document", "phone"]
        extra_kwargs = {
            "full_name": {"allow_blank": False, "trim_whitespace": True},
        }

    def validate_document(self, value: str) -> str:
        # Minimo aferido APOS a normalizacao de D9 (alfanumerico maiusculo):
        # `12.3` tem 4 caracteres, mas so 3 alfanumericos.
        normalized = normalize_document(value)
        if len(normalized) < DOCUMENT_MIN_LENGTH:
            raise serializers.ValidationError(
                f"Documento exige ao menos {DOCUMENT_MIN_LENGTH} caracteres alfanuméricos."
            )
        return value.strip()

    def validate_phone(self, value: str) -> str:
        if len(normalize_phone(value)) < PHONE_MIN_LENGTH:
            raise serializers.ValidationError(
                f"Telefone exige ao menos {PHONE_MIN_LENGTH} dígitos."
            )
        return value.strip()


class GuestInHotelSerializer(GuestSerializer):
    """Aba "no hotel" (RF4). `active_reservation` e unico pela constraint SPEC 1.5."""

    active_reservation = serializers.SerializerMethodField()

    class Meta(GuestSerializer.Meta):
        fields = [*GuestSerializer.Meta.fields, "active_reservation"]

    @extend_schema_field(ReservationSummarySerializer(allow_null=True))
    def get_active_reservation(self, guest: Guest) -> dict | None:
        reservations = getattr(guest, ACTIVE_RESERVATIONS_ATTR, None) or []
        if not reservations:
            return None
        return ReservationSummarySerializer(reservations[0]).data


class GuestPendingCheckinSerializer(GuestSerializer):
    """Aba "check-in pendente" (RF5). Plural: um hospede pode ter varias futuras."""

    pending_reservations = serializers.SerializerMethodField()

    class Meta(GuestSerializer.Meta):
        fields = [*GuestSerializer.Meta.fields, "pending_reservations"]

    @extend_schema_field(ReservationSummarySerializer(many=True))
    def get_pending_reservations(self, guest: Guest) -> list[dict]:
        reservations = getattr(guest, PENDING_RESERVATIONS_ATTR, None) or []
        return ReservationSummarySerializer(reservations, many=True).data
