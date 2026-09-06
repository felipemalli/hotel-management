from __future__ import annotations

import json
import logging
from datetime import date, time
from typing import Any

import httpx
import pytest
from freezegun import freeze_time

from ai import client as ai_client
from ai import config as ai_config
from ai.config import DEFAULT_MODEL, MAX_ROUNDS, TIMEOUT_SECONDS
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

FAKE_KEY = "chave-de-teste"

QUESTION = "A Ana Souza chegou, tem reserva hoje."

MARCH_7 = date(2025, 3, 7)
MARCH_9 = date(2025, 3, 9)

UPSTREAM_ENVELOPE = {
    "code": "AI_UPSTREAM_ERROR",
    "detail": "O provedor de IA não devolveu uma resposta utilizável.",
    "extra": {},
}


class CallLog(list):
    def __init__(self) -> None:
        super().__init__()
        self.queue: list[Any] = []
        self.now = 0.0
        self.tick = 0.0


@pytest.fixture
def calls(monkeypatch) -> CallLog:
    """Dublê do transporte: registra a chamada e devolve o que o caso enfileirou.

    A fila é estrita — chamada sem resposta enfileirada é erro de teste, não uma
    rodada extra silenciosa.
    """
    log = CallLog()

    def fake_post(url: str, **kwargs: Any) -> httpx.Response:
        # Snapshot: `input` é a mesma lista, mutada a cada rodada. O json.dumps
        # também reproduz o encoder do httpx — um Decimal que vazasse quebra aqui.
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
    settings.OPENAI_API_KEY = FAKE_KEY
    return settings


@pytest.fixture
def ai_off(settings):
    settings.OPENAI_API_KEY = ""
    return settings


def upstream(status_code: int, **kwargs: Any) -> httpx.Response:
    request = httpx.Request("POST", ai_client.RESPONSES_URL)
    return httpx.Response(status_code, request=request, **kwargs)


def responds(*output: dict) -> httpx.Response:
    return upstream(
        200, json={"id": "resp-de-teste", "status": "completed", "output": list(output)}
    )


def function_call(name: str, arguments: dict, call_id: str = "call_1") -> dict[str, Any]:
    return {
        "id": f"fc_{call_id}",
        "type": "function_call",
        "status": "completed",
        "call_id": call_id,
        "name": name,
        "arguments": json.dumps(arguments),
    }


def find_call(status: str, query: str = "", call_id: str = "call_find") -> dict[str, Any]:
    return function_call("find_reservations", {"status": status, "query": query}, call_id=call_id)


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


def message_output(text: str) -> dict[str, Any]:
    return {
        "id": "msg_1",
        "type": "message",
        "status": "completed",
        "role": "assistant",
        "content": [{"type": "output_text", "text": text}],
    }


def tool_outputs(call: dict) -> list[dict]:
    return [item for item in call["json"]["input"] if item.get("type") == "function_call_output"]


def result_of(call: dict, call_id: str) -> Any:
    """Endereça pelo `call_id`: o `input` acumula os resultados de todas as rodadas."""
    for item in tool_outputs(call):
        if item["call_id"] == call_id:
            return json.loads(item["output"])
    raise AssertionError(f"nenhum function_call_output para {call_id}")


def ask(client, message: str = QUESTION):
    return client.post(COPILOT_URL, {"message": message}, format="json")


@pytest.fixture
def ana(db) -> Reservation:
    return ReservationFactory(guest__full_name="Ana Souza", room__number="101", has_vehicle=True)


@pytest.fixture
def bruno(db) -> Reservation:
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


def test_the_suite_cannot_reach_the_network():
    with pytest.raises(AssertionError, match="chamada HTTP de saida"):
        httpx.post(ai_client.RESPONSES_URL, json={})


def test_a_test_never_sees_the_real_provider_key(settings):
    assert settings.OPENAI_API_KEY == ""
    assert ai_config.api_key() == ""
    assert ai_config.ai_enabled() is False


def test_status_reports_disabled_without_key(auth_client, ai_off):
    response = auth_client.get(STATUS_URL)

    assert response.status_code == 200
    assert response.data == {"enabled": False}


