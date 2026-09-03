"""
I/O do extrato de checkout (SPEC 4.4).

`build_statement` **nao calcula nada**: remapeia um `pricing.Bill` para o
payload da SPEC 4.4. Todo numero que sai daqui foi produzido pelo motor puro.
"""

from __future__ import annotations

from typing import Any

from rest_framework import serializers

from hotel.models import Reservation
from hotel.serializers.common import GuestMinimalSerializer, money_field
from hotel.services.pricing import Bill


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
