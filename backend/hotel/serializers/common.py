"""Shim parcial: os helpers genericos vivem em `core.serializers` / `core.money`."""

from __future__ import annotations

from rest_framework import serializers

from core.money import MONEY
from core.serializers import ErrorEnvelopeSerializer, UserMinimalSerializer, money_field
from hotel.models import Guest


class GuestMinimalSerializer(serializers.ModelSerializer):
    class Meta:
        model = Guest
        fields = ["id", "full_name"]
        read_only_fields = fields


__all__ = [
    "MONEY",
    "ErrorEnvelopeSerializer",
    "GuestMinimalSerializer",
    "UserMinimalSerializer",
    "money_field",
]