def test_status_reports_enabled_with_key(auth_client, ai_on):
    response = auth_client.get(STATUS_URL)

    assert response.status_code == 200
    assert response.data == {"enabled": True}


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


def test_copilot_calls_the_responses_api_as_contracted(auth_client, ai_on, calls):
    calls.queue.append(responds(answer_call("Tudo tranquilo por aqui.")))

    with freeze_time(local(MARCH_7, 10, 0)):
        response = ask(auth_client)

    assert response.status_code == 200
    assert len(calls) == 1
    call = calls[0]
    assert call["url"] == "https://api.openai.com/v1/responses"
    assert call["timeout"] == TIMEOUT_SECONDS
    assert call["headers"]["authorization"] == f"Bearer {FAKE_KEY}"
    assert call["headers"]["content-type"] == "application/json"

    body = call["json"]
    assert body["model"] == DEFAULT_MODEL
    assert body["store"] is False
    assert body["tool_choice"] == "required"
    assert body["max_output_tokens"] == 2048
    assert [tool["name"] for tool in body["tools"]] == [
        "find_reservations",
        "preview_checkout",
        "available_rooms",
        "revenue_summary",
        "answer",
    ]
    assert body["input"] == [{"role": "user", "content": QUESTION}]
    assert "check-in abre às 14:00" in body["instructions"]


def test_every_tool_is_declared_in_strict_mode(auth_client, ai_on, calls):
    """Strict é o default da API: ela reescreve o schema, então declaramos o que ela exige."""
    calls.queue.append(responds(answer_call("Ok.")))

    ask(auth_client)

    for tool in calls[0]["json"]["tools"]:
        parameters = tool["parameters"]
        assert parameters["required"] == list(parameters["properties"]), tool["name"]
        assert parameters["additionalProperties"] is False, tool["name"]


def test_copilot_honours_the_model_override(auth_client, ai_on, calls):
    ai_on.OPENAI_MODEL = "gpt-4.1-mini"
    calls.queue.append(responds(answer_call("Ok.")))

    ask(auth_client)

    assert calls[0]["json"]["model"] == "gpt-4.1-mini"


def test_copilot_system_instruction_carries_the_policy_clock(auth_client, ai_on, calls):
    PricingPolicyFactory(checkin_opens=time(15, 0), effective_from=local(MARCH_7, 0))
    calls.queue.append(responds(answer_call("Ok.")))

    with freeze_time(local(MARCH_7, 13, 45)):
        ask(auth_client)

    instructions = calls[0]["json"]["instructions"]
    assert "Agora: 13:45" in instructions
    assert "sexta-feira" in instructions
    assert "check-in abre às 15:00 (ainda não abriu)" in instructions


