from __future__ import annotations

from django.utils import timezone
from drf_spectacular.utils import OpenApiExample, OpenApiResponse, extend_schema
from rest_framework.decorators import api_view, throttle_classes
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.throttling import UserRateThrottle

from ai.config import ai_enabled
from ai.copilot import answer
from ai.exceptions import AiDisabledError
from ai.serializers import AiStatusSerializer, CopilotReplySerializer, CopilotRequestSerializer
from core.serializers import ErrorEnvelopeSerializer

AI_TAG = "ai"

AI_DISABLED_RESPONSE = OpenApiResponse(
    response=ErrorEnvelopeSerializer,
    description="Nenhuma `OPENAI_API_KEY` configurada — a feature está desligada.",
    examples=[
        OpenApiExample(
            "AI_DISABLED",
            value={
                "code": "AI_DISABLED",
                "detail": "Íris indisponível: nenhuma chave configurada.",
                "extra": {},
            },
            response_only=True,
        )
    ],
)

AI_UPSTREAM_RESPONSE = OpenApiResponse(
    response=ErrorEnvelopeSerializer,
    description=(
        "Timeout, orçamento do loop esgotado, status != 200, resposta fora do "
        "formato ou modelo que nunca chamou `answer`."
    ),
    examples=[
        OpenApiExample(
            "AI_UPSTREAM_ERROR",
            value={
                "code": "AI_UPSTREAM_ERROR",
                "detail": "O provedor de IA não devolveu uma resposta utilizável.",
                "extra": {},
            },
            response_only=True,
        )
    ],
)


class AiRateThrottle(UserRateThrottle):
    scope = "ai"


@extend_schema(
    tags=[AI_TAG],
    summary="Diz se a Íris está disponível",
    description=(
        "Portão de fallback: sem chave do provedor responde `enabled: false` e "
        "o frontend mostra a Íris desligada na página dela. O resto do sistema "
        "é 100% funcional nesse estado."
    ),
    responses={200: AiStatusSerializer},
)
@api_view(["GET"])
def ai_status(_request: Request) -> Response:
    return Response(AiStatusSerializer({"enabled": ai_enabled()}).data)


@extend_schema(
    tags=[AI_TAG],
    summary="Pergunta em linguagem natural sobre o hotel",
    description=(
        "A Íris responde ao atendente consultando o próprio banco: reservas e "
        "estadias (inclusive por nome de acompanhante), prévia de checkout, "
        "quartos livres e faturamento. O modelo **pede** as consultas e o "
        "servidor as executa; nada é gravado por este endpoint.\n\n"
        "Quando a pergunta tem uma ação clara, a resposta traz `proposed_action` "
        "— o frontend a renderiza como um botão que chama os endpoints de "
        "check-in ou de checkout de sempre (human-in-the-loop). A ação só vem "
        "quando a reserva foi identificada de forma única e o status confere; "
        "caso contrário é `null`, e o texto ainda é útil.\n\n"
        "Privacidade: com a chave configurada saem para a OpenAI os nomes "
        "(titular e acompanhantes), quartos, datas, o extrato projetado e os "
        "agregados de faturamento. **Documento e telefone nunca saem.** O "
        "conteúdo não é registrado em log, e o request pede `store: false` — "
        "a conversa não fica retida do lado do provedor."
    ),
    request=CopilotRequestSerializer,
    responses={
        200: CopilotReplySerializer,
        400: ErrorEnvelopeSerializer,
        502: AI_UPSTREAM_RESPONSE,
        503: AI_DISABLED_RESPONSE,
    },
    examples=[
        OpenApiExample(
            "Chegada narrada no balcão",
            value={"message": "A Ana Souza chegou, tem reserva hoje."},
            request_only=True,
        ),
        OpenApiExample(
            "Resposta com ação proposta",
            value={
                "reply": (
                    "A Ana Souza tem a reserva 4 no quarto 101, de hoje a "
                    "amanhã, com vaga. O check-in abre às 14:00."
                ),
                "proposed_action": {
                    "type": "check_in",
                    "reservation_id": 4,
                    "guest_name": "Ana Souza",
                },
            },
            response_only=True,
        ),
        OpenApiExample(
            "Resposta sem ação",
            value={
                "reply": "No hotel agora: Bruno Lima no 102, desde ontem às 15:00.",
                "proposed_action": None,
            },
            response_only=True,
        ),
    ],
)
@api_view(["POST"])
@throttle_classes([AiRateThrottle])
def copilot(request: Request) -> Response:
    if not ai_enabled():
        raise AiDisabledError

    payload = CopilotRequestSerializer(data=request.data)
    payload.is_valid(raise_exception=True)

    result = answer(payload.validated_data["message"], now=timezone.now())
    return Response(CopilotReplySerializer(result).data)
