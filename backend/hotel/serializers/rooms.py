"""
I/O do inventario de quartos (SPEC 4.3/4.4).
"""

from __future__ import annotations

from rest_framework import serializers

from hotel.models import Room


class RoomSerializer(serializers.ModelSerializer):
    """Quarto completo (listagem e detalhe administrativo)."""

    class Meta:
        model = Room
        fields = ["id", "number", "capacity", "is_active", "created_at"]
        read_only_fields = fields


class RoomSummarySerializer(serializers.ModelSerializer):
    """Quarto dentro de uma reserva: so o que identifica."""

    class Meta:
        model = Room
        fields = ["id", "number"]
        read_only_fields = fields


class RoomCreateSerializer(serializers.ModelSerializer):
    """Forma do cadastro. Unicidade do numero e do servico (400 no campo)."""

    # Declarado explicitamente para NAO herdar `UniqueValidator` da constraint:
    # a duplicata e decidida pelo banco sob savepoint, como em D12, e nao por
    # uma leitura previa que perde a corrida.
    number = serializers.CharField(max_length=10, allow_blank=False, trim_whitespace=True)
    capacity = serializers.IntegerField(min_value=1)

    class Meta:
        model = Room
        fields = ["number", "capacity"]


class RoomUpdateSerializer(serializers.Serializer):
    """`PATCH` de capacidade e operação. Sem `number`: renumerar quarto é mudar
    de quarto, e o histórico aponta para o número antigo."""

    capacity = serializers.IntegerField(min_value=1, required=False)
    is_active = serializers.BooleanField(required=False)


class RoomAvailabilityQuerySerializer(serializers.Serializer):
    """Filtros de `GET /api/rooms/available/`.

    O intervalo nao vazio e validado aqui de proposito, e o docstring diz por
    que: **nao e D13 e nao le o relogio**. `daterange('2025-03-09',
    '2025-03-07')` levanta `DataError` no PostgreSQL -- 500 numa consulta de
    leitura. Recusar `checkout <= checkin` e FORMA (um intervalo invertido nao
    e um intervalo), enquanto D13 e a regra de negocio "no minimo uma noite",
    que continua no servico. `today` vem da view, nunca daqui.
    """

    checkin_date = serializers.DateField()
    checkout_date = serializers.DateField()
    people = serializers.IntegerField(min_value=1, default=1)

    def validate(self, attrs: dict) -> dict:
        if attrs["checkout_date"] <= attrs["checkin_date"]:
            raise serializers.ValidationError(
                {"checkout_date": ["A data de saída deve ser posterior à de entrada."]}
            )
        return attrs
