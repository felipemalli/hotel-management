from __future__ import annotations

from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from decimal import Decimal

from core.money import ZERO, quantize_money
from hotel.billing.engine import Bill, BillLine, LateFee, weekday_label
from hotel.billing.models import AccountLine, LineKind
from hotel.reservations.errors import InvalidStatusError


@dataclass(frozen=True)
class Statement:
    lines: list[BillLine]
    subtotal_daily: Decimal
    subtotal_parking: Decimal
    late_fees: list[LateFee]
    late_fee: Decimal
    extras: list[AccountLine]
    subtotal_extras: Decimal
    total: Decimal

    @property
    def late_fee_applied(self) -> bool:
        return bool(self.late_fees)

    @classmethod
    def from_bill(cls, bill: Bill, *, extras: Iterable[AccountLine] = ()) -> Statement:
        # list(...) sempre: `()` e `[]` nao sao iguais na comparacao do dataclass.
        extras = list(extras)
        subtotal_extras = quantize_money(sum((line.amount for line in extras), ZERO))
        return cls(
            lines=bill.lines,
            subtotal_daily=bill.subtotal_daily,
            subtotal_parking=bill.subtotal_parking,
            late_fees=bill.late_fees,
            late_fee=bill.late_fee,
            extras=extras,
            subtotal_extras=subtotal_extras,
            total=quantize_money(bill.total + subtotal_extras),
        )


def statement_from_lines(lines: Sequence[AccountLine], *, total: Decimal) -> Statement:
    """Hidrata o extrato do livro. Nunca chama o motor: `total` e o congelado da conta."""
    dailies: dict = {}
    parkings: dict = {}
    late_fee_lines: list[AccountLine] = []
    extras: list[AccountLine] = []

    for line in lines:
        if line.kind == LineKind.DAILY:
            dailies[line.service_date] = line
        elif line.kind == LineKind.PARKING:
            parkings[line.service_date] = line
        elif line.kind == LineKind.LATE_FEE:
            late_fee_lines.append(line)
        else:
            extras.append(line)

    if not dailies:
        raise InvalidStatusError("Extrato indisponível: esta reserva não tem linhas gravadas.")

    bill_lines = [
        BillLine(
            date=day,
            weekday_label=weekday_label(day),
            daily_rate=dailies[day].amount,
            parking_fee=parkings[day].amount if day in parkings else ZERO,
        )
        for day in sorted(dailies)
    ]

    late_fees = [
        LateFee(
            date=line.service_date,
            weekday_label=weekday_label(line.service_date),
            base_rate=line.unit_amount,
            amount=line.amount,
        )
        for line in sorted(late_fee_lines, key=lambda line: line.service_date)
    ]

    subtotal_extras = quantize_money(sum((line.amount for line in extras), ZERO))
    return Statement(
        lines=bill_lines,
        subtotal_daily=quantize_money(sum((line.daily_rate for line in bill_lines), ZERO)),
        subtotal_parking=quantize_money(sum((line.parking_fee for line in bill_lines), ZERO)),
        late_fees=late_fees,
        late_fee=quantize_money(sum((fee.amount for fee in late_fees), ZERO)),
        extras=extras,
        subtotal_extras=subtotal_extras,
        total=total,
    )
