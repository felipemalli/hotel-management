"""
Serializers da API (SPEC 4.3-4.4).

Fronteira de I/O e nada mais. Nenhum calculo de dinheiro acontece aqui
(SPEC 0.3: dinheiro e de `services/pricing.py`); o que existe e serializacao
de `Decimal` -- e o `DecimalField` do DRF garante a saida como **string**
decimal (`"120.00"`), nunca como numero de ponto flutuante.

Mascaramento (SPEC 2.2) e decidido por endpoint, nao por flag de runtime:
`GuestSerializer` (listagens e abas) SEMPRE mascara; `GuestDetailSerializer`
(detalhe) devolve o valor completo.
"""

from __future__ import annotations

from typing import Any

from django.utils import timezone
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from hotel.crypto import (
    DOCUMENT_MAX_LENGTH,
    DOCUMENT_MIN_LENGTH,
    PHONE_MAX_LENGTH,
    PHONE_MIN_LENGTH,
    blind_index,
    mask_pii,
    normalize_document,
    normalize_phone,
)
from hotel.exceptions import DuplicateDocumentError
from hotel.models import Guest, Reservation
from hotel.selectors import ACTIVE_RESERVATIONS_ATTR, PENDING_RESERVATIONS_ATTR
from hotel.services.pricing import Bill

MONEY = {"max_digits": 10, "decimal_places": 2}


def money_field(**kwargs: Any) -> serializers.DecimalField:
    """Dinheiro sai como string decimal (SPEC 0.3/4.1)."""
    return serializers.DecimalField(**MONEY, **kwargs)


# -- Erros --------------------------------------------------------------------


class ErrorEnvelopeSerializer(serializers.Serializer):
    """Envelope unico de erro (SPEC 4.1). Existe para documentar o contrato."""

    code = serializers.CharField()
    detail = serializers.CharField()
    extra = serializers.DictField()


# -- Hospedes -----------------------------------------------------------------


class GuestSerializer(serializers.ModelSerializer):
    """Listagens e abas: PII **sempre** mascarada (SPEC 2.2)."""

    document = serializers.SerializerMethodField()
    phone = serializers.SerializerMethodField()

    class Meta:
        model = Guest
        fields = ["id", "full_name", "document", "phone", "created_at"]

    @extend_schema_field(OpenApiTypes.STR)
    def get_document(self, guest: Guest) -> str:
        return mask_pii(guest.document)

    @extend_schema_field(OpenApiTypes.STR)
    def get_phone(self, guest: Guest) -> str:
        return mask_pii(guest.phone)


class GuestDetailSerializer(serializers.ModelSerializer):
    """Detalhe: valor completo -- o atendente confere o documento no balcao.

    Minimizacao (SPEC 2.2): o dado pleno so trafega quando explicitamente
    solicitado por id.
    """

    class Meta:
        model = Guest
        fields = ["id", "full_name", "document", "phone", "created_at"]
        read_only_fields = fields


