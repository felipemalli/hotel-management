from __future__ import annotations

from rest_framework import serializers

from hotel.models import Guest, PaymentMethod, Reservation, ReservationStatus, Room
from hotel.serializers.common import (
    GuestMinimalSerializer,
    UserMinimalSerializer,
    money_field,
)
from hotel.serializers.rooms import RoomSummarySerializer


class ReservationSummarySerializer(serializers.ModelSerializer):
    room = RoomSummarySerializer(read_only=True)

    class Meta:
        model = Reservation
        fields = [
            # guest_id e o titular. O front deriva acompanhante de guest_id != row.id.
            "id",
            "guest_id",
            "room",
            "checkin_date",
            "checkout_date",
            "has_vehicle",
            "checked_in_at",
        ]
        read_only_fields = fields


class ReservationSerializer(serializers.ModelSerializer):
    guest_id = serializers.IntegerField(read_only=True)
    room = RoomSummarySerializer(read_only=True)
    companions = GuestMinimalSerializer(many=True, read_only=True)
    total_daily = money_field(read_only=True)
    total_parking = money_field(read_only=True)
    late_fee = money_field(read_only=True)
    late_fee_base = money_field(read_only=True)
    total_amount = money_field(read_only=True)
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
            "companions",
            "room",
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
    guest_id = serializers.PrimaryKeyRelatedField(
        queryset=Guest.objects.all(),
        source="guest",
        help_text="Id de um hóspede já cadastrado.",
    )
    room_id = serializers.PrimaryKeyRelatedField(
        queryset=Room.objects.all(),
        source="room",
        help_text="Id do quarto que a reserva vai ocupar.",
    )
    companion_ids = serializers.PrimaryKeyRelatedField(
        queryset=Guest.objects.all(),
        source="companions",
        many=True,
        required=False,
        default=list,
        help_text="Ids dos acompanhantes já cadastrados como hóspedes.",
    )

    class Meta:
        model = Reservation
        fields = [
            "guest_id",
            "room_id",
            "companion_ids",
            "checkin_date",
            "checkout_date",
            "has_vehicle",
        ]


class PaymentRequestSerializer(serializers.Serializer):
    payment_method = serializers.ChoiceField(
        choices=PaymentMethod.choices,
        help_text="Como a conta foi paga.",
    )


class ReservationListQuerySerializer(serializers.Serializer):
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
    allow_early = serializers.BooleanField(
        default=False,
        help_text="Reenvie como `true` para confirmar o check-in antes das 14:00.",
    )
