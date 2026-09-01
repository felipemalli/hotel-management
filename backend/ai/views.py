"""
Views da IA (SPEC 7.1). Autenticadas por JWT como todo o resto (SPEC 4.2).

Views finas, mesma disciplina da SPEC 0.3: elas resolvem HTTP, consultam o
portao de fallback e delegam. Quem fala com o provedor e `ai/client.py`; quem
julga a resposta do modelo e `ai/serializers.py`.

`@extend_schema` em ambas (SPEC 4.4): as duas rotas aparecem em `/api/docs/`
com request, response e os erros `AI_DISABLED` / `AI_UPSTREAM_ERROR`.
"""

from __future__ import annotations

from drf_spectacular.utils import OpenApiExample, OpenApiResponse, extend_schema
from rest_framework.decorators import api_view, throttle_classes
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.throttling import UserRateThrottle

from ai.client import extract_guest_fields
from ai.config import ai_enabled
from ai.exceptions import AiDisabledError, AiUpstreamError
from ai.serializers import (
    AiStatusSerializer,
    ParsedGuestSerializer,
    ParseGuestRequestSerializer,
)
from hotel.serializers import ErrorEnvelopeSerializer

AI_TAG = "ai"

AI_DISABLED_RESPONSE = OpenApiResponse(
    response=ErrorEnvelopeSerializer,
    description="Nenhuma `ANTHROPIC_API_KEY` configurada — a feature está desligada (SPEC 7.2).",
    examples=[
        OpenApiExample(
            "AI_DISABLED",
            value={
                "code": "AI_DISABLED",
                "detail": "Preenchimento por IA indisponível: nenhuma chave configurada.",
                "extra": {},
            },
            response_only=True,
        )
    ],
)

AI_UPSTREAM_RESPONSE = OpenApiResponse(
    response=ErrorEnvelopeSerializer,
    description="Timeout, status != 200, JSON inválido ou campo faltante (SPEC 7.2).",
    examples=[
        OpenApiExample(
            "AI_UPSTREAM_ERROR",
            value={
                "code": "AI_UPSTREAM_ERROR",
                "detail": (
                    "O provedor de IA não devolveu uma extração utilizável. Preencha à mão."
                ),
                "extra": {},
            },
            response_only=True,
        )
    ],
)


class AiRateThrottle(UserRateThrottle):
    """Cada chamada gasta credito de um provedor externo: limite por usuario."""

    scope = "ai"


@extend_schema(
    tags=[AI_TAG],
    summary="Diz se o preenchimento por IA está disponível",
    description=(
        "Portão de fallback da SPEC 7.2: sem `ANTHROPIC_API_KEY` responde "
        "`enabled: false` e o frontend não renderiza o botão *Preencher com IA*. "
        "O sistema é 100% funcional nesse estado."
    ),
    responses={200: AiStatusSerializer},
)
@api_view(["GET"])
def ai_status(_request: Request) -> Response:
    return Response(AiStatusSerializer({"enabled": ai_enabled()}).data)


@extend_schema(
    tags=[AI_TAG],
    summary="Extrai nome, documento e telefone de texto livre",
    description=(
        "Recebe o texto que o atendente colou (linha lida do documento, recado de "
        "reserva por telefone) e devolve os três campos do cadastro. **Nada é "
        "persistido**: o resultado apenas preenche o formulário, e o atendente "
        "revisa e submete (human-in-the-loop, SPEC 7.1).\n\n"
        "Privacidade: com a chave configurada, o texto é enviado a um provedor "
        "externo (Anthropic). O payload não é registrado em log (SPEC 2.2)."
    ),
    request=ParseGuestRequestSerializer,
    responses={
        200: ParsedGuestSerializer,
        400: ErrorEnvelopeSerializer,
        502: AI_UPSTREAM_RESPONSE,
        503: AI_DISABLED_RESPONSE,
    },
    examples=[
        OpenApiExample(
            "Texto colado no balcão",
            value={"text": "hóspede Ana Souza cpf 123.456.789-01 cel (21) 98888-7777"},
            request_only=True,
        ),
        OpenApiExample(
            "Extração devolvida ao formulário",
            value={
                "full_name": "Ana Souza",
                "document": "123.456.789-01",
                "phone": "(21) 98888-7777",
            },
            response_only=True,
        ),
    ],
)
@api_view(["POST"])
@throttle_classes([AiRateThrottle])
def parse_guest(request: Request) -> Response:
    if not ai_enabled():
        raise AiDisabledError

    payload = ParseGuestRequestSerializer(data=request.data)
    payload.is_valid(raise_exception=True)

    extracted = ParsedGuestSerializer(data=extract_guest_fields(payload.validated_data["text"]))
    if not extracted.is_valid():
        # Saida de LLM que nao respeita o contrato e falha de upstream, nao
        # erro do atendente -- e o `extra` fica vazio de proposito: os erros
        # por campo do serializer citariam o valor devolvido pelo modelo.
        raise AiUpstreamError

    return Response(extracted.validated_data)
