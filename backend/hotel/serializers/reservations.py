"""
I/O das reservas (SPEC 4.3/4.4).

Campos financeiros saem como string decimal (`money_field`); a aritmetica
inteira e de `services/pricing.py` (SPEC 0.3).
"""

from __future__ import annotations

from rest_framework import serializers

from hotel.models import Guest, Reservation
from hotel.serializers.common import money_field


class ReservationSummarySerializer(serializers.ModelSerializer):
    """Reserva resumida dentro das abas de hospedes (SPEC 4.3)."""

    class Meta:
        model = Reservation
        fields = ["id", "checkin_date", "checkout_date", "has_vehicle", "checked_in_at"]
        read_only_fields = fields


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
    """Forma do payload de criacao (SPEC 4.4).

    Aqui so mora forma: tipos, campos e a existencia do hospede referenciado.
    As regras de negocio D11 (data no passado) e D13 (minimo 1 noite) vivem em
    `services.reservations.create_reservation` (SPEC 3.4) -- D11 depende de
    "hoje", e serializer que le o relogio torna a regra intestavel sem HTTP
    (SPEC 0.3). O cliente nao percebe a diferenca: as duas continuam saindo
    como `400 VALIDATION_ERROR` com o erro no campo.
    """

    guest_id = serializers.PrimaryKeyRelatedField(
        queryset=Guest.objects.all(),
        source="guest",
        help_text="Id de um hóspede já cadastrado.",
    )

    class Meta:
        model = Reservation
        fields = ["guest_id", "checkin_date", "checkout_date", "has_vehicle"]


class CheckInRequestSerializer(serializers.Serializer):
    """Override do alerta de check-in antecipado (D4)."""

    allow_early = serializers.BooleanField(
        default=False,
        help_text="Reenvie como `true` para confirmar o check-in antes das 14:00.",
    )
