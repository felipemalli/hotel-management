from __future__ import annotations

from typing import Any

from django.contrib.auth import get_user_model
from rest_framework import serializers

from hotel.models import Guest

MONEY = {"max_digits": 10, "decimal_places": 2}


def money_field(**kwargs: Any) -> serializers.DecimalField:
    return serializers.DecimalField(**MONEY, **kwargs)


class ErrorEnvelopeSerializer(serializers.Serializer):
    code = serializers.CharField()
    detail = serializers.CharField()
    extra = serializers.DictField()


class GuestMinimalSerializer(serializers.ModelSerializer):
    class Meta:
        model = Guest
        fields = ["id", "full_name"]
        read_only_fields = fields


class UserMinimalSerializer(serializers.ModelSerializer):
    class Meta:
        model = get_user_model()
        fields = ["id", "username"]
        read_only_fields = fields
