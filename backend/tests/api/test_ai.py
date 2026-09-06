from __future__ import annotations

import json
import logging
from datetime import date, time
from typing import Any

import httpx
import pytest
from freezegun import freeze_time

from ai import client as ai_client
from ai.config import DEFAULT_MODEL, TIMEOUT_SECONDS
from hotel.reservations import services as service
from hotel.reservations.models import Reservation, ReservationStatus
from tests.api.conftest import local
from tests.factories import (
    GuestFactory,
    PricingPolicyFactory,
    ReservationFactory,
    RoomFactory,
)

pytestmark = pytest.mark.django_db

STATUS_URL = "/api/ai/status/"
COPILOT_URL = "/api/ai/copilot/"

FAKE_KEY = "chave-gratuita-de-teste"
PAID_KEY = "chave-paga-de-teste"

QUESTION = "A Ana Souza chegou, tem reserva hoje."

# Calendario de referencia da tabela-verdade: marco/2025.
MARCH_7 = date(2025, 3, 7)  # sexta
MARCH_9 = date(2025, 3, 9)  # domingo

UPSTREAM_ENVELOPE = {
    "code": "AI_UPSTREAM_ERROR",
    "detail": "O provedor de IA não devolveu uma resposta utilizável.",
    "extra": {},
}


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


class CallLog(list):
    """Chamadas registradas, a fila de respostas e um relogio de mentira."""

    def __init__(self) -> None:
        super().__init__()
        self.queue: list[Any] = []
        self.now = 0.0  # o que `time.monotonic` devolve quando o caso o patcheia
        self.tick = 0.0  # quanto cada chamada consome do orcamento


@pytest.fixture
def calls(monkeypatch) -> CallLog:
    """Duble do transporte: registra a chamada e devolve o que o caso pediu.

    A fila e estrita -- chamada sem resposta enfileirada e erro de teste, nao
    uma rodada extra silenciosa. Sem `raising=False`: se `ai/client.py` deixar
    de usar `httpx.post`, o fixture falha alto em vez de liberar a rede.
    """
    log = CallLog()

    def fake_post(url: str, **kwargs: Any) -> FakeResponse:
        # Snapshot do body: `input` e a mesma lista, mutada a cada rodada, e sem
        # a copia toda chamada mostraria o historico final. O json.dumps tambem
        # reproduz o encoder do httpx -- um Decimal que vazasse quebra aqui,
        # como quebraria em producao.
        log.append({"url": url, **kwargs, "json": json.loads(json.dumps(kwargs["json"]))})
        assert log.queue, "chamada upstream inesperada"
        log.now += log.tick
        outcome = log.queue.pop(0)
        if isinstance(outcome, Exception):
            raise outcome
        return outcome

    monkeypatch.setattr(ai_client.httpx, "post", fake_post)
    return log


@pytest.fixture
def ai_on(settings):
    settings.GEMINI_API_KEY = FAKE_KEY
    # A chave paga real do dev nunca entra num teste.
    settings.GEMINI_API_KEY_PAID = ""
    return settings


@pytest.fixture
def ai_on_with_paid(ai_on):
    ai_on.GEMINI_API_KEY_PAID = PAID_KEY
    return ai_on


@pytest.fixture
def ai_off(settings):
    settings.GEMINI_API_KEY = ""
    settings.GEMINI_API_KEY_PAID = ""
    return settings


# --- builders da Interactions API --------------------------------------------


def interaction_body(*steps: dict, status: str = "requires_action") -> dict[str, Any]:
    """Resposta da API: o status e apenas os steps gerados nesta rodada."""
    return {"id": "interaction-de-teste", "status": status, "steps": list(steps), "usage": {}}


def function_call(name: str, arguments: dict, call_id: str = "call_1") -> dict[str, Any]:
    return {"type": "function_call", "id": call_id, "name": name, "arguments": arguments}


def answer_call(
    reply: str,
    action_type: str = "none",
    reservation_id: int = 0,
    call_id: str = "call_answer",
) -> dict[str, Any]:
    return function_call(
        "answer",
        {"reply": reply, "action_type": action_type, "reservation_id": reservation_id},
        call_id=call_id,
    )


