"""
Camada de mutacao das reservas (SPEC 3.2, 1.5).

Aqui vive a orquestracao com ORM: valida a transicao de status, converte os
timestamps para hora local antes de aplicar regra (SPEC 0.3), delega TODO o
dinheiro para `pricing` (puro) e congela os totais na linha, dentro de
`transaction.atomic` + `select_for_update`.

O relogio e injetado: `now` e sempre parametro explicito -- a view passa
`timezone.now()`, o teste e o seed passam o que quiserem.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import TYPE_CHECKING

from django.db import transaction
from django.utils import timezone

from hotel import selectors
from hotel.models import Guest, Reservation, ReservationStatus
from hotel.services import pricing
from hotel.services.catalog import rate_table_of
from hotel.services.errors import DomainError, DomainValidationError
from hotel.services.pricing import Bill

if TYPE_CHECKING:  # pragma: no cover - apenas para anotacao
    from django.contrib.auth.models import AbstractBaseUser

# Transicoes validas (SPEC 1.5). Qualquer outra e rejeitada.
ALLOWED_TRANSITIONS: dict[str, frozenset[str]] = {
    ReservationStatus.PENDING: frozenset(
        {ReservationStatus.CHECKED_IN, ReservationStatus.CANCELLED}
    ),
    ReservationStatus.CHECKED_IN: frozenset({ReservationStatus.CHECKED_OUT}),
    ReservationStatus.CHECKED_OUT: frozenset(),
    ReservationStatus.CANCELLED: frozenset(),
}

# Toda coluna que uma transicao escreve entra aqui: e o que faz a instancia do
# chamador ficar em dia com a linha sem um segundo SELECT. Lista manual de
# proposito -- derivar de `update_fields` esconderia o esquecimento --, e
# `test_sync_matches_refresh_from_db` e o alarme de quem esquecer.
SYNCED_FIELDS = (
    "status",
    "policy_id",
    "checked_in_at",
    "checked_out_at",
    "cancelled_at",
    "checked_in_by_id",
    "checked_out_by_id",
    "cancelled_by_id",
    "total_daily",
    "total_parking",
    "late_fee",
    "total_amount",
)


class ReservationError(DomainError):
    """Erro de dominio da reserva -- 409 com o codigo do envelope (SPEC 4.1)."""

    code = "INVALID_STATUS"
    default_detail = "Operação inválida para esta reserva."


class InvalidStatusError(ReservationError):
    """Transicao de status ilegal -- 409 INVALID_STATUS (SPEC 4.1)."""

    code = "INVALID_STATUS"
    default_detail = "Transição de status inválida."


class EarlyCheckinError(ReservationError):
    """Check-in antes da abertura, sem override -- 409 EARLY_CHECKIN (D4).

    O `default_detail` sobrevive com "14:00" porque e o default do briefing e o
    fallback de quem levanta o erro sem `detail`. Quem levanta de verdade
    (`check_in`) interpola o horario da politica vigente: com a politica default
    a mensagem sai byte a byte igual a de antes, e com uma politica de 15:00 ela
    para de mentir. `extra["opens_at"]` da ao cliente o horario sem parsear
    texto.
    """

    code = "EARLY_CHECKIN"
    default_detail = "Check-in permitido a partir das 14:00."


def create_reservation(
    *,
    guest: Guest,
    checkin_date: date,
    checkout_date: date,
    has_vehicle: bool = False,
    actor: AbstractBaseUser,
    today: date,
) -> Reservation:
    """Agenda uma reserva (RF2). Nasce `PENDING`, sem dinheiro (SPEC 4.4).

    `today` e parametro, nao `timezone.localdate()` lido aqui dentro: D11 e uma
    regra de data local e o invariante SPEC 0.3 vale para a criacao como vale
    para o check-in -- quem materializa "hoje" e a view.

    `actor` e obrigatorio como nas transicoes: quem abriu a reserva e parte do
    registro. A coluna continua nulavel para a linha que nasceu fora da API (o
    shell), nao para tornar o parametro opcional aqui.
    """
    if checkin_date < today:
        # D11: reserva e compromisso futuro. O passado entra no sistema pelos
        # fatos (check-in/checkout reais), nunca pelo agendamento.
        raise DomainValidationError("checkin_date", "Data de check-in não pode ser no passado.")
    if checkout_date <= checkin_date:
        # D13: agendamento exige no minimo 1 noite (espelha a constraint SPEC 1.5).
        raise DomainValidationError(
            "checkout_date", "Data de checkout deve ser posterior à de check-in."
        )

    # `atomic` mesmo com uma unica escrita: criacao parcial de reserva nao
    # existe, e e esta transacao que da ao savepoint de traducao de constraint
    # (`errors.translate_integrity_error`) um lugar para aninhar.
    with transaction.atomic():
        return Reservation.objects.create(
            guest=guest,
            checkin_date=checkin_date,
            checkout_date=checkout_date,
            has_vehicle=has_vehicle,
            created_by=actor,
        )


def check_in(
    reservation: Reservation,
    *,
    now: datetime,
    actor: AbstractBaseUser,
    allow_early: bool = False,
) -> Reservation:
    """Efetiva o check-in. Antes das 14h locais exige `allow_early` (D4).

    `actor` e obrigatorio: a transicao grava quem a fez, e um default silencioso
    (`None`) deixaria a linha do tempo com buracos justo onde ela e interessante
    -- "quem hospedou este hospede as 2h da manha".
    """
    with transaction.atomic():
        # Trava o HOSPEDE, nao apenas a reserva: a invariante "no maximo uma
        # estadia ativa" (SPEC 1.5, `resv_one_active_per_guest`) vale ENTRE
        # linhas, e travar so a reserva deixaria dois atendentes passarem pela
        # checagem ao mesmo tempo, em reservas diferentes do mesmo hospede.
        Guest.objects.select_for_update().get(pk=reservation.guest_id)
        locked = _lock(reservation)
        _assert_transition(locked, ReservationStatus.CHECKED_IN)
        _assert_no_active_stay(locked)

        # A politica VIGENTE NO ATO decide se e cedo -- este e o unico valor
        # que nao pode vir da politica amarrada, porque a amarracao acontece
        # duas linhas abaixo (D15).
        policy = selectors.policy_in_force(now)
        rates = rate_table_of(policy)

        local_now = timezone.localtime(now)
        if pricing.early_checkin(local_now, rates) and not allow_early:
            # Alerta, nao proibicao: o atendente reenvia com allow_early=True.
            opens_at = f"{rates.checkin_opens:%H:%M}"
            raise EarlyCheckinError(
                detail=f"Check-in permitido a partir das {opens_at}.",
                extra={"server_time": local_now.strftime("%H:%M"), "opens_at": opens_at},
            )

        locked.status = ReservationStatus.CHECKED_IN
        locked.checked_in_at = now
        locked.checked_in_by = actor
        locked.policy = policy
        locked.save(update_fields=["status", "checked_in_at", "checked_in_by", "policy"])

    return _sync(reservation, locked)


def check_out(reservation: Reservation, *, now: datetime, actor: AbstractBaseUser) -> Bill:
    """Efetiva o checkout, congela os totais e devolve o extrato (SPEC 4.4)."""
    with transaction.atomic():
        locked = _lock(reservation)
        _assert_transition(locked, ReservationStatus.CHECKED_OUT)
        if locked.checked_in_at is None:
            raise InvalidStatusError("Reserva sem check-in registrado.")

        # Cobranca pelos fatos reais, em hora local (D6, SPEC 0.3), com a
        # politica AMARRADA no check-in -- nao a vigente agora (D15). Se um
        # admin publicar tarifa nova durante a estadia, a conta continua a que
        # foi combinada na entrada.
        bill = pricing.calculate_bill(
            checkin=timezone.localtime(locked.checked_in_at),
            checkout=timezone.localtime(now),
            has_vehicle=locked.has_vehicle,
            rates=rate_table_of(locked.policy),
        )

        locked.status = ReservationStatus.CHECKED_OUT
        locked.checked_out_at = now
        locked.checked_out_by = actor
        locked.total_daily = bill.subtotal_daily
        locked.total_parking = bill.subtotal_parking
        locked.late_fee = bill.late_fee
        locked.total_amount = bill.total
        locked.save(
            update_fields=[
                "status",
                "checked_out_at",
                "checked_out_by",
                "total_daily",
                "total_parking",
                "late_fee",
                "total_amount",
            ]
        )

    _sync(reservation, locked)
    return bill


def cancel(reservation: Reservation, *, now: datetime, actor: AbstractBaseUser) -> Reservation:
    """`PENDING -> CANCELLED`. Nenhum outro estado cancela (D8)."""
    with transaction.atomic():
        locked = _lock(reservation)
        _assert_transition(locked, ReservationStatus.CANCELLED)
        locked.status = ReservationStatus.CANCELLED
        locked.cancelled_at = now
        locked.cancelled_by = actor
        locked.save(update_fields=["status", "cancelled_at", "cancelled_by"])

    return _sync(reservation, locked)


def statement(reservation: Reservation) -> Bill:
    """Recomputa o extrato de uma reserva ja finalizada (SPEC 1.3: sem JSON no banco)."""
    if reservation.status != ReservationStatus.CHECKED_OUT:
        raise InvalidStatusError("Extrato disponível apenas após o checkout.")
    return pricing.calculate_bill(
        checkin=timezone.localtime(reservation.checked_in_at),
        checkout=timezone.localtime(reservation.checked_out_at),
        has_vehicle=reservation.has_vehicle,
        rates=rate_table_of(reservation.policy),
    )


def _lock(reservation: Reservation) -> Reservation:
    """Rele a linha sob `select_for_update`: dois atendentes nao concluem a mesma acao."""
    return Reservation.objects.select_for_update().get(pk=reservation.pk)


def _assert_no_active_stay(reservation: Reservation) -> None:
    """Hospede com estadia em curso nao faz novo check-in.

    Sem esta checagem a `UniqueConstraint` do banco estoura como
    `IntegrityError`, que o handler da SPEC 4.1 nao classifica -- virava HTTP
    500 com corpo HTML numa condicao legitima de negocio (hospede com duas
    reservas PENDING). Invariante violada e `409 INVALID_STATUS`.
    """
    active = (
        Reservation.objects.filter(
            guest_id=reservation.guest_id, status=ReservationStatus.CHECKED_IN
        )
        .exclude(pk=reservation.pk)
        .values_list("pk", flat=True)
        .first()
    )
    if active is not None:
        raise InvalidStatusError(
            "Hóspede já possui uma estadia ativa; faça o checkout antes de um novo check-in.",
            extra={"status": reservation.status, "active_reservation_id": active},
        )


def _assert_transition(reservation: Reservation, target: str) -> None:
    if target not in ALLOWED_TRANSITIONS[reservation.status]:
        raise InvalidStatusError(
            f"Transição inválida: {reservation.status} -> {target}.",
            extra={"status": reservation.status},
        )


def _sync(reservation: Reservation, locked: Reservation) -> Reservation:
    """Devolve a instancia do chamador em dia com a linha, sem novo SELECT."""
    for field in SYNCED_FIELDS:
        setattr(reservation, field, getattr(locked, field))
    return reservation
