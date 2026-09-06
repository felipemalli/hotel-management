from __future__ import annotations

from rest_framework import serializers

MAX_MESSAGE_LENGTH = 2000


class AiStatusSerializer(serializers.Serializer):
    enabled = serializers.BooleanField()


class CopilotRequestSerializer(serializers.Serializer):
    message = serializers.CharField(
        max_length=MAX_MESSAGE_LENGTH,
        trim_whitespace=True,
        help_text="A pergunta do atendente, em linguagem natural.",
    )


class ProposedActionSerializer(serializers.Serializer):
    type = serializers.ChoiceField(choices=["check_in", "checkout"])
    reservation_id = serializers.IntegerField()
    guest_name = serializers.CharField()


class CopilotReplySerializer(serializers.Serializer):
    reply = serializers.CharField()
    proposed_action = ProposedActionSerializer(allow_null=True)
