"""
Cliente da Messages API da Anthropic (SPEC 7.2).

HTTP cru com `httpx` por decisao de escopo da SPEC: uma unica chamada POST nao
justifica um SDK a mais no lock. Endpoint `/v1/messages`, header
`anthropic-version` (V9).

Contrato deste modulo: `extract_guest_fields(text)` devolve o dicionario cru
que o modelo produziu -- **nao** valida nada. A validacao e da camada de
serializer (`ai/serializers.py`), porque saida de LLM e input nao confiavel
(SPEC 7.2). Qualquer falha de transporte, de status, de JSON ou de forma sai
como `AiUpstreamError` (502).

Privacidade (SPEC 2.2, 7.2): este modulo nao loga o texto enviado nem a
resposta recebida, e nenhuma excecao daqui carrega trecho de payload.
"""

from __future__ import annotations

import json
from typing import Any

import httpx

from ai.config import TIMEOUT_SECONDS, api_key, model
from ai.exceptions import AiUpstreamError

MESSAGES_URL = "https://api.anthropic.com/v1/messages"
ANTHROPIC_VERSION = "2023-06-01"

# Extracao de tres campos curtos: teto baixo o suficiente para o custo ser
# irrelevante e alto o suficiente para nunca truncar o JSON.
MAX_TOKENS = 512

SYSTEM_PROMPT = (
    "Você extrai dados de cadastro de hóspede a partir de texto livre digitado por um "
    "atendente de hotel.\n"
    "Responda EXCLUSIVAMENTE com um objeto JSON, sem cercas de código e sem comentários, "
    'exatamente com estas três chaves: {"full_name": "", "document": "", "phone": ""}.\n'
    "Regras:\n"
    "- preserve a formatação original de documento e telefone (pontos, parênteses, hífens);\n"
    "- devolva o telefone EXATAMENTE como aparece no texto: não acrescente código de "
    "país, não complete DDD, não reformate;\n"
    "- não invente dados: se o texto não trouxer um dos campos, devolva string vazia nele;\n"
    "- não devolva nenhuma outra chave, nem texto fora do JSON."
)
# Por que o prompt e explicito em NAO inferir DDI: o formulario exige telefone
# com codigo de pais, e seria tentador pedir ao modelo que o complete. Inferir
# pais a partir de um numero solto e regra de negocio -- e o modelo acertaria o
# Brasil na maioria dos casos e erraria calado no hospede estrangeiro, gravando
# um numero que nao existe. O atendente ve o numero como foi dito e completa o
# DDI; a validacao fica com `services.guests.create_guest`.


def extract_guest_fields(text: str) -> dict[str, Any]:
    """Chama o modelo e devolve o objeto JSON que ele produziu.

    Levanta `AiUpstreamError` em qualquer desvio: timeout, erro de rede, status
    != 200, corpo sem bloco de texto, texto que nao e JSON de objeto.
    """
    payload = {
        "model": model(),
        "max_tokens": MAX_TOKENS,
        # Extracao e tarefa deterministica: temperatura 0 evita variacao de
        # formatacao entre duas colagens do mesmo texto.
        "temperature": 0,
        "system": SYSTEM_PROMPT,
        "messages": [{"role": "user", "content": text}],
    }
    headers = {
        "content-type": "application/json",
        "x-api-key": api_key(),
        "anthropic-version": ANTHROPIC_VERSION,
    }

    try:
        response = httpx.post(
            MESSAGES_URL,
            headers=headers,
            json=payload,
            timeout=TIMEOUT_SECONDS,
        )
    except httpx.HTTPError as exc:
        # `httpx.HTTPError` cobre timeout, DNS, TLS e conexao recusada.
        raise AiUpstreamError from exc

    if response.status_code != 200:
        # Nao se ecoa o corpo do provedor: ele pode devolver o prompt de volta.
        raise AiUpstreamError

    return _parse_object(_text_of(response))


def _text_of(response: httpx.Response) -> str:
    """Concatena os blocos de texto da resposta (`content[].text`)."""
    try:
        body = response.json()
    except ValueError as exc:
        raise AiUpstreamError from exc

    blocks = body.get("content") if isinstance(body, dict) else None
    if not isinstance(blocks, list):
        raise AiUpstreamError

    parts = [
        block["text"]
        for block in blocks
        if isinstance(block, dict)
        and block.get("type") == "text"
        and isinstance(block.get("text"), str)
    ]
    if not parts:
        raise AiUpstreamError
    return "".join(parts)


def _parse_object(raw: str) -> dict[str, Any]:
    """JSON estrito, tolerando apenas a cerca de codigo que o modelo possa acrescentar."""
    candidate = raw.strip()
    if candidate.startswith("```"):
        candidate = (
            candidate.removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        )

    try:
        parsed = json.loads(candidate)
    except ValueError as exc:
        raise AiUpstreamError from exc

    if not isinstance(parsed, dict):
        raise AiUpstreamError
    return parsed
