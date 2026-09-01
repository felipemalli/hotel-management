"""
Serializers da IA (SPEC 7.1).

Dois papeis distintos, de proposito:

- `ParseGuestRequestSerializer` valida o que o **atendente** manda. Falha aqui
  e `400 VALIDATION_ERROR` (SPEC 4.1).
- `ParsedGuestSerializer` valida o que o **modelo** devolveu. Saida de LLM e
  input nao confiavel (SPEC 7.2): se faltar chave, se vier tipo errado ou se
  vier texto longo demais para o cadastro, a resposta nao passa e a view
  levanta `502 AI_UPSTREAM_ERROR`.

Nada aqui persiste: o resultado so preenche o formulario, e o atendente revisa
e submete (human-in-the-loop, SPEC 7.1).
"""

from __future__ import annotations

from rest_framework import serializers

# Teto do texto colado: uma linha de documento ou um recado de reserva por
# telefone. Impede que o formulario vire um canal de upload de texto.
MAX_TEXT_LENGTH = 2000


class AiStatusSerializer(serializers.Serializer):
    """`GET /api/ai/status/` -- o frontend so renderiza o botao se `enabled`."""

    enabled = serializers.BooleanField()


class ParseGuestRequestSerializer(serializers.Serializer):
    """`POST /api/ai/parse-guest/` -- texto livre colado pelo atendente."""

    text = serializers.CharField(max_length=MAX_TEXT_LENGTH, trim_whitespace=True)


class ParsedGuestSerializer(serializers.Serializer):
    """Extracao devolvida ao formulario -- as tres chaves da SPEC 7.1.

    `allow_blank` porque um texto pode legitimamente nao trazer o telefone: a
    chave e obrigatoria (faltar chave e falha do modelo, SPEC 7.2), o valor
    vazio e um "nao achei" honesto que o atendente completa a mao. Os limites
    espelham `Guest` (SPEC 1.2) para nao oferecer ao formulario um valor que o
    cadastro rejeitaria.
    """

    full_name = serializers.CharField(max_length=140, allow_blank=True, trim_whitespace=True)
    document = serializers.CharField(max_length=40, allow_blank=True, trim_whitespace=True)
    phone = serializers.CharField(max_length=40, allow_blank=True, trim_whitespace=True)
