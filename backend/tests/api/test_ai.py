"""
Feature opcional de IA (SPEC 7).

Doutrina destes testes: **nenhum toca a rede** (SPEC 7.2). O cliente HTTP e
substituido por um duble que registra a chamada, e o caminho sem chave -- o
portao de fallback -- e provado de verdade, porque e ele que mantem o sistema
inteiro funcional quando a chave nao existe.

Cobertura:

| Caso                                        | Prova                                  |
|---------------------------------------------|----------------------------------------|
| sem chave -> `enabled: false`, 503, 0 rede  | portao de fallback (SPEC 7.2)          |
| com chave -> `enabled: true`, 200           | contrato da SPEC 7.1                   |
| requisicao ao provedor                      | `/v1/messages`, header de versao, V9   |
| lixo do modelo / campo faltante / timeout   | `502 AI_UPSTREAM_ERROR`                |
| texto ausente ou vazio                      | `400 VALIDATION_ERROR`                 |
| sem token                                   | `401 NOT_AUTHENTICATED` (SPEC 2.3)     |
| log                                         | sem PII (SPEC 2.2)                     |
| schema                                      | as duas rotas em `/api/docs/` (SPEC 4.4)|
"""

from __future__ import annotations

import json
import logging
from typing import Any

import httpx
import pytest

from ai import client as ai_client
from ai.config import DEFAULT_MODEL, TIMEOUT_SECONDS

pytestmark = pytest.mark.django_db

STATUS_URL = "/api/ai/status/"
PARSE_URL = "/api/ai/parse-guest/"

FREE_TEXT = "hóspede Ana Souza cpf 123.456.789-01 cel (21) 98888-7777"
EXPECTED_FIELDS = {
    "full_name": "Ana Souza",
    "document": "123.456.789-01",
    "phone": "(21) 98888-7777",
}

FAKE_KEY = "sk-ant-chave-de-teste"


class FakeResponse:
    """Minimo de `httpx.Response` que `ai/client.py` consome."""

    def __init__(self, status_code: int, body: Any, *, valid_json: bool = True) -> None:
        self.status_code = status_code
        self._body = body
        self._valid_json = valid_json

    def json(self) -> Any:
        if not self._valid_json:
            raise ValueError("corpo nao e JSON")
        return self._body


def anthropic_body(text: str) -> dict[str, Any]:
    """Forma real da resposta da Messages API: `content[]` com blocos."""
    return {
        "id": "msg_teste",
        "type": "message",
        "role": "assistant",
        "content": [{"type": "text", "text": text}],
        "stop_reason": "end_turn",
    }


class CallLog(list):
    """Lista de chamadas registradas, com a fila de respostas a devolver."""

    def __init__(self) -> None:
        super().__init__()
        self.queue: list[Any] = []


@pytest.fixture
def calls(monkeypatch) -> CallLog:
    """Duble do transporte: registra a chamada e devolve o que o caso pedir.

    Sem `raising=False`: se `ai/client.py` deixar de usar `httpx.post`, este
    fixture falha alto em vez de silenciosamente liberar a rede no teste.
    """
    log = CallLog()

    def fake_post(url: str, **kwargs: Any) -> FakeResponse:
        log.append({"url": url, **kwargs})
        outcome = log.queue.pop(0) if log.queue else FakeResponse(200, anthropic_body("{}"))
        if isinstance(outcome, Exception):
            raise outcome
        return outcome

    monkeypatch.setattr(ai_client.httpx, "post", fake_post)
    return log


@pytest.fixture
def ai_on(settings):
    settings.ANTHROPIC_API_KEY = FAKE_KEY
    return settings


@pytest.fixture
def ai_off(settings):
    settings.ANTHROPIC_API_KEY = ""
    return settings


# -- Portao de fallback: o caminho sem chave (SPEC 7.2) ------------------------


def test_status_reports_disabled_without_key(auth_client, ai_off):
    """DoD da SPEC 8.2/F: sem chave, `enabled: false` -- e nada quebra."""
    response = auth_client.get(STATUS_URL)

    assert response.status_code == 200
    assert response.data == {"enabled": False}


