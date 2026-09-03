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

from hotel.models import PricingPolicy
from hotel.services import pricing
from hotel.services.errors import DomainValidationError

if TYPE_CHECKING:  # pragma: no cover - apenas para anotacao
    from django.contrib.auth.models import AbstractBaseUser


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
