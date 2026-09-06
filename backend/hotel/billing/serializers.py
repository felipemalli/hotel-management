from __future__ import annotations

from rest_framework import serializers

from core.serializers import UserMinimalSerializer, money_field
from hotel.billing.models import PricingPolicy

# Precisao de minuto. Sem input_formats o DRF aceita 12:00:30 e o segundo
# entraria numa regra que so tem sentido em minuto.
TIME_FORMAT = {"format": "%H:%M", "input_formats": ["%H:%M"]}


class PricingPolicySerializer(serializers.ModelSerializer):
    weekday_rate = money_field(read_only=True)
    weekend_rate = money_field(read_only=True)
    weekday_park = money_field(read_only=True)
    weekend_park = money_field(read_only=True)
    late_fee_factor = serializers.DecimalField(max_digits=5, decimal_places=4, read_only=True)
    checkin_opens = serializers.TimeField(read_only=True, **TIME_FORMAT)
    checkout_limit = serializers.TimeField(read_only=True, **TIME_FORMAT)
    created_by = UserMinimalSerializer(read_only=True)

    class Meta:
        model = PricingPolicy
        fields = [
            "id",
            "weekday_rate",
            "weekend_rate",
            "weekday_park",
            "weekend_park",
            "late_fee_factor",
            "checkin_opens",
            "checkout_limit",
            "effective_from",
            "note",
            "created_at",
            "created_by",
        ]
        read_only_fields = fields


class PricingPolicyCreateSerializer(serializers.Serializer):
    weekday_rate = money_field(min_value=0)
    weekend_rate = money_field(min_value=0)
    weekday_park = money_field(min_value=0)
    weekend_park = money_field(min_value=0)
    late_fee_factor = serializers.DecimalField(max_digits=5, decimal_places=4, min_value=0)
    checkin_opens = serializers.TimeField(**TIME_FORMAT)
    checkout_limit = serializers.TimeField(**TIME_FORMAT)
    note = serializers.CharField(max_length=200, required=False, allow_blank=True, default="")
