from __future__ import annotations

from typing import Any

from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from core.serializers import UserMinimalSerializer, money_field
from hotel.billing.models import PaymentMethod
from hotel.billing.selectors import payment_of
from hotel.billing.serializers import AccountSerializer, PaymentSerializer
from hotel.guests.models import Guest
from hotel.guests.serializers import GuestMinimalSerializer, GuestSerializer
from hotel.reservations.models import Reservation, ReservationStatus
from hotel.reservations.selectors import (
    ACTIVE_COMPANION_RESERVATIONS_ATTR,
    ACTIVE_RESERVATIONS_ATTR,
    PENDING_COMPANION_RESERVATIONS_ATTR,
    PENDING_RESERVATIONS_ATTR,
    RESERVATION_ORDERINGS,
)
from hotel.reservations.statement import Statement
from hotel.rooms.models import Room
from hotel.rooms.serializers import RoomSummarySerializer


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
    account = AccountSerializer(read_only=True, allow_null=True)
    created_by = UserMinimalSerializer(read_only=True)
    checked_in_by = UserMinimalSerializer(read_only=True)
    checked_out_by = UserMinimalSerializer(read_only=True)
    cancelled_by = UserMinimalSerializer(read_only=True)

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
            "account",
            "created_at",
            "created_by",
            "checked_in_by",
            "checked_out_by",
            "cancelled_by",
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
    search = serializers.CharField(
        required=False,
        allow_blank=True,
        help_text="Nº da reserva (com ou sem '#'), titular ou quarto, por fragmento.",
    )
    checkin_date = serializers.DateField(
        required=False,
        help_text="Só as reservas com esta data de entrada (YYYY-MM-DD).",
    )
    checkout_date = serializers.DateField(
        required=False,
        help_text="Só as reservas com esta data de saída (YYYY-MM-DD).",
    )
    ordering = serializers.ChoiceField(
        choices=RESERVATION_ORDERINGS,
        required=False,
        help_text="Ordena por entrada ou saída; o prefixo `-` inverte. Padrão: entrada crescente.",
    )


class CheckInRequestSerializer(serializers.Serializer):
    allow_early = serializers.BooleanField(
        default=False,
        help_text="Reenvie como `true` para confirmar o check-in antes das 14:00.",
    )


class RoomAvailabilityQuerySerializer(serializers.Serializer):
    checkin_date = serializers.DateField()
    checkout_date = serializers.DateField()
    people = serializers.IntegerField(min_value=1, default=1)

    def validate(self, attrs: dict) -> dict:
        # Forma, nao regra de negocio: daterange invertido levanta DataError no PG.
        if attrs["checkout_date"] <= attrs["checkin_date"]:
            raise serializers.ValidationError(
                {"checkout_date": ["A data de saída deve ser posterior à de entrada."]}
            )
        return attrs


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


class BillLineSerializer(serializers.Serializer):
    date = serializers.DateField()
    weekday = serializers.CharField(source="weekday_label")
    daily_rate = money_field()
    parking_fee = money_field()


class LateFeeDaySerializer(serializers.Serializer):
    date = serializers.DateField()
    weekday = serializers.CharField(source="weekday_label")
    base_rate = money_field()
    amount = money_field()


class LateFeeSerializer(serializers.Serializer):
    applied = serializers.BooleanField()
    amount = money_field()
    days = LateFeeDaySerializer(many=True)


class StatementSerializer(serializers.Serializer):
    reservation_id = serializers.IntegerField()
    guest = GuestMinimalSerializer()
    checked_in_at = serializers.DateTimeField()
    checked_out_at = serializers.DateTimeField()
    lines = BillLineSerializer(many=True)
    subtotal_daily = money_field()
    subtotal_parking = money_field()
    late_fee = LateFeeSerializer()
    total = money_field()
    payment = PaymentSerializer(allow_null=True)


def build_statement(reservation: Reservation, statement: Statement) -> dict[str, Any]:
    return {
        "reservation_id": reservation.pk,
        "guest": reservation.guest,
        "checked_in_at": reservation.checked_in_at,
        "checked_out_at": reservation.checked_out_at,
        "lines": statement.lines,
        "subtotal_daily": statement.subtotal_daily,
        "subtotal_parking": statement.subtotal_parking,
        "late_fee": {
            "applied": statement.late_fee_applied,
            "amount": statement.late_fee,
            "days": statement.late_fees,
        },
        "total": statement.total,
        "payment": payment_of(reservation.account),
    }