def thought_step() -> dict[str, Any]:
    """Step de raciocinio: volta assinado e o cliente o reenvia intacto."""
    return {"type": "thought", "content": "vou procurar a reserva", "signature": "opaca-abc123"}


def model_output(text: str) -> dict[str, Any]:
    return {"type": "model_output", "content": [{"type": "text", "text": text}]}


def requires(*steps: dict) -> FakeResponse:
    return FakeResponse(200, interaction_body(*steps))


def answered(*steps: dict) -> FakeResponse:
    return FakeResponse(200, interaction_body(*steps, status="completed"))


def find_call(status: str, query: str = "", call_id: str = "call_find") -> dict[str, Any]:
    return function_call(
        "find_reservations", {"status": status, "query": query}, call_id=call_id
    )


def function_results(call: dict) -> list[dict]:
    """Os steps `function_result` que esta chamada mandou de volta ao modelo."""
    return [step for step in call["json"]["input"] if step.get("type") == "function_result"]


def result_payload(call: dict, index: int = 0) -> Any:
    return json.loads(function_results(call)[index]["result"][0]["text"])


def result_of(call: dict, call_id: str) -> Any:
    """O resultado de uma chamada especifica.

    Da 3a rodada em diante o `input` carrega os function_result de todas as
    anteriores: indexar por posicao pegaria o resultado da rodada errada.
    """
    for step in function_results(call):
        if step["call_id"] == call_id:
            return json.loads(step["result"][0]["text"])
    raise AssertionError(f"nenhum function_result para {call_id}")


def ask(client, message: str = QUESTION):
    return client.post(COPILOT_URL, {"message": message}, format="json")


# --- dados -------------------------------------------------------------------


@pytest.fixture
def ana(db) -> Reservation:
    """A pendente da demo: reserva de hoje no 101, com vaga."""
    return ReservationFactory(guest__full_name="Ana Souza", room__number="101", has_vehicle=True)


@pytest.fixture
def bruno(db) -> Reservation:
    """Estadia em curso no 102, com uma acompanhante — Bruno não tem carro."""
    reservation = ReservationFactory(
        guest__full_name="Bruno Lima", room__number="102", checked_in=True
    )
    reservation.companions.set([GuestFactory(full_name="Eva Lima")])
    return reservation


@pytest.fixture
def t7(db, attendant) -> Reservation:
    """Estadia T7 em curso: sex 07/03 15:00, com vaga.

    O check-in roda fora de `freeze_time` de propósito: dentro dele a
    `PricingPolicyFactory` fixaria uma política nova no instante congelado.
    """
    reservation = ReservationFactory(
        guest__full_name="Carla Nunes",
        room__number="103",
        checkin_date=MARCH_7,
        checkout_date=MARCH_9,
        has_vehicle=True,
    )
    service.check_in(reservation, now=local(MARCH_7, 15), actor=attendant)
    return reservation


# --- portao e validacao ------------------------------------------------------


def test_status_reports_disabled_without_key(auth_client, ai_off):
    response = auth_client.get(STATUS_URL)

    assert response.status_code == 200
    assert response.data == {"enabled": False}


def test_status_reports_enabled_with_key(auth_client, ai_on):
    response = auth_client.get(STATUS_URL)

    assert response.status_code == 200
    assert response.data == {"enabled": True}


def test_status_reports_enabled_with_only_the_paid_key(auth_client, settings):
    """Deploy so com a chave paga tambem liga a Iris."""
    settings.GEMINI_API_KEY = ""
    settings.GEMINI_API_KEY_PAID = PAID_KEY

    assert auth_client.get(STATUS_URL).data == {"enabled": True}


def test_copilot_returns_503_without_key(auth_client, ai_off, calls):
    response = ask(auth_client)

    assert response.status_code == 503
    assert response.data == {
        "code": "AI_DISABLED",
        "detail": "Íris indisponível: nenhuma chave configurada.",
        "extra": {},
    }
    assert calls == []


