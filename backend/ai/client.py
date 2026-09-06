from __future__ import annotations

import json
import time
from collections.abc import Callable
from typing import Any

import httpx

from ai.config import BUDGET_SECONDS, MAX_TOOL_ROUNDS, TIMEOUT_SECONDS, api_keys, model
from ai.exceptions import AiUpstreamError

INTERACTIONS_URL = "https://generativelanguage.googleapis.com/v1beta/interactions"
MAX_OUTPUT_TOKENS = 2048  # os tokens de raciocinio contam aqui
THINKING_LEVEL = "low"
# A referencia mostra a string; os exemplos, um objeto. Comeca pela string.
TOOL_CHOICE = "any"
# Status em que a resposta ainda carrega steps utilizaveis.
USABLE_STATUSES = frozenset({"requires_action", "completed"})

# Recebe (nome, argumentos) e devolve o objeto que vai no function_result.
RunTool = Callable[[str, dict[str, Any]], dict[str, Any]]


def converse(
    *,
    system: str,
    message: str,
    tools: list[dict[str, Any]],
    run_tool: RunTool,
    terminal: str,
) -> dict[str, Any]:
    """Roda o laco de tool use e devolve os argumentos da funcao terminal.

    Transporte e nada de dominio: quem sabe o que cada ferramenta faz e o
    `run_tool` do chamador.
    """
    deadline = time.monotonic() + BUDGET_SECONDS
    # Copia por request: o 429 troca a chave aqui, e a paga fica ate o fim desta.
    keys = api_keys()
    steps: list[dict[str, Any]] = [{"type": "user_input", "content": message}]

    for _ in range(MAX_TOOL_ROUNDS + 1):
        body = _post(_payload(system, steps, tools), deadline, keys)
        calls = [step for step in body["steps"] if step.get("type") == "function_call"]
        final = next((call for call in calls if call.get("name") == terminal), None)
        if final is not None:
            return final.get("arguments") or {}
        if not calls:
            # Prosa solta, ou status sem chamada nenhuma: nao ha resposta a montar.
            raise AiUpstreamError
        # Verbatim, inclusive os steps `thought`: eles voltam assinados, e
        # reenvia-los mexidos e 400.
        steps.extend(body["steps"])
        steps.extend(_function_result(call, run_tool) for call in calls)

    raise AiUpstreamError


def _payload(
    system: str, steps: list[dict[str, Any]], tools: list[dict[str, Any]]
) -> dict[str, Any]:
    # store: False -- o historico e reenviado a cada rodada e nada fica no Google.
    return {
        "model": model(),
        "store": False,
        "system_instruction": system,
        "tools": tools,
        "generation_config": {
            "max_output_tokens": MAX_OUTPUT_TOKENS,
            "thinking_level": THINKING_LEVEL,
            "tool_choice": TOOL_CHOICE,
        },
        "input": steps,
    }


def _post(payload: dict[str, Any], deadline: float, keys: list[str]) -> dict[str, Any]:
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        raise AiUpstreamError

    try:
        response = httpx.post(
            INTERACTIONS_URL,
            headers={"content-type": "application/json", "x-goog-api-key": keys[0]},
            json=payload,
            timeout=min(remaining, TIMEOUT_SECONDS),
        )
    except httpx.HTTPError as exc:
        raise AiUpstreamError from exc

    if response.status_code == 429 and len(keys) > 1:
        # Cota da gratuita esgotada. `keys` e a lista de `converse`: descartar a
        # primeira aqui mantem a paga pelo resto do request.
        keys.pop(0)
        return _post(payload, deadline, keys)
    if response.status_code != 200:
        raise AiUpstreamError

    return _interaction(response)


def _interaction(response: httpx.Response) -> dict[str, Any]:
    try:
        body = response.json()
    except ValueError as exc:
        raise AiUpstreamError from exc

    if not isinstance(body, dict) or not isinstance(body.get("steps"), list):
        raise AiUpstreamError
    if body.get("status") not in USABLE_STATUSES:
        raise AiUpstreamError
    return body


def _function_result(call: dict[str, Any], run_tool: RunTool) -> dict[str, Any]:
    call_id = call.get("id")
    name = call.get("name")
    if not isinstance(call_id, str) or not isinstance(name, str):
        raise AiUpstreamError

    return {
        "type": "function_result",
        "call_id": call_id,
        "name": name,
        "result": [
            {
                "type": "text",
                "text": json.dumps(run_tool(name, call.get("arguments") or {}), ensure_ascii=False),
            }
        ],
    }
