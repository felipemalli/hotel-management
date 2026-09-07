from __future__ import annotations

from rest_framework import serializers

from core.serializers import UserMinimalSerializer, money_field
from hotel.billing.engine import WEEKDAY_KIND, WEEKEND_KIND
from hotel.billing.models import AccountStatus, PaymentMethod, PricingPolicy

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


class StayQuoteQuerySerializer(serializers.Serializer):
    checkin_date = serializers.DateField()
    checkout_date = serializers.DateField()
    has_vehicle = serializers.BooleanField(required=False, default=False)

    def validate(self, attrs: dict) -> dict:
        if attrs["checkout_date"] <= attrs["checkin_date"]:
            raise serializers.ValidationError(
                {"checkout_date": ["A data de saída deve ser posterior à de entrada."]}
            )
        return attrs


class QuoteBucketSerializer(serializers.Serializer):
    kind = serializers.ChoiceField(choices=[WEEKDAY_KIND, WEEKEND_KIND])
    nights = serializers.IntegerField()
    daily_rate = money_field()
    parking_fee = money_field()
    subtotal_daily = money_field()
    subtotal_parking = money_field()


class StayQuoteSerializer(serializers.Serializer):
    nights = serializers.IntegerField()
    buckets = QuoteBucketSerializer(many=True)
    subtotal_daily = money_field()
    subtotal_parking = money_field()
    total = money_field()


class PricingPolicyCreateSerializer(serializers.Serializer):
    weekday_rate = money_field(min_value=0)
    weekend_rate = money_field(min_value=0)
    weekday_park = money_field(min_value=0)
    weekend_park = money_field(min_value=0)
    late_fee_factor = serializers.DecimalField(max_digits=5, decimal_places=4, min_value=0)
    checkin_opens = serializers.TimeField(**TIME_FORMAT)
    checkout_limit = serializers.TimeField(**TIME_FORMAT)
    note = serializers.CharField(max_length=200, required=False, allow_blank=True, default="")


class PaymentSerializer(serializers.Serializer):
    paid_at = serializers.DateTimeField()
    method = serializers.ChoiceField(choices=PaymentMethod.choices)
    received_by = UserMinimalSerializer(read_only=True)


class AccountSerializer(serializers.Serializer):
    id = serializers.IntegerField(read_only=True)
    status = serializers.ChoiceField(choices=AccountStatus.choices, read_only=True)
    total_amount = money_field(read_only=True, allow_null=True)
    opened_at = serializers.DateTimeField(read_only=True)
    closed_at = serializers.DateTimeField(read_only=True, allow_null=True)
    payment = PaymentSerializer(read_only=True, allow_null=True)