class GuestCreateSerializer(serializers.ModelSerializer):
    """Cadastro (SPEC 4.3). Os 3 campos minimos do briefing sao obrigatorios."""

    class Meta:
        model = Guest
        fields = ["full_name", "document", "phone"]
        extra_kwargs = {
            "full_name": {"allow_blank": False, "trim_whitespace": True},
            # `EncryptedCharField` e um TextField (o ciphertext nao cabe em
            # CharField), entao o ModelSerializer herda `max_length=None` e
            # aceitaria um documento de megabytes. O minimo ja era validado;
            # o maximo faltava.
            "document": {"allow_blank": False, "max_length": DOCUMENT_MAX_LENGTH},
            "phone": {"allow_blank": False, "max_length": PHONE_MAX_LENGTH},
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

    def validate(self, attrs: dict) -> dict:
        """Documento repetido e conflito de recurso (409), nao payload invalido (400).

        `DuplicateDocumentError` nao e `ValidationError`, logo atravessa o
        `is_valid()` e chega ao handler como 409 DUPLICATE_DOCUMENT (D12).
        """
        assert_document_available(attrs["document"])
        return attrs


def assert_document_available(document: str) -> None:
    """Guarda de leitura para D12; a corrida fica com a constraint unica."""
    if Guest.objects.filter(document_hash=blind_index(normalize_document(document))).exists():
        raise DuplicateDocumentError


# -- Reservas -----------------------------------------------------------------


class ReservationSummarySerializer(serializers.ModelSerializer):
    """Reserva resumida dentro das abas de hospedes (SPEC 4.3)."""

    class Meta:
        model = Reservation
        fields = ["id", "checkin_date", "checkout_date", "has_vehicle", "checked_in_at"]
        read_only_fields = fields


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


class ReservationSerializer(serializers.ModelSerializer):
    """Reserva completa. Campos financeiros ficam `null` ate o checkout."""

    guest_id = serializers.IntegerField(read_only=True)
    total_daily = money_field(read_only=True)
    total_parking = money_field(read_only=True)
    late_fee = money_field(read_only=True)
    total_amount = money_field(read_only=True)

    class Meta:
        model = Reservation
        fields = [
            "id",
            "guest_id",
            "checkin_date",
            "checkout_date",
            "has_vehicle",
            "status",
            "checked_in_at",
            "checked_out_at",
            "total_daily",
            "total_parking",
            "late_fee",
            "total_amount",
            "created_at",
        ]
        read_only_fields = fields


class ReservationCreateSerializer(serializers.ModelSerializer):
    """Criacao (SPEC 4.4). Validacoes de D11 e D13 vivem aqui."""

    guest_id = serializers.PrimaryKeyRelatedField(
        queryset=Guest.objects.all(),
        source="guest",
        help_text="Id de um hóspede já cadastrado.",
    )

    class Meta:
        model = Reservation
        fields = ["guest_id", "checkin_date", "checkout_date", "has_vehicle"]

    def validate_checkin_date(self, value):
        # D11: reserva e compromisso futuro. O passado entra no sistema pelos
        # fatos (check-in/checkout reais), nunca pelo agendamento.
        today = timezone.localdate()
        if value < today:
            raise serializers.ValidationError("Data de check-in não pode ser no passado.")
        return value

    def validate(self, attrs: dict) -> dict:
        # D13: agendamento exige no minimo 1 noite (espelha a constraint SPEC 1.5).
        if attrs["checkout_date"] <= attrs["checkin_date"]:
            raise serializers.ValidationError(
                {"checkout_date": ["Data de checkout deve ser posterior à de check-in."]}
            )
        return attrs


class CheckInRequestSerializer(serializers.Serializer):
    """Override do alerta de check-in antecipado (D4)."""

    allow_early = serializers.BooleanField(
        default=False,
        help_text="Reenvie como `true` para confirmar o check-in antes das 14:00.",
    )


# -- Extrato de checkout ------------------------------------------------------


class GuestMinimalSerializer(serializers.ModelSerializer):
    """Identificacao do hospede no extrato -- sem PII (SPEC 2.2)."""

    class Meta:
        model = Guest
        fields = ["id", "full_name"]
        read_only_fields = fields


class BillLineSerializer(serializers.Serializer):
    """Uma diaria do extrato (SPEC 4.4)."""

    date = serializers.DateField()
    weekday = serializers.CharField(source="weekday_label")
    daily_rate = money_field()
    parking_fee = money_field()


class LateFeeSerializer(serializers.Serializer):
    """Multa de checkout tardio (D3). `base_rate` e null quando nao houve multa."""

    applied = serializers.BooleanField()
    base_rate = money_field(allow_null=True)
    amount = money_field()


class StatementSerializer(serializers.Serializer):
    """Extrato do checkout (SPEC 4.4) -- espelha `pricing.Bill`."""

    reservation_id = serializers.IntegerField()
    guest = GuestMinimalSerializer()
    checked_in_at = serializers.DateTimeField()
    checked_out_at = serializers.DateTimeField()
    lines = BillLineSerializer(many=True)
    subtotal_daily = money_field()
    subtotal_parking = money_field()
    late_fee = LateFeeSerializer()
    total = money_field()


def build_statement(reservation: Reservation, bill: Bill) -> dict[str, Any]:
    """Monta o payload do extrato. Nao calcula nada: apenas remapeia o `Bill`."""
    return {
        "reservation_id": reservation.pk,
        "guest": reservation.guest,
        "checked_in_at": reservation.checked_in_at,
        "checked_out_at": reservation.checked_out_at,
        "lines": bill.lines,
        "subtotal_daily": bill.subtotal_daily,
        "subtotal_parking": bill.subtotal_parking,
        "late_fee": {
            "applied": bill.late_fee_applied,
            "base_rate": bill.late_fee_base,
            "amount": bill.late_fee,
        },
        "total": bill.total,
    }