def test_parse_guest_returns_503_without_key(auth_client, ai_off, calls):
    response = auth_client.post(PARSE_URL, {"text": FREE_TEXT}, format="json")

    assert response.status_code == 503
    assert response.data == {
        "code": "AI_DISABLED",
        "detail": "Preenchimento por IA indisponível: nenhuma chave configurada.",
        "extra": {},
    }
    # Desligada quer dizer desligada: nem uma chamada sai.
    assert calls == []


# -- Caminho feliz com chave (cliente HTTP dublado) --------------------------


def test_status_reports_enabled_with_key(auth_client, ai_on):
    response = auth_client.get(STATUS_URL)

    assert response.status_code == 200
    assert response.data == {"enabled": True}


def test_parse_guest_fills_the_three_fields(auth_client, ai_on, calls):
    calls.queue.append(FakeResponse(200, anthropic_body(json.dumps(EXPECTED_FIELDS))))

    response = auth_client.post(PARSE_URL, {"text": FREE_TEXT}, format="json")

    assert response.status_code == 200
    assert response.data == EXPECTED_FIELDS


def test_parse_guest_calls_the_messages_api_as_contracted(auth_client, ai_on, calls):
    """SPEC 7.2 / V9: `/v1/messages`, `anthropic-version`, modelo e timeout."""
    calls.queue.append(FakeResponse(200, anthropic_body(json.dumps(EXPECTED_FIELDS))))

    auth_client.post(PARSE_URL, {"text": FREE_TEXT}, format="json")

    assert len(calls) == 1
    call = calls[0]
    assert call["url"] == "https://api.anthropic.com/v1/messages"
    assert call["timeout"] == TIMEOUT_SECONDS
    assert call["headers"]["x-api-key"] == FAKE_KEY
    assert call["headers"]["anthropic-version"] == "2023-06-01"
    assert call["json"]["model"] == DEFAULT_MODEL
    assert call["json"]["messages"] == [{"role": "user", "content": FREE_TEXT}]


def test_parse_guest_honours_the_model_env_override(auth_client, ai_on, calls, monkeypatch):
    monkeypatch.setenv("ANTHROPIC_MODEL", "claude-haiku-4-5-outro")
    calls.queue.append(FakeResponse(200, anthropic_body(json.dumps(EXPECTED_FIELDS))))

    auth_client.post(PARSE_URL, {"text": FREE_TEXT}, format="json")

    assert calls[0]["json"]["model"] == "claude-haiku-4-5-outro"


def test_parse_guest_accepts_blank_field_the_text_does_not_carry(auth_client, ai_on, calls):
    """Chave presente com valor vazio e "nao achei", nao falha (SPEC 7.1)."""
    partial = {"full_name": "Ana Souza", "document": "123.456.789-01", "phone": ""}
    calls.queue.append(FakeResponse(200, anthropic_body(json.dumps(partial))))

    response = auth_client.post(PARSE_URL, {"text": "Ana Souza, cpf 123.456.789-01"}, format="json")

    assert response.status_code == 200
    assert response.data == partial


def test_parse_guest_tolerates_a_fenced_json_block(auth_client, ai_on, calls):
    fenced = f"```json\n{json.dumps(EXPECTED_FIELDS)}\n```"
    calls.queue.append(FakeResponse(200, anthropic_body(fenced)))

    response = auth_client.post(PARSE_URL, {"text": FREE_TEXT}, format="json")

    assert response.status_code == 200
    assert response.data == EXPECTED_FIELDS


# -- Saida de LLM e input nao confiavel: tudo o que der errado da 502 ---------


UPSTREAM_ENVELOPE = {
    "code": "AI_UPSTREAM_ERROR",
    "detail": "O provedor de IA não devolveu uma extração utilizável. Preencha à mão.",
    "extra": {},
}