@pytest.mark.parametrize("payload", [{}, {"message": ""}, {"message": "   "}])
def test_copilot_requires_a_message(auth_client, ai_on, calls, payload: dict[str, Any]):
    response = auth_client.post(COPILOT_URL, payload, format="json")

    assert response.status_code == 400
    assert response.data["code"] == "VALIDATION_ERROR"
    assert "message" in response.data["extra"]
    assert calls == []


def test_copilot_rejects_a_message_beyond_the_ceiling(auth_client, ai_on, calls):
    response = ask(auth_client, "a" * 2001)

    assert response.status_code == 400
    assert response.data["code"] == "VALIDATION_ERROR"
    assert calls == []


@pytest.mark.parametrize(("method", "url"), [("get", STATUS_URL), ("post", COPILOT_URL)])
def test_ai_endpoints_require_authentication(api_client, ai_on, method: str, url: str):
    response = getattr(api_client, method)(url)

    assert response.status_code == 401
    assert response.data["code"] == "NOT_AUTHENTICATED"


# --- contrato do transporte --------------------------------------------------


def test_copilot_calls_the_interactions_api_as_contracted(auth_client, ai_on, calls):
    calls.queue.append(answered(answer_call("Tudo tranquilo por aqui.")))

    with freeze_time(local(MARCH_7, 10, 0)):
        response = ask(auth_client)

    assert response.status_code == 200
    assert len(calls) == 1
    call = calls[0]
    assert call["url"] == "https://generativelanguage.googleapis.com/v1beta/interactions"
    assert call["timeout"] == TIMEOUT_SECONDS
    assert call["headers"]["x-goog-api-key"] == FAKE_KEY
    assert call["headers"]["content-type"] == "application/json"

    body = call["json"]
    assert body["model"] == DEFAULT_MODEL
    assert body["store"] is False
    assert [tool["name"] for tool in body["tools"]] == [
        "find_reservations",
        "preview_checkout",
        "available_rooms",
        "revenue_summary",
        "answer",
    ]
    assert body["generation_config"] == {
        "max_output_tokens": 2048,
        "thinking_level": "low",
        "tool_choice": "any",
    }
    assert body["input"] == [{"type": "user_input", "content": QUESTION}]
    assert "check-in abre às 14:00" in body["system_instruction"]


def test_copilot_honours_the_model_env_override(auth_client, ai_on, calls, monkeypatch):
    monkeypatch.setenv("GEMINI_MODEL", "gemini-3.8-pro")
    calls.queue.append(answered(answer_call("Ok.")))

    ask(auth_client)

    assert calls[0]["json"]["model"] == "gemini-3.8-pro"


def test_copilot_system_instruction_carries_the_policy_clock(auth_client, ai_on, calls):
    """O relogio e a abertura vem da politica vigente, nao de constante do motor."""
    PricingPolicyFactory(checkin_opens=time(15, 0), effective_from=local(MARCH_7, 0))
    calls.queue.append(answered(answer_call("Ok.")))

    with freeze_time(local(MARCH_7, 13, 45)):
        ask(auth_client)

    system = calls[0]["json"]["system_instruction"]
    assert "Agora: 13:45" in system
    assert "sexta-feira" in system
    assert "check-in abre às 15:00 (ainda não abriu)" in system


# --- lacos felizes -----------------------------------------------------------


