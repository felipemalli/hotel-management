"""
I/O das reservas (SPEC 4.3/4.4).

Campos financeiros saem como string decimal (`money_field`); a aritmetica
inteira e de `services/pricing.py` (SPEC 0.3).
"""

from __future__ import annotations

from rest_framework import serializers

from hotel.models import Guest, PaymentMethod, Reservation, ReservationStatus
from hotel.serializers.common import UserMinimalSerializer, money_field


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
    late_fee_base = money_field(read_only=True)
    total_amount = money_field(read_only=True)
    # Atores como objeto e nao como id cru: a tela mostra "quem", e um id
    # obrigaria o cliente a uma segunda chamada por linha da lista.
    created_by = UserMinimalSerializer(read_only=True)
    checked_in_by = UserMinimalSerializer(read_only=True)
    checked_out_by = UserMinimalSerializer(read_only=True)
    cancelled_by = UserMinimalSerializer(read_only=True)
    paid_by = UserMinimalSerializer(read_only=True)

    class Meta:
        model = Reservation
        fields = [
            "id",
            "guest_id",
            "policy_id",
            "checkin_date",
            "checkout_date",
            "has_vehicle",
            "status",
            "checked_in_at",
            "checked_out_at",
            "cancelled_at",
            "total_daily",
            "total_parking",
            "late_fee",
            "late_fee_base",
            "total_amount",
            "paid_at",
            "payment_method",
            "created_at",
            "created_by",
            "checked_in_by",
            "checked_out_by",
            "cancelled_by",
            "paid_by",
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


class PaymentRequestSerializer(serializers.Serializer):
    """Forma de pagamento (D18). Valor nao entra: o pagamento e integral."""

    payment_method = serializers.ChoiceField(
        choices=PaymentMethod.choices,
        help_text="Como a conta foi paga.",
    )


class ReservationListQuerySerializer(serializers.Serializer):
    """Filtros de `GET /api/reservations/` (SPEC 4.2).

    Com um parametro so, dois metodos privados na view eram mais baratos; com
    tres, a consolidacao se paga: os tipos, o enum e as mensagens de erro
    passam a sair do mesmo lugar que documenta o schema, em vez de `int(raw)`
    dentro de um `try` na view.
    """

    status = serializers.ChoiceField(
        choices=ReservationStatus.choices,
        required=False,
        help_text="Filtra por status.",
    )
    guest = serializers.IntegerField(
        required=False,
        min_value=1,
        help_text="Id do hóspede.",
    )
    paid = serializers.BooleanField(
        required=False,
        allow_null=True,
        default=None,
        help_text="`true` só contas pagas, `false` só em aberto.",
    )


class CheckInRequestSerializer(serializers.Serializer):
    """Override do alerta de check-in antecipado (D4)."""

    allow_early = serializers.BooleanField(
        default=False,
        help_text="Reenvie como `true` para confirmar o check-in antes das 14:00.",
    )
