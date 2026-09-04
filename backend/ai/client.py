from __future__ import annotations

import json
from typing import Any

import httpx

from ai.config import TIMEOUT_SECONDS, api_key, model
from ai.exceptions import AiUpstreamError

MESSAGES_URL = "https://api.anthropic.com/v1/messages"
ANTHROPIC_VERSION = "2023-06-01"
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


def extract_guest_fields(text: str) -> dict[str, Any]:
    payload = {
        "model": model(),
        "max_tokens": MAX_TOKENS,
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
        raise AiUpstreamError from exc

    if response.status_code != 200:
        raise AiUpstreamError

    return _parse_object(_text_of(response))


def _text_of(response: httpx.Response) -> str:
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
