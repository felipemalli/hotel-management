from __future__ import annotations

from dataclasses import dataclass
from datetime import date, time, timedelta
from decimal import Decimal

from core.money import ZERO, quantize_money

CHECKIN_OPENS = time(14, 0, 0)  # permitido se hora local >= isto; 14:00:00 nao e cedo
CHECKOUT_LIMIT = time(12, 0, 0)  # limite do dia contratado; 12:00:00 e isento

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
    weekday_rate: Decimal
    weekend_rate: Decimal
    weekday_park: Decimal
    weekend_park: Decimal
    late_fee_factor: Decimal
    # Defaults no fim: os testes constroem RateTable posicionalmente.
    checkin_opens: time = CHECKIN_OPENS
    checkout_limit: time = CHECKOUT_LIMIT


DEFAULT_RATES = RateTable(
    weekday_rate=Decimal("120.00"),
    weekend_rate=Decimal("180.00"),
    weekday_park=Decimal("15.00"),
    weekend_park=Decimal("20.00"),
    late_fee_factor=Decimal("0.5"),
    checkin_opens=CHECKIN_OPENS,
    checkout_limit=CHECKOUT_LIMIT,
)


@dataclass(frozen=True)
class BillLine:
    date: date
    weekday_label: str
    daily_rate: Decimal
    parking_fee: Decimal


@dataclass(frozen=True)
class Bill:
    lines: list[BillLine]
    subtotal_daily: Decimal
    subtotal_parking: Decimal
    late_fee_applied: bool
    late_fee_base: Decimal | None
    late_fee: Decimal
    total: Decimal


def is_weekend(day: date) -> bool:
    return day.weekday() in WEEKEND_WEEKDAYS


def daily_rate(day: date, rates: RateTable = DEFAULT_RATES) -> Decimal:
    return rates.weekend_rate if is_weekend(day) else rates.weekday_rate


def parking_fee(day: date, *, has_vehicle: bool, rates: RateTable = DEFAULT_RATES) -> Decimal:
    if not has_vehicle:
        return ZERO
    return rates.weekend_park if is_weekend(day) else rates.weekday_park


def weekday_label(day: date) -> str:
    return WEEKDAY_LABELS[day.weekday()]


def stay_dates(checkin: date, checkout: date) -> list[date]:
    """Uma diaria por data em [checkin, checkout); day-use cobra a data de entrada."""
    days: list[date] = []
    current = checkin
    while current < checkout:
        days.append(current)
        current += timedelta(days=1)
    if not days:
        return [checkin]
    return days


def early_checkin(local_time: time, rates: RateTable = DEFAULT_RATES) -> bool:
    return local_time < rates.checkin_opens


def late_checkout(
    *,
    checkout_day: date,
    checkout_time: time,
    booked_checkout_day: date,
    rates: RateTable = DEFAULT_RATES,
) -> bool:
    return checkout_day >= booked_checkout_day and checkout_time > rates.checkout_limit


def calculate_bill(
    *,
    checkin_day: date,
    checkout_day: date,
    checkout_time: time,
    booked_checkin_day: date,
    booked_checkout_day: date,
    has_vehicle: bool,
    rates: RateTable = DEFAULT_RATES,
) -> Bill:
    billed_from = min(checkin_day, booked_checkin_day)
    billed_until = max(checkout_day, booked_checkout_day)
    lines = [
        BillLine(
            date=day,
            weekday_label=weekday_label(day),
            daily_rate=daily_rate(day, rates),
            parking_fee=parking_fee(day, has_vehicle=has_vehicle, rates=rates),
        )
        for day in stay_dates(billed_from, billed_until)
    ]

    subtotal_daily = quantize_money(sum((line.daily_rate for line in lines), ZERO))
    subtotal_parking = quantize_money(sum((line.parking_fee for line in lines), ZERO))

    applied = late_checkout(
        checkout_day=checkout_day,
        checkout_time=checkout_time,
        booked_checkout_day=booked_checkout_day,
        rates=rates,
    )
    # A multa usa a tarifa do dia da saida: e o procedimento de checkout que se penaliza.
    base = daily_rate(checkout_day, rates) if applied else None
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
