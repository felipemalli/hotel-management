from __future__ import annotations

from dataclasses import dataclass
from datetime import date, time, timedelta
from decimal import Decimal

from core.money import ZERO, quantize_money

CHECKIN_OPENS = time(14, 0, 0)  # permitido se hora local >= isto; 14:00:00 nao e cedo
CHECKOUT_LIMIT = time(12, 0, 0)  # limite do dia contratado; 12:00:00 e isento

WEEKEND_WEEKDAYS = frozenset({5, 6})  # sabado, domingo
WEEKDAY_KIND = "weekday"
WEEKEND_KIND = "weekend"
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
class LateFee:
    date: date
    weekday_label: str
    base_rate: Decimal
    amount: Decimal


@dataclass(frozen=True)
class Bill:
    lines: list[BillLine]
    subtotal_daily: Decimal
    subtotal_parking: Decimal
    late_fees: list[LateFee]
    late_fee: Decimal
    total: Decimal

    @property
    def late_fee_applied(self) -> bool:
        return bool(self.late_fees)


@dataclass(frozen=True)
class QuoteBucket:
    kind: str
    nights: int
    daily_rate: Decimal
    parking_fee: Decimal
    subtotal_daily: Decimal
    subtotal_parking: Decimal


@dataclass(frozen=True)
class StayQuote:
    nights: int
    buckets: tuple[QuoteBucket, ...]
    subtotal_daily: Decimal
    subtotal_parking: Decimal
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


def late_fee_days(
    *,
    checkout_day: date,
    checkout_time: time,
    booked_checkout_day: date,
    rates: RateTable = DEFAULT_RATES,
) -> list[date]:
    """Um dia multado por dia com permanência além do limite, do contratado em diante."""
    days: list[date] = []
    day = booked_checkout_day
    while day <= checkout_day:
        if day < checkout_day or checkout_time > rates.checkout_limit:
            days.append(day)
        day += timedelta(days=1)
    return days


def late_checkout(
    *,
    checkout_day: date,
    checkout_time: time,
    booked_checkout_day: date,
    rates: RateTable = DEFAULT_RATES,
) -> bool:
    return bool(
        late_fee_days(
            checkout_day=checkout_day,
            checkout_time=checkout_time,
            booked_checkout_day=booked_checkout_day,
            rates=rates,
        )
    )


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

    fees = [
        LateFee(
            date=day,
            weekday_label=weekday_label(day),
            base_rate=daily_rate(day, rates),
            amount=quantize_money(rates.late_fee_factor * daily_rate(day, rates)),
        )
        for day in late_fee_days(
            checkout_day=checkout_day,
            checkout_time=checkout_time,
            booked_checkout_day=booked_checkout_day,
            rates=rates,
        )
    ]
    late_fee = quantize_money(sum((fee.amount for fee in fees), ZERO))

    return Bill(
        lines=lines,
        subtotal_daily=subtotal_daily,
        subtotal_parking=subtotal_parking,
        late_fees=fees,
        late_fee=late_fee,
        total=quantize_money(subtotal_daily + subtotal_parking + late_fee),
    )


def quote_scheduled_stay(
    *,
    checkin: date,
    checkout: date,
    has_vehicle: bool,
    rates: RateTable = DEFAULT_RATES,
) -> StayQuote:
    """Diárias e vaga do período agendado, assumindo saída no limite — sem multa."""
    bill = calculate_bill(
        checkin_day=checkin,
        checkout_day=checkout,
        checkout_time=rates.checkout_limit,
        booked_checkin_day=checkin,
        booked_checkout_day=checkout,
        has_vehicle=has_vehicle,
        rates=rates,
    )
    weekday_lines = [line for line in bill.lines if not is_weekend(line.date)]
    weekend_lines = [line for line in bill.lines if is_weekend(line.date)]
    grouped = (
        _quote_bucket(WEEKDAY_KIND, weekday_lines),
        _quote_bucket(WEEKEND_KIND, weekend_lines),
    )
    buckets = tuple(bucket for bucket in grouped if bucket is not None)
    return StayQuote(
        nights=len(bill.lines),
        buckets=buckets,
        subtotal_daily=bill.subtotal_daily,
        subtotal_parking=bill.subtotal_parking,
        total=bill.total,
    )


def _quote_bucket(kind: str, lines: list[BillLine]) -> QuoteBucket | None:
    if not lines:
        return None
    first = lines[0]
    return QuoteBucket(
        kind=kind,
        nights=len(lines),
        daily_rate=first.daily_rate,
        parking_fee=first.parking_fee,
        subtotal_daily=quantize_money(sum((line.daily_rate for line in lines), ZERO)),
        subtotal_parking=quantize_money(sum((line.parking_fee for line in lines), ZERO)),
    )