def test_copilot_proposes_check_in_after_finding_one_pending_reservation(
    auth_client, ai_on, calls, ana
):
    calls.queue.extend(
        [
            requires(thought_step(), find_call(ReservationStatus.PENDING, "Ana Souza")),
            answered(answer_call("A Ana Souza tem reserva hoje no 101.", "check_in", ana.pk)),
        ]
    )

    response = ask(auth_client)

    assert response.status_code == 200
    assert response.data == {
        "reply": "A Ana Souza tem reserva hoje no 101.",
        "proposed_action": {
            "type": "check_in",
            "reservation_id": ana.pk,
            "guest_name": "Ana Souza",
        },
    }

    # A 2a chamada reenvia o historico: pergunta, os steps do modelo verbatim
    # (o `thought` assinado incluido) e o resultado com o `call_id` da chamada.
    second = calls[1]["json"]["input"]
    assert second[0] == {"type": "user_input", "content": QUESTION}
    assert second[1] == thought_step()
    assert second[2] == find_call(ReservationStatus.PENDING, "Ana Souza")
    assert second[3]["type"] == "function_result"
    assert second[3]["call_id"] == "call_find"
    assert second[3]["name"] == "find_reservations"

    payload = result_payload(calls[1])
    assert payload["total"] == 1
    row = payload["reservations"][0]
    assert row["guest_name"] == "Ana Souza"
    assert row["room"] == "101"
    assert row["has_vehicle"] is True
    assert row["companions"] == []
    # O provedor nunca ve documento nem telefone.
    assert "document" not in row
    assert "phone" not in row

    ana.refresh_from_db()
    assert ana.status == ReservationStatus.PENDING


def test_copilot_finds_a_companion_by_name(auth_client, ai_on, calls, bruno):
    """"A Eva chegou" acha a estadia do Bruno em vez de "nao encontrei"."""
    calls.queue.extend(
        [
            requires(find_call(ReservationStatus.CHECKED_IN, "Eva")),
            answered(answer_call("A Eva Lima está no 102, com o Bruno Lima.")),
        ]
    )

    response = ask(auth_client, "a Eva chegou")

    assert response.status_code == 200
    payload = result_payload(calls[1])
    assert payload["total"] == 1
    assert payload["reservations"][0]["reservation_id"] == bruno.pk
    assert payload["reservations"][0]["companions"] == ["Eva Lima"]


def test_copilot_previews_checkout_without_writing(auth_client, ai_on, calls, t7):
    """O extrato projetado do T7 chega ao modelo sem tocar o livro."""
    calls.queue.extend(
        [
            requires(find_call(ReservationStatus.CHECKED_IN, "Carla")),
            requires(function_call("preview_checkout", {"reservation_id": t7.pk}, "call_prev")),
            answered(answer_call("O total da Carla Nunes é R$ 425,00.", "checkout", t7.pk)),
        ]
    )

    with freeze_time(local(MARCH_9, 12, 1)):
        response = ask(auth_client, "A Carla quer sair agora.")

    assert response.status_code == 200
    assert response.data["proposed_action"] == {
        "type": "checkout",
        "reservation_id": t7.pk,
        "guest_name": "Carla Nunes",
    }

    statement = result_of(calls[2], "call_prev")
    assert statement["total"] == "425.00"
    assert statement["late_fee"] == {
        "applied": True,
        "base_rate": "180.00",
        "amount": "90.00",
    }
    assert statement["lines"][0] == {
        "date": "2025-03-07",
        "weekday": "sexta-feira",
        "daily_rate": "120.00",
        "parking_fee": "15.00",
    }
    assert statement["checked_out_at"] is None
    assert statement["payment"] is None
    assert statement["extras"] == []

    t7.refresh_from_db()
    assert t7.status == ReservationStatus.CHECKED_IN
    assert t7.account.status == "OPEN"
    assert t7.account.lines.count() == 0


def test_copilot_lists_available_rooms(auth_client, ai_on, calls, bruno):
    """O 102 esta ocupado por uma estadia CHECKED_IN; so o livre volta."""
    RoomFactory(number="210", capacity=3)
    calls.queue.extend(
        [
            requires(
                function_call(
                    "available_rooms",
                    {
                        "checkin_date": "2026-09-06",
                        "checkout_date": "2026-09-07",
                        "people": 1,
                    },
                    "call_rooms",
                )
            ),
            answered(answer_call("Livre agora: o 210.")),
        ]
    )

    with freeze_time(local(date(2026, 9, 6), 10, 0)):
        response = ask(auth_client, "Quais quartos estão livres?")

    assert response.status_code == 200
    payload = result_payload(calls[1])
    assert payload == {"total": 1, "rooms": [{"number": "210", "capacity": 3}]}


