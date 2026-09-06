from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import date, datetime, time
from decimal import Decimal
from typing import TYPE_CHECKING

from django.utils import timezone

from core.errors import DomainError, DomainValidationError
from core.money import ZERO, quantize_money
from hotel.billing import engine
from hotel.billing.models import Account, AccountLine, AccountStatus, Payment, PricingPolicy

if TYPE_CHECKING:  # pragma: no cover
    from django.contrib.auth.models import AbstractBaseUser


def rate_table_of(policy: PricingPolicy) -> engine.RateTable:
    return engine.RateTable(
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
    if checkout_limit > checkin_opens:
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


class BillingError(DomainError):
    code = "INVALID_STATUS"


class AccountNotOpenError(BillingError):
    default_detail = "Conta fechada não aceita lançamentos."


class AccountNotClosedError(BillingError):
    default_detail = "Pagamento disponível apenas com a conta fechada."


class AccountAlreadyPaidError(BillingError):
    default_detail = "Esta conta já foi paga."


@dataclass(frozen=True)
class LineInput:
    kind: str
    service_date: date
    unit_amount: Decimal
    quantity: Decimal = field(default=Decimal("1"))
    description: str = ""


def open_account(*, now: datetime) -> Account:
    return Account.objects.create(opened_at=now)


def post_line(
    account: Account,
    *,
    kind: str,
    service_date: date,
    unit_amount: Decimal,
    quantity: Decimal = Decimal("1"),
    description: str = "",
    posted_by: AbstractBaseUser | None,
    now: datetime,
) -> AccountLine:
    line = LineInput(
        kind=kind,
        service_date=service_date,
        unit_amount=unit_amount,
        quantity=quantity,
        description=description,
    )
    return post_lines(account, [line], posted_by=posted_by, now=now)[0]


def post_lines(
    account: Account,
    lines: Sequence[LineInput],
    *,
    posted_by: AbstractBaseUser | None,
    now: datetime,
) -> list[AccountLine]:
    """Um lock e um INSERT: o checkout de N noites nao trava N vezes."""
    locked = _lock(account)
    if locked.status != AccountStatus.OPEN:
        raise AccountNotOpenError
    return AccountLine.objects.bulk_create(
        AccountLine(
            account=locked,
            kind=line.kind,
            service_date=line.service_date,
            description=line.description,
            quantity=line.quantity,
            unit_amount=line.unit_amount,
            amount=quantize_money(line.quantity * line.unit_amount),
            posted_at=now,
            posted_by=posted_by,
        )
        for line in lines
    )


def close_account(account: Account, *, now: datetime) -> Account:
    locked = _lock(account)
    if locked.status != AccountStatus.OPEN:
        raise AccountNotOpenError
    total = quantize_money(sum((line.amount for line in locked.lines.all()), ZERO))
    locked.status = AccountStatus.CLOSED
    locked.closed_at = now
    locked.total_amount = total
    locked.save(update_fields=["status", "closed_at", "total_amount"])
    return locked


def register_payment(
    account: Account,
    *,
    method: str,
    now: datetime,
    actor: AbstractBaseUser,
) -> Account:
    locked = _lock(account)
    if locked.status == AccountStatus.PAID:
        raise AccountAlreadyPaidError(
            extra={"paid_at": timezone.localtime(locked.payment.paid_at).isoformat()}
        )
    if locked.status != AccountStatus.CLOSED:
        raise AccountNotClosedError
    Payment.objects.create(
        account=locked,
        amount=locked.total_amount,
        method=method,
        paid_at=now,
        received_by=actor,
    )
    locked.status = AccountStatus.PAID
    locked.save(update_fields=["status"])
    return locked


def _lock(account: Account) -> Account:
    return Account.objects.select_for_update().get(pk=account.pk)
