from __future__ import annotations

from rest_framework import serializers

MAX_TEXT_LENGTH = 2000


class AiStatusSerializer(serializers.Serializer):
    enabled = serializers.BooleanField()


class ParseGuestRequestSerializer(serializers.Serializer):
    text = serializers.CharField(max_length=MAX_TEXT_LENGTH, trim_whitespace=True)


class ParsedGuestSerializer(serializers.Serializer):
    # allow_blank: chave obrigatoria, valor vazio = "nao achei".
    full_name = serializers.CharField(max_length=140, allow_blank=True, trim_whitespace=True)
    document = serializers.CharField(max_length=40, allow_blank=True, trim_whitespace=True)
    phone = serializers.CharField(max_length=40, allow_blank=True, trim_whitespace=True)
