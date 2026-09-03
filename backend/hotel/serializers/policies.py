"""
I/O da politica de tarifas (SPEC 4.3/4.4).
"""

from __future__ import annotations

from rest_framework import serializers

from hotel.models import PricingPolicy
from hotel.serializers.common import UserMinimalSerializer, money_field

# Precisao de MINUTO na entrada e na saida. Sem `input_formats`, o DRF aceita
# "12:00:30" e o segundo entraria numa regra que so tem sentido em minuto --
# um checkout as 12:00:29 ficaria isento por causa de um digito que ninguem
# digitou de proposito.
TIME_FORMAT = {"format": "%H:%M", "input_formats": ["%H:%M"]}


class PricingPolicySerializer(serializers.ModelSerializer):
    """Politica publicada. Somente leitura: a tabela e append-only."""

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
    """Forma da publicacao (SPEC 4.4). Sete valores e uma nota.

    `effective_from` NAO entra: vigencia e definida pelo servidor (`now`
    injetado pela view). Aceita-la do cliente permitiria reescrever o passado
    de reservas ja fechadas.

    `Serializer` e nao `ModelSerializer`: a validacao de ordem entre horarios e
    a gravacao sao de `services.catalog.create_policy`, e um `ModelSerializer`
    aqui traria `create()` de brinde -- um caminho de escrita passando por cima
    do servico.
    """

    weekday_rate = money_field(min_value=0)
    weekend_rate = money_field(min_value=0)
    weekday_park = money_field(min_value=0)
    weekend_park = money_field(min_value=0)
    late_fee_factor = serializers.DecimalField(max_digits=5, decimal_places=4, min_value=0)
    checkin_opens = serializers.TimeField(**TIME_FORMAT)
    checkout_limit = serializers.TimeField(**TIME_FORMAT)
    note = serializers.CharField(max_length=200, required=False, allow_blank=True, default="")
