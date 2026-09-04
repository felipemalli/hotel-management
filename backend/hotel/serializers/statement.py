from __future__ import annotations

from typing import Any

from rest_framework import serializers

from hotel.models import PaymentMethod, Reservation
from hotel.serializers.common import (
    GuestMinimalSerializer,
    UserMinimalSerializer,
    money_field,
)
from hotel.services.pricing import Bill


class BillLineSerializer(serializers.Serializer):
    date = serializers.DateField()
    weekday = serializers.CharField(source="weekday_label")
    daily_rate = money_field()
    parking_fee = money_field()


class LateFeeSerializer(serializers.Serializer):
    applied = serializers.BooleanField()
    base_rate = money_field(allow_null=True)
    amount = money_field()


class PaymentSerializer(serializers.Serializer):
    paid_at = serializers.DateTimeField()
    method = serializers.ChoiceField(choices=PaymentMethod.choices)
    paid_by = UserMinimalSerializer()


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


def build_statement(reservation: Reservation, bill: Bill) -> dict[str, Any]:
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
        "payment": _payment_of(reservation),
    }


def _payment_of(reservation: Reservation) -> dict[str, Any] | None:
    # None = conta aberta. Um dict com campos nulos diria "houve pagamento, sem dados".
    if reservation.paid_at is None:
        return None
    return {
        "paid_at": reservation.paid_at,
        "method": reservation.payment_method,
        "paid_by": reservation.paid_by,
    }