def test_copilot_reports_revenue_as_money_strings(auth_client, ai_on, calls, attendant):
    reservation = ReservationFactory(
        checkin_date=MARCH_7, checkout_date=MARCH_9, has_vehicle=True
    )
    service.check_in(reservation, now=local(MARCH_7, 15), actor=attendant)
    service.check_out(reservation, now=local(MARCH_9, 12, 1), actor=attendant)

    calls.queue.extend(
        [
            requires(function_call("revenue_summary", {"period": "all"}, "call_rev")),
            answered(answer_call("Faturamos R$ 425,00 no total.")),
        ]
    )

    response = ask(auth_client, "Quanto faturamos até agora?")

    assert response.status_code == 200
    assert result_payload(calls[1]) == {
        "period": "all",
        "stays": 1,
        "billed": "425.00",
        "paid": "0.00",
        "late_fees": "90.00",
    }


def test_copilot_answers_without_tools_when_none_is_needed(auth_client, ai_on, calls):
    calls.queue.append(answered(answer_call("Sou a Íris, copiloto do hotel.")))

    response = ask(auth_client, "quem é você?")

    assert response.status_code == 200
    assert response.data == {
        "reply": "Sou a Íris, copiloto do hotel.",
        "proposed_action": None,
    }
    assert len(calls) == 1


def test_copilot_accepts_a_find_without_query_and_lists_everyone(auth_client, ai_on, calls, ana):
    """`query` ausente e comum e nao vale uma rodada gasta num erro de argumento."""
    calls.queue.extend(
        [
            requires(function_call("find_reservations", {"status": "PENDING"}, "call_find")),
            answered(answer_call("Uma reserva pendente: Ana Souza, quarto 101.")),
        ]
    )

    response = ask(auth_client, "Quem tem reserva pendente?")

    assert response.status_code == 200
    assert result_payload(calls[1])["total"] == 1


def test_copilot_runs_parallel_function_calls_and_returns_every_result(
    auth_client, ai_on, calls, ana, bruno
):
    """Duas chamadas na mesma resposta viram dois function_result, por call_id."""
    calls.queue.extend(
        [
            requires(
                find_call(ReservationStatus.PENDING, "", "call_a"),
                find_call(ReservationStatus.CHECKED_IN, "", "call_b"),
            ),
            answered(answer_call("Ana Souza tem reserva; Bruno Lima está no 102.")),
        ]
    )

    response = ask(auth_client, "Como está o hotel?")

    assert response.status_code == 200
    results = function_results(calls[1])
    assert [step["call_id"] for step in results] == ["call_a", "call_b"]
    assert result_of(calls[1], "call_a")["reservations"][0]["guest_name"] == "Ana Souza"
    assert result_of(calls[1], "call_b")["reservations"][0]["guest_name"] == "Bruno Lima"


# --- guardas -----------------------------------------------------------------


@pytest.fixture
def homonyms(db) -> list[Reservation]:
    return [
        ReservationFactory(guest__full_name="João Silva", room__number="201", checked_in=True),
        ReservationFactory(guest__full_name="João Pereira", room__number="202", checked_in=True),
    ]


def test_copilot_nulls_the_action_when_the_search_was_ambiguous(
    auth_client, ai_on, calls, homonyms
):
    calls.queue.extend(
        [
            requires(find_call(ReservationStatus.CHECKED_IN, "João")),
            answered(answer_call("Há dois João: 201 e 202.", "checkout", homonyms[0].pk)),
        ]
    )

    response = ask(auth_client, "o João está saindo")

    assert response.status_code == 200
    assert response.data["reply"] == "Há dois João: 201 e 202."
    assert response.data["proposed_action"] is None


def test_copilot_keeps_an_ambiguous_id_locked_after_the_model_narrows_it(
    auth_client, ai_on, calls, homonyms
):
    """Afunilar sozinho nao destrava: quem escolheu foi o modelo, nao o atendente."""
    target = homonyms[0]
    calls.queue.extend(
        [
            requires(find_call(ReservationStatus.CHECKED_IN, "João", "call_1")),
            requires(find_call(ReservationStatus.CHECKED_IN, f"#{target.pk}", "call_2")),
            answered(answer_call("É o João Silva, no 201.", "checkout", target.pk)),
        ]
    )

    response = ask(auth_client, "o João está saindo")

    assert response.status_code == 200
    assert result_of(calls[2], "call_2")["total"] == 1  # a 2a busca afunilou de fato
    assert response.data["proposed_action"] is None