@pytest.mark.parametrize(
    ("label", "outcome"),
    [
        ("texto que nao e json", FakeResponse(200, anthropic_body("desculpe, não sei"))),
        ("json que nao e objeto", FakeResponse(200, anthropic_body('["Ana Souza"]'))),
        (
            "campo faltante",
            FakeResponse(200, anthropic_body(json.dumps({"full_name": "Ana Souza"}))),
        ),
        (
            "tipo errado no campo",
            FakeResponse(
                200,
                anthropic_body(json.dumps({**EXPECTED_FIELDS, "document": {"cpf": "123"}})),
            ),
        ),
        ("resposta sem bloco de texto", FakeResponse(200, {"content": []})),
        ("corpo que nao e json", FakeResponse(200, None, valid_json=False)),
        ("erro de autenticacao no provedor", FakeResponse(401, {"error": "invalid x-api-key"})),
        ("indisponibilidade do provedor", FakeResponse(529, {"error": "overloaded"})),
        ("timeout", httpx.ReadTimeout("tempo esgotado")),
        ("rede fora", httpx.ConnectError("dns")),
    ],
)
def test_parse_guest_returns_502_on_upstream_trouble(
    auth_client, ai_on, calls, label: str, outcome: Any
):
    calls.queue.append(outcome)

    response = auth_client.post(PARSE_URL, {"text": FREE_TEXT}, format="json")

    assert response.status_code == 502, label
    assert response.data == UPSTREAM_ENVELOPE, label


# -- Borda HTTP: validacao, autenticacao, privacidade -------------------------


@pytest.mark.parametrize("payload", [{}, {"text": ""}, {"text": "   "}])
def test_parse_guest_requires_text(auth_client, ai_on, calls, payload: dict[str, Any]):
    response = auth_client.post(PARSE_URL, payload, format="json")

    assert response.status_code == 400
    assert response.data["code"] == "VALIDATION_ERROR"
    assert "text" in response.data["extra"]
    assert calls == []


def test_parse_guest_rejects_text_beyond_the_ceiling(auth_client, ai_on, calls):
    response = auth_client.post(PARSE_URL, {"text": "a" * 2001}, format="json")

    assert response.status_code == 400
    assert response.data["code"] == "VALIDATION_ERROR"
    assert calls == []


@pytest.mark.parametrize(("method", "url"), [("get", STATUS_URL), ("post", PARSE_URL)])
def test_ai_endpoints_require_authentication(api_client, ai_on, method: str, url: str):
    response = getattr(api_client, method)(url)

    assert response.status_code == 401
    assert response.data["code"] == "NOT_AUTHENTICATED"


def test_parse_guest_never_logs_the_free_text(auth_client, ai_on, calls, caplog):
    """SPEC 2.2: nem o texto enviado nem a extracao entram em log."""
    calls.queue.append(FakeResponse(200, anthropic_body(json.dumps(EXPECTED_FIELDS))))

    with caplog.at_level(logging.DEBUG):
        auth_client.post(PARSE_URL, {"text": FREE_TEXT}, format="json")

    logged = caplog.text
    assert "Ana Souza" not in logged
    assert "123.456.789-01" not in logged
    assert "98888-7777" not in logged
    assert FAKE_KEY not in logged


def test_parse_guest_failure_never_logs_the_free_text(auth_client, ai_on, calls, caplog):
    calls.queue.append(httpx.ReadTimeout("tempo esgotado"))

    with caplog.at_level(logging.DEBUG):
        response = auth_client.post(PARSE_URL, {"text": FREE_TEXT}, format="json")

    assert response.status_code == 502
    assert "Ana Souza" not in caplog.text
    assert "123.456.789-01" not in caplog.text


# -- Contrato navegavel (SPEC 4.4) -------------------------------------------


def test_schema_documents_both_ai_routes(api_client):
    schema = api_client.get("/api/schema/", {"format": "json"}).data

    assert "/api/ai/status/" in schema["paths"]
    parse = schema["paths"]["/api/ai/parse-guest/"]["post"]
    assert parse["summary"]
    for code in ("200", "400", "502", "503"):
        assert code in parse["responses"], code
