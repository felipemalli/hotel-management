"""
Motor financeiro (SPEC 3).

Modulo PURO por contrato: sem ORM, sem I/O, sem relogio proprio. Quem chama
injeta os timestamps (SPEC 0.3), e eles chegam aqui **em hora local** --
`services/reservations.py` converte com `timezone.localtime()` antes, porque
as regras de 14h/12h sao regras de hora local, nao de UTC.

A tabela SPEC 3.3 (T1-T9) e a fonte da verdade destes numeros e esta
replicada 1:1 em `tests/unit/test_pricing.py`.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from decimal import ROUND_HALF_UP, Decimal

CHECKIN_OPENS = time(14, 0, 0)  # check-in permitido se hora local >= isto (D4)
CHECKOUT_LIMIT = time(12, 0, 0)  # multa se hora local > isto; 12:00:00 e isento (D3)

ZERO = Decimal("0.00")
CENTS = Decimal("0.01")

WEEKEND_WEEKDAYS = frozenset({5, 6})  # sabado, domingo
WEEKDAY_LABELS = (
    "segunda-feira",
    "terça-feira",
    "quarta-feira",
    "quinta-feira",
    "sexta-feira",
    "sábado",
    "domingo",
)


@dataclass(frozen=True)
class RateTable:
    """Tarifas vigentes. Parametro, nao constante de modulo (SPEC 3.1).

    A SPEC 1.3 afirma que o extrato e recomputavel deterministicamente dos
    timestamps -- e isso so e verdade enquanto as tarifas nao mudarem. Com as
    tarifas em constantes globais, o dia em que a diaria subir faz
    `statement()` de uma reserva antiga discordar do `total_amount` congelado,
    silenciosamente e sem nenhum teste pegar (a tabela SPEC 3.3 e fixture da
    propria constante: mudaria junto). Como parametro, a tarifa de uma estadia
    passada pode ser reconstituida; e o modulo continua puro, porque ganhou um
    argumento, nao uma dependencia.
    """

    weekday_rate: Decimal
    weekend_rate: Decimal
    weekday_park: Decimal
    weekend_park: Decimal
    late_fee_factor: Decimal


DEFAULT_RATES = RateTable(
    weekday_rate=Decimal("120.00"),
    weekend_rate=Decimal("180.00"),
    weekday_park=Decimal("15.00"),
    weekend_park=Decimal("20.00"),
    late_fee_factor=Decimal("0.5"),
)


@dataclass(frozen=True)
class BillLine:
    """Uma diaria: a data cobrada, sua tarifa e a taxa de vaga do dia."""

    date: date
    weekday_label: str
    daily_rate: Decimal
    parking_fee: Decimal


@dataclass(frozen=True)
class Bill:
    """Extrato completo. `late_fee_base` e None quando nao houve multa."""

    lines: list[BillLine]
    subtotal_daily: Decimal
    subtotal_parking: Decimal
    late_fee_applied: bool
    late_fee_base: Decimal | None
    late_fee: Decimal
    total: Decimal


def quantize_money(value: Decimal) -> Decimal:
    """Duas casas, ROUND_HALF_UP -- a unica arredondadora do sistema (SPEC 0.3)."""
    return value.quantize(CENTS, rounding=ROUND_HALF_UP)


def is_weekend(day: date) -> bool:
    return day.weekday() in WEEKEND_WEEKDAYS


def daily_rate(day: date, rates: RateTable = DEFAULT_RATES) -> Decimal:
    """Tarifa da propria data da diaria (D2), nao da data em que a noite termina."""
    return rates.weekend_rate if is_weekend(day) else rates.weekday_rate


def parking_fee(day: date, *, has_vehicle: bool, rates: RateTable = DEFAULT_RATES) -> Decimal:
    if not has_vehicle:
        return ZERO
    return rates.weekend_park if is_weekend(day) else rates.weekday_park


def weekday_label(day: date) -> str:
    return WEEKDAY_LABELS[day.weekday()]


def stay_dates(checkin: date, checkout: date) -> list[date]:
    """Uma diaria por data em [checkin, checkout); day-use cobra 1 diaria (D1)."""
    days: list[date] = []
    current = checkin
    while current < checkout:
        days.append(current)
        current += timedelta(days=1)
    if not days:
        return [checkin]
    return days


def early_checkin(now: datetime) -> bool:
    """True se a tentativa e antes das 14:00 locais; 14:00:00 em ponto NAO e cedo (D4)."""
    return now.time() < CHECKIN_OPENS


def late_checkout(now: datetime) -> bool:
    """True se a saida e depois das 12:00 locais; 12:00:00 em ponto e isento (D3)."""
    return now.time() > CHECKOUT_LIMIT


def calculate_bill(
    *,
    checkin: datetime,
    checkout: datetime,
    has_vehicle: bool,
    rates: RateTable = DEFAULT_RATES,
) -> Bill:
    """Extrato dos fatos reais (D6). `checkin`/`checkout` sao hora LOCAL.

    `rates` tem default: a tabela SPEC 3.3 (T1-T9) vale com `DEFAULT_RATES` e
    nenhum chamador precisa passar nada enquanto a tarifa for a do briefing.
    """
    lines = [
        BillLine(
            date=day,
            weekday_label=weekday_label(day),
            daily_rate=daily_rate(day, rates),
            parking_fee=parking_fee(day, has_vehicle=has_vehicle, rates=rates),
        )
        for day in stay_dates(checkin.date(), checkout.date())
    ]

    subtotal_daily = quantize_money(sum((line.daily_rate for line in lines), ZERO))
    subtotal_parking = quantize_money(sum((line.parking_fee for line in lines), ZERO))

    applied = late_checkout(checkout)
    # A multa usa a tarifa do dia da SAIDA (D3): o procedimento de checkout e
    # o que o briefing penaliza, e ele acontece na data de saida.
    base = daily_rate(checkout.date(), rates) if applied else None
    fee = quantize_money(rates.late_fee_factor * base) if applied else ZERO

    return Bill(
        lines=lines,
        subtotal_daily=subtotal_daily,
        subtotal_parking=subtotal_parking,
        late_fee_applied=applied,
        late_fee_base=base,
        late_fee=fee,
        total=quantize_money(subtotal_daily + subtotal_parking + fee),
    )
