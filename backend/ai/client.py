from __future__ import annotations

import json
import time
from collections.abc import Callable
from typing import Any

import httpx

from ai.config import BUDGET_SECONDS, MAX_ROUNDS, TIMEOUT_SECONDS, api_key, model
from ai.exceptions import AiUpstreamError

RESPONSES_URL = "https://api.openai.com/v1/responses"
MAX_OUTPUT_TOKENS = 2048

RunTool = Callable[[str, dict[str, Any]], dict[str, Any]]


def converse(
    *,
    system: str,
    message: str,
    tools: list[dict[str, Any]],
    run_tool: RunTool,
    terminal: str,
) -> dict[str, Any]:
    """Roda o laço de tool use e devolve os argumentos da função terminal."""
    deadline = time.monotonic() + BUDGET_SECONDS
    key = api_key()
    items: list[dict[str, Any]] = [{"role": "user", "content": message}]

    for round_number in range(MAX_ROUNDS):
        # Na última rodada a escolha deixa de ser livre: sem isso um modelo que
        # ficou repetindo consultas gasta o teto e o atendente leva um 502.
        last_round = round_number == MAX_ROUNDS - 1
        payload = _payload(system, items, tools, terminal if last_round else None)
        output = _post(payload, deadline, key)
        calls = _function_calls(output)

        final = _call_named(calls, terminal)
        if final is not None:
            return _arguments(final)

        # O `function_call` tem de chegar antes do seu `function_call_output`:
        # inverter as duas linhas quebra o pareamento do lado da API.
        items.extend(output)
        items.extend(_tool_output(call, run_tool) for call in calls)

    raise AiUpstreamError


def _payload(
    system: str,
    items: list[dict[str, Any]],
    tools: list[dict[str, Any]],
    forced: str | None,
) -> dict[str, Any]:
    return {
        "model": model(),
        "store": False,
        "instructions": system,
        "tools": tools,
        "tool_choice": {"type": "function", "name": forced} if forced else "required",
        "max_output_tokens": MAX_OUTPUT_TOKENS,
        "input": items,
    }


def _post(payload: dict[str, Any], deadline: float, key: str) -> list[Any]:
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        raise AiUpstreamError

    try:
        response = httpx.post(
            RESPONSES_URL,
            headers={"content-type": "application/json", "authorization": f"Bearer {key}"},
            json=payload,
            timeout=min(remaining, TIMEOUT_SECONDS),
        )
        response.raise_for_status()
        output = response.json()["output"]
    except (httpx.HTTPError, KeyError, TypeError, ValueError) as exc:
        raise AiUpstreamError from exc

    if not isinstance(output, list):
        raise AiUpstreamError
    return output


def _function_calls(output: list[Any]) -> list[dict[str, Any]]:
    calls = [item for item in output if item.get("type") == "function_call"]
    if not calls:
        # `tool_choice` "required" proíbe prosa: texto solto aqui é o provedor
        # furando o contrato, e garimpar JSON de dentro dele erra mais que falhar.
        raise AiUpstreamError
    return calls


def _call_named(calls: list[dict[str, Any]], name: str) -> dict[str, Any] | None:
    return next((call for call in calls if call.get("name") == name), None)


def _arguments(call: dict[str, Any]) -> dict[str, Any]:
    try:
        arguments = json.loads(call["arguments"])
    except (KeyError, TypeError, ValueError) as exc:
        raise AiUpstreamError from exc

    if not isinstance(arguments, dict):
        raise AiUpstreamError
    return arguments


def _tool_output(call: dict[str, Any], run_tool: RunTool) -> dict[str, Any]:
    call_id = call.get("call_id")
    if not isinstance(call_id, str):
        raise AiUpstreamError

    result = run_tool(str(call.get("name")), _arguments(call))
    return {
        "type": "function_call_output",
        "call_id": call_id,
        "output": json.dumps(result, ensure_ascii=False),
    }
