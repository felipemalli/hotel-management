"""
Pecas compartilhadas dos serializers (SPEC 4.1/4.3).

Aqui mora o que mais de um recurso usa: o campo de dinheiro e o envelope de
erro. Nada especifico de hospede ou reserva entra neste modulo -- e o teto de
"comum" que impede este arquivo de virar o despejo do pacote.
"""

from __future__ import annotations

from typing import Any

from django.contrib.auth import get_user_model
from rest_framework import serializers

from hotel.models import Guest

MONEY = {"max_digits": 10, "decimal_places": 2}


def money_field(**kwargs: Any) -> serializers.DecimalField:
    """Dinheiro sai como string decimal (SPEC 0.3/4.1)."""
    return serializers.DecimalField(**MONEY, **kwargs)


class ErrorEnvelopeSerializer(serializers.Serializer):
    """Envelope unico de erro (SPEC 4.1). Existe para documentar o contrato."""

    code = serializers.CharField()
    detail = serializers.CharField()
    extra = serializers.DictField()


class GuestMinimalSerializer(serializers.ModelSerializer):
    """Identificacao do hospede sem documento/telefone (SPEC 2.1).

    Usado pelo extrato: o recibo identifica quem se hospedou, e nao ha razao
    para repetir PII num documento que circula impresso.
    """

    class Meta:
        model = Guest
        fields = ["id", "full_name"]
        read_only_fields = fields


class UserMinimalSerializer(serializers.ModelSerializer):
    """Quem fez a acao. `username` e nao nome civil: e a identidade operacional.

    Sem e-mail, sem papel: o cliente que precisa do papel pergunta por si em
    `GET /api/auth/me/`, e vazar o papel de OUTRO usuario num extrato seria
    informacao a mais sem consumidor.
    """

    class Meta:
        model = get_user_model()
        fields = ["id", "username"]
        read_only_fields = fields
