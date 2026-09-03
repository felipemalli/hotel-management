"""
I/O do extrato de checkout (SPEC 4.4).

`build_statement` **nao calcula nada**: remapeia um `pricing.Bill` para o
payload da SPEC 4.4. Todo numero que sai daqui foi produzido pelo motor puro --
e, depois do checkout, foi persistido: `services.reservations.statement` hidrata
o `Bill` das colunas e das `StatementLine`, sem recomputar.
"""

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


class PaymentSerializer(serializers.Serializer):
    """Pagamento unico e integral (D18). `null` no extrato quando nao houve."""

    paid_at = serializers.DateTimeField()
    method = serializers.ChoiceField(choices=PaymentMethod.choices)
    paid_by = UserMinimalSerializer()


class StatementSerializer(serializers.Serializer):
    """Extrato do checkout (SPEC 4.4) -- espelha `pricing.Bill` + o pagamento."""

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
        "payment": _payment_of(reservation),
    }


def _payment_of(reservation: Reservation) -> dict[str, Any] | None:
    """`None` enquanto a conta esta aberta.

    Um dict com os tres campos nulos diria "houve pagamento, sem dados"; o
    cliente ramifica por `payment === null`, que e o que a tela precisa saber.
    A CHECK `resv_payment_complete` garante que os tres andam juntos, entao
    testar um responde pelos tres.
    """
    if reservation.paid_at is None:
        return None
    return {
        "paid_at": reservation.paid_at,
        "method": reservation.payment_method,
        "paid_by": reservation.paid_by,
    }