def test_copilot_proposes_check_in_after_finding_one_pending_reservation(
    auth_client, ai_on, calls, ana
):
    calls.queue.extend(
        [
            responds(find_call(ReservationStatus.PENDING, "Ana Souza")),
            responds(answer_call("A Ana Souza tem reserva hoje no 101.", "check_in", ana.pk)),
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

    second = calls[1]["json"]["input"]
    assert second[0] == {"role": "user", "content": QUESTION}
    # Verbatim: o item do modelo volta como veio, com o `id` que a API carimbou.
    assert second[1] == find_call(ReservationStatus.PENDING, "Ana Souza")
    assert second[2]["type"] == "function_call_output"
    assert second[2]["call_id"] == "call_find"

    payload = result_of(calls[1], "call_find")
    assert payload["total"] == 1
    row = payload["reservations"][0]
    assert row["guest_name"] == "Ana Souza"
    assert row["room"] == "101"
    assert row["has_vehicle"] is True
    assert row["companions"] == []
    assert "document" not in row
    assert "phone" not in row

    ana.refresh_from_db()
    assert ana.status == ReservationStatus.PENDING


def test_copilot_finds_a_companion_by_name(auth_client, ai_on, calls, bruno):
    calls.queue.extend(
        [
            responds(find_call(ReservationStatus.CHECKED_IN, "Eva")),
            responds(answer_call("A Eva Lima está no 102, com o Bruno Lima.")),
        ]
    )

    response = ask(auth_client, "a Eva chegou")

    assert response.status_code == 200
    payload = result_of(calls[1], "call_find")
    assert payload["total"] == 1
    assert payload["reservations"][0]["reservation_id"] == bruno.pk
    assert payload["reservations"][0]["companions"] == ["Eva Lima"]


def test_copilot_previews_checkout_without_writing(auth_client, ai_on, calls, t7):
    calls.queue.extend(
        [
            responds(find_call(ReservationStatus.CHECKED_IN, "Carla")),
            responds(function_call("preview_checkout", {"reservation_id": t7.pk}, "call_prev")),
            responds(answer_call("O total da Carla Nunes é R$ 425,00.", "checkout", t7.pk)),
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
    RoomFactory(number="210", capacity=3)
    calls.queue.extend(
        [
            responds(
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
            responds(answer_call("Livre agora: o 210.")),
        ]
    )

    with freeze_time(local(date(2026, 9, 6), 10, 0)):
        response = ask(auth_client, "Quais quartos estão livres?")

    assert response.status_code == 200
    assert result_of(calls[1], "call_rooms") == {
        "total": 1,
        "rooms": [{"number": "210", "capacity": 3}],
    }


def test_copilot_reports_revenue_as_money_strings(auth_client, ai_on, calls, attendant):
    reservation = ReservationFactory(checkin_date=MARCH_7, checkout_date=MARCH_9, has_vehicle=True)
    service.check_in(reservation, now=local(MARCH_7, 15), actor=attendant)
    service.check_out(reservation, now=local(MARCH_9, 12, 1), actor=attendant)

    calls.queue.extend(
        [
            responds(function_call("revenue_summary", {"period": "all"}, "call_rev")),
            responds(answer_call("Faturamos R$ 425,00 no total.")),
        ]
    )

    response = ask(auth_client, "Quanto faturamos até agora?")

    assert response.status_code == 200
    assert result_of(calls[1], "call_rev") == {
        "period": "all",
        "stays": 1,
        "billed": "425.00",
        "paid": "0.00",
        "late_fees": "90.00",
    }


def test_copilot_answers_without_tools_when_none_is_needed(auth_client, ai_on, calls):
    calls.queue.append(responds(answer_call("Sou a Íris, copiloto do hotel.")))

    response = ask(auth_client, "quem é você?")

    assert response.status_code == 200
    assert response.data == {
        "reply": "Sou a Íris, copiloto do hotel.",
        "proposed_action": None,
    }
    assert len(calls) == 1


def test_copilot_lists_everyone_when_the_query_is_blank(auth_client, ai_on, calls, ana):
    calls.queue.extend(
        [
            responds(find_call(ReservationStatus.PENDING, "")),
            responds(answer_call("Uma reserva pendente: Ana Souza, quarto 101.")),
        ]
    )

    response = ask(auth_client, "Quem tem reserva pendente?")

    assert response.status_code == 200
    assert result_of(calls[1], "call_find")["total"] == 1


def test_copilot_runs_parallel_function_calls_and_returns_every_result(
    auth_client, ai_on, calls, ana, bruno
):
    calls.queue.extend(
        [
            responds(
                find_call(ReservationStatus.PENDING, "", "call_a"),
                find_call(ReservationStatus.CHECKED_IN, "", "call_b"),
            ),
            responds(answer_call("Ana Souza tem reserva; Bruno Lima está no 102.")),
        ]
    )

    response = ask(auth_client, "Como está o hotel?")

    assert response.status_code == 200
    assert [item["call_id"] for item in tool_outputs(calls[1])] == ["call_a", "call_b"]
    assert result_of(calls[1], "call_a")["reservations"][0]["guest_name"] == "Ana Souza"
    assert result_of(calls[1], "call_b")["reservations"][0]["guest_name"] == "Bruno Lima"


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
            responds(find_call(ReservationStatus.CHECKED_IN, "João")),
            responds(answer_call("Há dois João: 201 e 202.", "checkout", homonyms[0].pk)),
        ]
    )

    response = ask(auth_client, "o João está saindo")

    assert response.status_code == 200
    assert response.data["reply"] == "Há dois João: 201 e 202."
    assert response.data["proposed_action"] is None


def test_copilot_keeps_an_ambiguous_id_locked_after_the_model_narrows_it(
    auth_client, ai_on, calls, homonyms
):
    target = homonyms[0]
    calls.queue.extend(
        [
            responds(find_call(ReservationStatus.CHECKED_IN, "João", "call_1")),
            responds(find_call(ReservationStatus.CHECKED_IN, f"#{target.pk}", "call_2")),
            responds(answer_call("É o João Silva, no 201.", "checkout", target.pk)),
        ]
    )

    response = ask(auth_client, "o João está saindo")

    assert response.status_code == 200
    assert result_of(calls[2], "call_2")["total"] == 1
    assert response.data["proposed_action"] is None


def test_preview_checkout_refuses_an_id_the_search_did_not_single_out(
    auth_client, ai_on, calls, homonyms
):
    calls.queue.extend(
        [
            responds(find_call(ReservationStatus.CHECKED_IN, "João")),
            responds(
                function_call("preview_checkout", {"reservation_id": homonyms[0].pk}, "call_p")
            ),
            responds(answer_call("Qual dos dois João, o do 201 ou o do 202?")),
        ]
    )

    response = ask(auth_client, "quanto o João vai pagar?")

    assert response.status_code == 200
    assert result_of(calls[2], "call_p") == {
        "error": ("Reserva não identificada de forma única: busque pelo quarto ou nº da reserva.")
    }


def test_preview_checkout_reports_a_pending_reservation_as_a_tool_error_not_a_409(
    auth_client, ai_on, calls, ana
):
    calls.queue.extend(
        [
            responds(find_call(ReservationStatus.PENDING, "Ana")),
            responds(function_call("preview_checkout", {"reservation_id": ana.pk}, "call_p")),
            responds(answer_call("A Ana ainda não fez check-in.")),
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
            responds(find_call(status, "Ana")),
            responds(answer_call("Achei a Ana Souza.", action_type, reservation.pk)),
        ]
    )

    response = ask(auth_client)

    assert response.status_code == 200
    assert response.data["proposed_action"] is None


def test_copilot_nulls_the_action_when_the_model_invents_a_reservation_id(
    auth_client, ai_on, calls, ana
):
    calls.queue.extend(
        [
            responds(find_call(ReservationStatus.PENDING, "Ana")),
            responds(answer_call("A Ana Souza tem reserva hoje.", "check_in", 999)),
        ]
    )

    response = ask(auth_client)

    assert response.status_code == 200
    assert response.data["reply"] == "A Ana Souza tem reserva hoje."
    assert response.data["proposed_action"] is None


def test_copilot_returns_an_error_result_for_an_unknown_function(auth_client, ai_on, calls):
    calls.queue.extend(
        [
            responds(function_call("cancel_reservation", {"reservation_id": 1}, "call_x")),
            responds(answer_call("Não sei fazer isso.")),
        ]
    )

    response = ask(auth_client)

    assert response.status_code == 200
    assert result_of(calls[1], "call_x") == {"error": "Ferramenta desconhecida."}


@pytest.mark.parametrize(
    ("label", "call"),
    [
        ("status fora do enum", function_call("find_reservations", {"status": "CANCELLED"})),
        ("status ausente", function_call("find_reservations", {"query": "Ana"})),
        ("query ausente", function_call("find_reservations", {"status": "PENDING"})),
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
                {"checkin_date": "2026-09-07", "checkout_date": "2026-09-06", "people": 1},
            ),
        ),
        ("periodo inexistente", function_call("revenue_summary", {"period": "year"})),
    ],
)
def test_copilot_returns_an_error_result_for_an_invalid_function_input(
    auth_client, ai_on, calls, label: str, call: dict
):
    calls.queue.extend([responds(call), responds(answer_call("Deixe-me tentar de novo."))])

    response = ask(auth_client)

    assert response.status_code == 200, label
    assert "error" in result_of(calls[1], "call_1"), label


def test_copilot_forces_the_answer_on_the_last_round(auth_client, ai_on, calls, ana):
    """Modelo que fica repetindo consultas termina em resposta, não em 502."""
    calls.queue.extend([responds(find_call(ReservationStatus.PENDING, "Ana"))] * (MAX_ROUNDS - 1))
    calls.queue.append(responds(answer_call("A Ana Souza tem reserva hoje.")))

    response = ask(auth_client)

    assert response.status_code == 200
    choices = [call["json"]["tool_choice"] for call in calls]
    assert choices[:-1] == ["required"] * (MAX_ROUNDS - 1)
    assert choices[-1] == {"type": "function", "name": "answer"}


def test_copilot_returns_502_when_the_model_never_calls_answer(auth_client, ai_on, calls, ana):
    calls.queue.extend([responds(find_call(ReservationStatus.PENDING, "Ana"))] * MAX_ROUNDS)

    response = ask(auth_client)

    assert response.status_code == 502
    assert response.data == UPSTREAM_ENVELOPE
    assert len(calls) == MAX_ROUNDS


@pytest.mark.parametrize(
    ("label", "outcome"),
    [
        ("corpo que nao e json", upstream(200, content=b"<html>erro</html>")),
        ("resposta sem output", upstream(200, json={"id": "x", "status": "completed"})),
        ("output que nao e lista", upstream(200, json={"output": {}})),
        ("status failed sem itens", upstream(200, json={"status": "failed", "output": []})),
        ("prosa em vez de ferramenta", responds(message_output("oi"))),
        ("requisicao invalida", upstream(400, json={"error": {"message": "bad tool_choice"}})),
        ("erro do provedor", upstream(500, json={"error": {"message": "internal"}})),
        ("provedor indisponivel", upstream(503, json={"error": {"message": "unavailable"}})),
        ("cota esgotada", upstream(429, json={"error": {"code": "insufficient_quota"}})),
        ("timeout", httpx.ReadTimeout("tempo esgotado")),
        ("rede fora", httpx.ConnectError("dns")),
        ("acao fora do enum", responds(answer_call("ok", "cancel", 1))),
        ("answer sem reply", responds(function_call("answer", {"action_type": "none"}))),
        (
            "reservation_id que nao e numero",
            responds(
                function_call(
                    "answer",
                    {"reply": "ok", "action_type": "check_in", "reservation_id": "abc"},
                )
            ),
        ),
        (
            "arguments que nao e json",
            responds(
                {
                    "id": "fc_1",
                    "type": "function_call",
                    "call_id": "call_1",
                    "name": "answer",
                    "arguments": "{quebrado",
                }
            ),
        ),
        (
            "function_call sem call_id",
            responds(
                {
                    "id": "fc_1",
                    "type": "function_call",
                    "name": "revenue_summary",
                    "arguments": "{}",
                }
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


def test_copilot_shrinks_each_timeout_to_the_remaining_budget(
    auth_client, ai_on, calls, monkeypatch, ana
):
    """Sem freeze_time: o orçamento do laço anda no relógio monotônico."""
    calls.tick = 4.0
    monkeypatch.setattr(ai_client.time, "monotonic", lambda: calls.now)
    calls.queue.extend([responds(find_call(ReservationStatus.PENDING, "Ana"))] * 4)

    response = ask(auth_client)

    assert response.status_code == 502
    assert [call["timeout"] for call in calls] == [10.0, 10.0, 7.0, 3.0]
    assert len(calls) == 4


def test_copilot_never_logs_the_conversation(auth_client, ai_on, calls, caplog, ana):
    calls.queue.extend(
        [
            responds(find_call(ReservationStatus.PENDING, "Ana Souza")),
            responds(answer_call("A Ana Souza tem reserva hoje no 101.", "check_in", ana.pk)),
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