def test_preview_checkout_refuses_an_id_the_search_did_not_single_out(
    auth_client, ai_on, calls, homonyms
):
    calls.queue.extend(
        [
            requires(find_call(ReservationStatus.CHECKED_IN, "João")),
            requires(
                function_call("preview_checkout", {"reservation_id": homonyms[0].pk}, "call_p")
            ),
            answered(answer_call("Qual dos dois João, o do 201 ou o do 202?")),
        ]
    )

    response = ask(auth_client, "quanto o João vai pagar?")

    assert response.status_code == 200
    assert result_of(calls[2], "call_p") == {
        "error": (
            "Reserva não identificada de forma única: busque pelo quarto ou nº da reserva."
        )
    }


def test_preview_checkout_reports_a_pending_reservation_as_a_tool_error_not_a_409(
    auth_client, ai_on, calls, ana
):
    calls.queue.extend(
        [
            requires(find_call(ReservationStatus.PENDING, "Ana")),
            requires(function_call("preview_checkout", {"reservation_id": ana.pk}, "call_p")),
            answered(answer_call("A Ana ainda não fez check-in.")),
        ]
    )

    response = ask(auth_client, "quanto a Ana vai pagar?")

    assert response.status_code == 200
    assert response.data["reply"] == "A Ana ainda não fez check-in."
    assert "error" in result_of(calls[2], "call_p")


@pytest.mark.parametrize(
    ("checked_in", "action_type"),
    [(False, "checkout"), (True, "check_in")],
)
def test_copilot_nulls_the_action_when_the_status_does_not_match_the_type(
    auth_client, ai_on, calls, checked_in: bool, action_type: str
):
    reservation = ReservationFactory(guest__full_name="Ana Souza", checked_in=checked_in)
    status = ReservationStatus.CHECKED_IN if checked_in else ReservationStatus.PENDING
    calls.queue.extend(
        [
            requires(find_call(status, "Ana")),
            answered(answer_call("Achei a Ana Souza.", action_type, reservation.pk)),
        ]
    )

    response = ask(auth_client)

    assert response.status_code == 200
    assert response.data["proposed_action"] is None


def test_copilot_nulls_the_action_when_the_model_invents_a_reservation_id(
    auth_client, ai_on, calls, ana
):
    """Id inventado derruba o botao, nao a resposta: o texto e de dados reais."""
    calls.queue.extend(
        [
            requires(find_call(ReservationStatus.PENDING, "Ana")),
            answered(answer_call("A Ana Souza tem reserva hoje.", "check_in", 999)),
        ]
    )

    response = ask(auth_client)

    assert response.status_code == 200
    assert response.data["reply"] == "A Ana Souza tem reserva hoje."
    assert response.data["proposed_action"] is None


def test_copilot_returns_an_error_result_for_an_unknown_function(auth_client, ai_on, calls):
    calls.queue.extend(
        [
            requires(function_call("cancel_reservation", {"reservation_id": 1}, "call_x")),
            answered(answer_call("Não sei fazer isso.")),
        ]
    )

    response = ask(auth_client)

    assert response.status_code == 200
    assert result_payload(calls[1]) == {"error": "Ferramenta desconhecida."}


