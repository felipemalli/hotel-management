"""
Cadastros administrativos (SPEC 3.4).

Aqui vivem as mutacoes que um ADMIN faz fora do balcao: publicar politica de
tarifas hoje, cadastrar quarto amanha. Separado de `reservations.py` porque nao
compartilha nada com a maquina de estados -- nem lock, nem transicao, nem
dinheiro congelado.

**`rate_table_of` e o unico ponto do sistema que transforma politica em
`RateTable`.** Isso importa alem da arrumacao: e a costura para preco por
quarto. Quando um `RoomType` existir, esta funcao passa a receber o quarto e
faz `dataclasses.replace(...)` -- `pricing.py`, as linhas do extrato ja
persistidas e a tabela T1-T9 nao mudam. O que NAO se faz agora e aceitar
`room=None` e ignorar: parametro morto e pior que assimetria.
"""

from __future__ import annotations

from datetime import datetime, time
from decimal import Decimal
from typing import TYPE_CHECKING

from hotel.models import ROOM_NUMBER_UNIQUE, PricingPolicy, ReservationStatus, Room
from hotel.services import pricing
from hotel.services.errors import (
    DomainError,
    DomainValidationError,
    translate_integrity_error,
)

if TYPE_CHECKING:  # pragma: no cover - apenas para anotacao
    from django.contrib.auth.models import AbstractBaseUser


class DuplicateRoomNumberError(DomainError):
    """Numero de quarto ja cadastrado."""

    code = "VALIDATION_ERROR"
    status_code = 400
    default_detail = "Dados inválidos."

    def __init__(self) -> None:
        super().__init__(extra={"number": ["Já existe um quarto com este número."]})


def create_room(*, number: str, capacity: int) -> Room:
    """Cadastra um quarto.

    Sem `actor`: nenhuma coluna do quarto grava quem o criou, e parametro morto
    e pior que assimetria com os servicos de reserva. Numero duplicado sai como
    `400` no campo, nao como um codigo novo -- e erro de formulario, nao
    conflito com o estado de um recurso.
    """
    with translate_integrity_error({ROOM_NUMBER_UNIQUE: DuplicateRoomNumberError}):
        return Room.objects.create(number=number, capacity=capacity)


def update_room(room: Room, *, capacity: int | None = None, is_active: bool | None = None) -> Room:
    """Ajusta capacidade e operacao. Sem `DELETE` (`PROTECT` + historico).

    As duas guardas existem porque as duas mudancas podem invalidar uma reserva
    JA aceita: desativar um quarto ocupado deixaria o hospede num quarto que o
    sistema considera fora de operacao, e reduzir a capacidade abaixo do grupo
    que ja esta la tornaria a reserva impossivel de existir.
    """
    fields: list[str] = []

    if is_active is False and _has_active_reservation(room):
        raise RoomInUseError()

    if capacity is not None:
        occupants = _largest_active_party(room)
        if capacity < occupants:
            raise DomainValidationError(
                "capacity",
                f"O quarto {room.number} tem reserva ativa para {occupants} pessoas.",
            )
        room.capacity = capacity
        fields.append("capacity")

    if is_active is not None:
        room.is_active = is_active
        fields.append("is_active")

    if fields:
        room.save(update_fields=fields)
    return room


class RoomInUseError(DomainError):
    """Quarto com reserva ativa nao sai de operacao -- 409 INVALID_STATUS."""

    code = "INVALID_STATUS"
    default_detail = "Quarto com reserva ativa não pode ser desativado."


def _has_active_reservation(room: Room) -> bool:
    return room.reservations.filter(
        status__in=[ReservationStatus.PENDING, ReservationStatus.CHECKED_IN]
    ).exists()


def _largest_active_party(room: Room) -> int:
    """Maior grupo entre as reservas ativas do quarto (titular + acompanhantes).

    Hoje toda reserva tem exatamente uma pessoa; a contagem existe assim para
    que a guarda continue verdadeira quando acompanhantes entrarem, sem virar
    um numero magico agora.
    """
    active = room.reservations.filter(
        status__in=[ReservationStatus.PENDING, ReservationStatus.CHECKED_IN]
    )
    return max((1 for _ in active), default=0)


def rate_table_of(policy: PricingPolicy) -> pricing.RateTable:
    """Politica persistida -> `RateTable` do motor puro."""
    return pricing.RateTable(
        weekday_rate=policy.weekday_rate,
        weekend_rate=policy.weekend_rate,
        weekday_park=policy.weekday_park,
        weekend_park=policy.weekend_park,
        late_fee_factor=policy.late_fee_factor,
        checkin_opens=policy.checkin_opens,
        checkout_limit=policy.checkout_limit,
    )


def create_policy(
    *,
    actor: AbstractBaseUser,
    now: datetime,
    weekday_rate: Decimal,
    weekend_rate: Decimal,
    weekday_park: Decimal,
    weekend_park: Decimal,
    late_fee_factor: Decimal,
    checkin_opens: time,
    checkout_limit: time,
    note: str = "",
) -> PricingPolicy:
    """Publica uma politica com vigencia a partir de `now`.

    `effective_from = now` e nao um valor do cliente: vigencia retroativa
    reescreveria o passado de reservas ja fechadas, e vigencia futura agendada
    e uma feature (com fila, cancelamento e visualizacao) que ninguem pediu.
    Publicar e um ato, e o ato acontece agora.
    """
    if checkout_limit > checkin_opens:
        # A CHECK do banco e a autoridade; isto existe para dar mensagem boa.
        raise DomainValidationError(
            "checkout_limit",
            "O limite de checkout deve ser anterior ao horário de abertura do check-in.",
        )

    return PricingPolicy.objects.create(
        weekday_rate=weekday_rate,
        weekend_rate=weekend_rate,
        weekday_park=weekday_park,
        weekend_park=weekend_park,
        late_fee_factor=late_fee_factor,
        checkin_opens=checkin_opens,
        checkout_limit=checkout_limit,
        note=note,
        effective_from=now,
        created_by=actor,
    )
