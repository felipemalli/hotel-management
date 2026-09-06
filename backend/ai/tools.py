from __future__ import annotations

from datetime import datetime
from typing import Any

from django.utils import timezone
from rest_framework import serializers

from core.errors import DomainError
from core.serializers import money_field
from hotel.reservations import selectors, services
from hotel.reservations.models import ReservationStatus
from hotel.reservations.serializers import StatementSerializer, build_statement

MAX_ROWS = 10

FIND_RESERVATIONS = "find_reservations"
PREVIEW_CHECKOUT = "preview_checkout"
AVAILABLE_ROOMS = "available_rooms"
REVENUE_SUMMARY = "revenue_summary"
ANSWER = "answer"


def _tool(name: str, description: str, properties: dict[str, Any]) -> dict[str, Any]:
    """Declaração no modo estrito da OpenAI: todo argumento chega sempre preenchido."""
    return {
        "type": "function",
        "name": name,
        "description": description,
        "parameters": {
            "type": "object",
            "properties": properties,
            "required": list(properties),
            "additionalProperties": False,
        },
    }


TOOLS = [
    _tool(
        FIND_RESERVATIONS,
        "Reservas de um status. Em `query` passe só o termo que o atendente "
        "falou — nome do titular, nome de acompanhante, número do quarto ou nº "
        "da reserva (com ou sem '#') —, nunca a frase inteira. `query` vazia "
        "lista todas as reservas do status.",
        {
            "status": {
                "type": "string",
                "enum": [ReservationStatus.PENDING, ReservationStatus.CHECKED_IN],
                "description": (
                    "PENDING = tem reserva e ainda não fez check-in; "
                    "CHECKED_IN = está hospedado agora."
                ),
            },
            "query": {"type": "string", "description": "Termo de busca. Vazio lista todas."},
        },
    ),
    _tool(
        PREVIEW_CHECKOUT,
        "Quanto sairia o checkout desta estadia se fosse agora: uma linha por "
        "diária, vaga, multa de atraso e total. Não grava nada. Use apenas com "
        "uma reserva CHECKED_IN que a busca devolveu sozinha.",
        {"reservation_id": {"type": "integer", "description": "Nº da reserva."}},
    ),
    _tool(
        AVAILABLE_ROOMS,
        "Quartos livres no período, com a capacidade de cada um. Para 'quartos "
        "livres agora' use hoje como entrada, amanhã como saída e 1 pessoa.",
        {
            "checkin_date": {"type": "string", "description": "Entrada, no formato YYYY-MM-DD."},
            "checkout_date": {
                "type": "string",
                "description": "Saída, no formato YYYY-MM-DD; posterior à entrada.",
            },
            "people": {
                "type": "integer",
                "description": "Quantas pessoas; 1 quando o atendente não disser.",
            },
        },
    ),
    _tool(
        REVENUE_SUMMARY,
        "Faturamento das estadias já encerradas: total fechado, quanto já foi "
        "pago, multas e número de estadias. 'Até agora' ou 'no total' é `all`.",
        {
            "period": {
                "type": "string",
                "enum": ["today", "month", "all"],
                "description": "today = hoje; month = mês corrente; all = desde sempre.",
            }
        },
    ),
    _tool(
        ANSWER,
        "Entrega a resposta ao atendente e encerra o atendimento. Chame sempre, "
        "sozinha, depois de ler o resultado das outras ferramentas.",
        {
            "reply": {
                "type": "string",
                "description": "A resposta, curta, em português, sem markdown.",
            },
            "action_type": {
                "type": "string",
                "enum": ["none", "check_in", "checkout"],
                "description": "Ação a oferecer como botão; `none` quando não há ação.",
            },
            "reservation_id": {
                "type": "integer",
                "description": "Reserva da ação; 0 quando `action_type` é `none`.",
            },
        },
    ),
]

ACTION_STATUS = {
    "check_in": ReservationStatus.PENDING,
    "checkout": ReservationStatus.CHECKED_IN,
}


class ToolError(Exception):
    """Erro que volta ao modelo como resultado, para ele se recuperar sozinho."""


class FindReservationsInput(serializers.Serializer):
    status = serializers.ChoiceField(
        choices=[ReservationStatus.PENDING, ReservationStatus.CHECKED_IN]
    )
    query = serializers.CharField(allow_blank=True, max_length=100)


class PreviewCheckoutInput(serializers.Serializer):
    reservation_id = serializers.IntegerField(min_value=1)


class AvailableRoomsInput(serializers.Serializer):
    checkin_date = serializers.DateField()
    checkout_date = serializers.DateField()
    people = serializers.IntegerField(min_value=1)

    def validate(self, attrs: dict) -> dict:
        if attrs["checkout_date"] <= attrs["checkin_date"]:
            raise serializers.ValidationError({"checkout_date": ["Deve ser após a entrada."]})
        return attrs


class RevenueInput(serializers.Serializer):
    period = serializers.ChoiceField(choices=["today", "month", "all"])


class AnswerInput(serializers.Serializer):
    reply = serializers.CharField(trim_whitespace=True)
    action_type = serializers.ChoiceField(choices=["none", "check_in", "checkout"])
    reservation_id = serializers.IntegerField()