@pytest.mark.parametrize(
    ("label", "call"),
    [
        ("status fora do enum", function_call("find_reservations", {"status": "CANCELLED"})),
        ("status ausente", function_call("find_reservations", {"query": "Ana"})),
        ("id que nao e numero", function_call("preview_checkout", {"reservation_id": "abc"})),
        (
            "zero pessoas",
            function_call(
                "available_rooms",
                {"checkin_date": "2026-09-06", "checkout_date": "2026-09-07", "people": 0},
            ),
        ),
        (
            "saida antes da entrada",
            function_call(
                "available_rooms",
                {"checkin_date": "2026-09-07", "checkout_date": "2026-09-06"},
            ),
        ),
        ("periodo inexistente", function_call("revenue_summary", {"period": "year"})),
    ],
)
def test_copilot_returns_an_error_result_for_an_invalid_function_input(
    auth_client, ai_on, calls, label: str, call: dict
):
    calls.queue.extend([requires(call), answered(answer_call("Deixe-me tentar de novo."))])

    response = ask(auth_client)

    assert response.status_code == 200, label
    assert "error" in result_payload(calls[1]), label


# --- limites e upstream ------------------------------------------------------


def test_copilot_returns_502_when_the_model_never_calls_answer(auth_client, ai_on, calls, ana):
    calls.queue.extend([requires(find_call(ReservationStatus.PENDING, "Ana"))] * 5)

    response = ask(auth_client)

    assert response.status_code == 502
    assert response.data == UPSTREAM_ENVELOPE
    assert len(calls) == 5  # MAX_TOOL_ROUNDS + 1


def test_copilot_returns_502_when_the_model_replies_in_prose(auth_client, ai_on, calls):
    calls.queue.append(FakeResponse(200, interaction_body(model_output("oi"), status="completed")))

    response = ask(auth_client)

    assert response.status_code == 502
    assert response.data == UPSTREAM_ENVELOPE


@pytest.mark.parametrize(
    ("label", "outcome"),
    [
        ("corpo que nao e json", FakeResponse(200, None, valid_json=False)),
        ("resposta sem steps", FakeResponse(200, {"id": "x", "status": "completed"})),
        ("steps que nao e lista", FakeResponse(200, {"status": "completed", "steps": {}})),
        ("status failed", FakeResponse(200, interaction_body(status="failed"))),
        ("status incomplete", FakeResponse(200, interaction_body(status="incomplete"))),
        ("status in_progress", FakeResponse(200, interaction_body(status="in_progress"))),
        ("requisicao invalida", FakeResponse(400, {"error": {"message": "bad tool_choice"}})),
        ("erro do provedor", FakeResponse(500, {"error": {"message": "internal"}})),
        ("provedor indisponivel", FakeResponse(503, {"error": {"message": "unavailable"}})),
        ("cota esgotada sem chave paga", FakeResponse(429, {"error": {"status": "EXHAUSTED"}})),
        ("timeout", httpx.ReadTimeout("tempo esgotado")),
        ("rede fora", httpx.ConnectError("dns")),
        (
            "acao fora do enum",
            FakeResponse(200, interaction_body(answer_call("ok", "cancel", 1), status="completed")),
        ),
        (
            "answer sem reply",
            FakeResponse(
                200,
                interaction_body(
                    function_call("answer", {"action_type": "none"}), status="completed"
                ),
            ),
        ),
        (
            "reservation_id que nao e numero",
            FakeResponse(
                200,
                interaction_body(
                    function_call(
                        "answer",
                        {"reply": "ok", "action_type": "check_in", "reservation_id": "abc"},
                    ),
                    status="completed",
                ),
            ),
        ),
        (
            "function_call sem id",
            FakeResponse(
                200,
                interaction_body(
                    {"type": "function_call", "name": "revenue_summary", "arguments": {}}
                ),
            ),
        ),
    ],
)
def test_copilot_returns_502_on_upstream_trouble(
    auth_client, ai_on, calls, label: str, outcome: Any
):
    calls.queue.append(outcome)

    response = ask(auth_client)

    assert response.status_code == 502, label
    assert response.data == UPSTREAM_ENVELOPE, label


def test_copilot_tolerates_an_answer_without_reservation_id(auth_client, ai_on, calls):
    """Texto bom com argumento faltando vira 200 sem botao, nunca 502."""
    calls.queue.append(
        FakeResponse(
            200,
            interaction_body(
                function_call("answer", {"reply": "Está tudo calmo."}), status="completed"
            ),
        )
    )

    response = ask(auth_client)

    assert response.status_code == 200
    assert response.data == {"reply": "Está tudo calmo.", "proposed_action": None}


