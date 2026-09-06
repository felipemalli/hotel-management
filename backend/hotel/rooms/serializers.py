from __future__ import annotations

from rest_framework import serializers

from hotel.rooms.models import Room


class RoomSerializer(serializers.ModelSerializer):
    class Meta:
        model = Room
        fields = ["id", "number", "capacity", "is_active", "created_at"]
        read_only_fields = fields


class RoomSummarySerializer(serializers.ModelSerializer):
    class Meta:
        model = Room
        fields = ["id", "number"]
        read_only_fields = fields


class RoomCreateSerializer(serializers.ModelSerializer):
    # Declarado para nao herdar UniqueValidator: a duplicata e do banco, sob savepoint.
    number = serializers.CharField(max_length=10, allow_blank=False, trim_whitespace=True)
    capacity = serializers.IntegerField(min_value=1)

    class Meta:
        model = Room
        fields = ["number", "capacity"]


class RoomUpdateSerializer(serializers.Serializer):
    capacity = serializers.IntegerField(min_value=1, required=False)
    is_active = serializers.BooleanField(required=False)