class ReservationSlice(serializers.Serializer):
    """Recorte para o provedor: nomes, quarto e datas saem; documento e telefone nunca."""

    reservation_id = serializers.IntegerField(source="pk")
    status = serializers.CharField()
    guest_name = serializers.CharField(source="guest.full_name")
    companions = serializers.SlugRelatedField(many=True, read_only=True, slug_field="full_name")
    room = serializers.CharField(source="room.number")
    checkin_date = serializers.DateField()
    checkout_date = serializers.DateField()
    has_vehicle = serializers.BooleanField()
    checked_in_at = serializers.DateTimeField(allow_null=True)


class RoomSlice(serializers.Serializer):
    number = serializers.CharField()
    capacity = serializers.IntegerField()


class RevenueSlice(serializers.Serializer):
    period = serializers.CharField()
    stays = serializers.IntegerField()
    billed = money_field()
    paid = money_field()
    late_fees = money_field()


def _validated(form: type[serializers.Serializer], args: dict[str, Any]) -> dict[str, Any]:
    payload = form(data=args)
    if not payload.is_valid():
        # Só os nomes dos campos: ecoar o valor devolveria ao modelo o erro dele.
        raise ToolError(f"Argumentos inválidos; revise: {', '.join(sorted(payload.errors))}.")
    return payload.validated_data


class ToolSession:
    """Executa as ferramentas de leitura e lembra sobre o que há ação possível.

    Id que apareceu ao lado de outra reserva fica travado pelo resto da request
    mesmo que o modelo afunile sozinho depois: aí quem escolheu foi ele.
    """

    def __init__(self, *, now: datetime) -> None:
        self.now = now
        self.seen_ids: set[int] = set()
        self.ambiguous_ids: set[int] = set()

    def actionable(self, reservation_id: int) -> bool:
        return reservation_id in self.seen_ids and reservation_id not in self.ambiguous_ids

    def run(self, name: str, args: dict[str, Any]) -> dict[str, Any]:
        handlers = {
            FIND_RESERVATIONS: self._find,
            PREVIEW_CHECKOUT: self._preview,
            AVAILABLE_ROOMS: self._rooms,
            REVENUE_SUMMARY: self._revenue,
        }
        handler = handlers.get(name)
        if handler is None:
            return {"error": "Ferramenta desconhecida."}

        try:
            return handler(args)
        except ToolError as exc:
            return {"error": str(exc)}

    def _find(self, args: dict[str, Any]) -> dict[str, Any]:
        data = _validated(FindReservationsInput, args)
        rows = list(selectors.search_stays(status=data["status"], term=data["query"])[:MAX_ROWS])

        ids = {row.pk for row in rows}
        self.seen_ids |= ids
        if len(rows) > 1:
            self.ambiguous_ids |= ids

        return {"total": len(rows), "reservations": ReservationSlice(rows, many=True).data}

    def _preview(self, args: dict[str, Any]) -> dict[str, Any]:
        data = _validated(PreviewCheckoutInput, args)
        reservation_id = data["reservation_id"]
        if not self.actionable(reservation_id):
            raise ToolError(
                "Reserva não identificada de forma única: busque pelo quarto ou nº da reserva."
            )

        reservation = selectors.reservation_queryset().filter(pk=reservation_id).first()
        if reservation is None:
            raise ToolError("Reserva não encontrada.")

        try:
            preview = services.preview_checkout(reservation, now=self.now)
        except DomainError as exc:
            raise ToolError(exc.detail) from exc

        return dict(StatementSerializer(build_statement(reservation, preview)).data)

    def _rooms(self, args: dict[str, Any]) -> dict[str, Any]:
        data = _validated(AvailableRoomsInput, args)
        rooms = list(
            selectors.available_rooms(
                checkin_date=data["checkin_date"],
                checkout_date=data["checkout_date"],
                people=data["people"],
                today=timezone.localdate(self.now),
            )
        )
        return {"total": len(rooms), "rooms": RoomSlice(rooms, many=True).data}

    def _revenue(self, args: dict[str, Any]) -> dict[str, Any]:
        data = _validated(RevenueInput, args)
        period = data["period"]
        summary = selectors.revenue_summary(since=self._since(period))
        return dict(
            RevenueSlice(
                {
                    "period": period,
                    "stays": summary.stays,
                    "billed": summary.billed,
                    "paid": summary.paid,
                    "late_fees": summary.late_fees,
                }
            ).data
        )

    def _since(self, period: str) -> datetime | None:
        if period == "all":
            return None
        midnight = timezone.localtime(self.now).replace(hour=0, minute=0, second=0, microsecond=0)
        return midnight if period == "today" else midnight.replace(day=1)

    def resolve_action(self, data: dict[str, Any]) -> dict[str, Any] | None:
        action_type = data["action_type"]
        if action_type == "none" or not self.actionable(data["reservation_id"]):
            return None

        reservation = selectors.reservation_queryset().filter(pk=data["reservation_id"]).first()
        # Relê o status: um check-in concorrente derruba a ação em vez de
        # oferecer um botão que já vai falhar.
        if reservation is None or reservation.status != ACTION_STATUS[action_type]:
            return None

        return {
            "type": action_type,
            "reservation_id": reservation.pk,
            "guest_name": reservation.guest.full_name,
        }