def test_copilot_shrinks_each_timeout_to_the_remaining_budget(
    auth_client, ai_on, calls, monkeypatch, ana
):
    """Sem freeze_time: o orcamento do laco anda no relogio monotonico."""
    calls.tick = 4.0
    monkeypatch.setattr(ai_client.time, "monotonic", lambda: calls.now)
    calls.queue.extend([requires(find_call(ReservationStatus.PENDING, "Ana"))] * 4)

    response = ask(auth_client)

    assert response.status_code == 502
    assert [call["timeout"] for call in calls] == [10.0, 10.0, 7.0, 3.0]
    assert len(calls) == 4  # a 5a rodada nao sai: o orcamento acabou


# --- fallback de chave -------------------------------------------------------


def test_copilot_falls_back_to_the_paid_key_on_quota_exhaustion(
    auth_client, ai_on_with_paid, calls
):
    calls.queue.extend(
        [
            FakeResponse(429, {"error": {"status": "RESOURCE_EXHAUSTED"}}),
            answered(answer_call("Tudo tranquilo.")),
        ]
    )

    response = ask(auth_client)

    assert response.status_code == 200
    assert response.data["reply"] == "Tudo tranquilo."
    assert calls[0]["headers"]["x-goog-api-key"] == FAKE_KEY
    assert calls[1]["headers"]["x-goog-api-key"] == PAID_KEY
    # Mesma chamada, so a chave muda.
    assert calls[0]["json"] == calls[1]["json"]


def test_copilot_keeps_the_paid_key_for_the_rest_of_the_request(
    auth_client, ai_on_with_paid, calls, ana
):
    calls.queue.extend(
        [
            FakeResponse(429, {"error": {"status": "RESOURCE_EXHAUSTED"}}),
            requires(find_call(ReservationStatus.PENDING, "Ana")),
            answered(answer_call("A Ana Souza tem reserva hoje.")),
        ]
    )

    response = ask(auth_client)

    assert response.status_code == 200
    assert [call["headers"]["x-goog-api-key"] for call in calls] == [
        FAKE_KEY,
        PAID_KEY,
        PAID_KEY,
    ]


def test_copilot_returns_502_on_quota_exhaustion_without_a_paid_key(auth_client, ai_on, calls):
    calls.queue.append(FakeResponse(429, {"error": {"status": "RESOURCE_EXHAUSTED"}}))

    response = ask(auth_client)

    assert response.status_code == 502
    assert len(calls) == 1


# --- PII e contrato publicado ------------------------------------------------


def test_copilot_never_logs_the_conversation(auth_client, ai_on, calls, caplog, ana):
    calls.queue.extend(
        [
            requires(find_call(ReservationStatus.PENDING, "Ana Souza")),
            answered(answer_call("A Ana Souza tem reserva hoje no 101.", "check_in", ana.pk)),
        ]
    )

    with caplog.at_level(logging.DEBUG):
        response = ask(auth_client)

    assert response.status_code == 200
    logged = caplog.text
    assert "Ana Souza" not in logged
    assert ana.guest.document not in logged
    assert QUESTION not in logged
    assert FAKE_KEY not in logged


def test_copilot_failure_never_logs_the_conversation(auth_client, ai_on, calls, caplog):
    calls.queue.append(httpx.ReadTimeout("tempo esgotado"))

    with caplog.at_level(logging.DEBUG):
        response = ask(auth_client)

    assert response.status_code == 502
    assert QUESTION not in caplog.text
    assert FAKE_KEY not in caplog.text


def test_schema_documents_the_copilot_and_drops_the_parser(api_client):
    schema = api_client.get("/api/schema/", {"format": "json"}).data

    assert "/api/ai/status/" in schema["paths"]
    assert "/api/ai/parse-guest/" not in schema["paths"]
    copilot = schema["paths"]["/api/ai/copilot/"]["post"]
    assert copilot["summary"]
    for code in ("200", "400", "502", "503"):
        assert code in copilot["responses"], code
