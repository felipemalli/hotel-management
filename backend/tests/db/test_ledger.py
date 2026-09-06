from __future__ import annotations

from datetime import date, datetime, time, timedelta
from decimal import Decimal

import pytest
from django.db import IntegrityError, transaction
from django.utils import timezone

from hotel.billing import services as billing
from hotel.billing.models import Account, AccountLine, AccountStatus, LineKind, Payment
from tests.factories import UserFactory

pytestmark = pytest.mark.django_db

MARCH_7 = date(2025, 3, 7)
MARCH_8 = date(2025, 3, 8)


def local(day: date, hour: int, minute: int = 0) -> datetime:
    return timezone.make_aware(
        datetime.combine(day, time(hour, minute)), timezone.get_current_timezone()
    )


NOW = local(MARCH_7, 15)


@pytest.fixture
def actor():
    return UserFactory()


def daily(account, *, service_date=MARCH_7, unit=Decimal("120.00"), **kwargs):
    return billing.post_line(
        account,
        kind=LineKind.DAILY,
        service_date=service_date,
        unit_amount=unit,
        posted_by=None,
        now=NOW,
        **kwargs,
    )


def test_open_account_starts_open_without_total():
    account = billing.open_account(now=NOW)

    assert account.status == AccountStatus.OPEN
    assert account.opened_at == NOW
    assert account.closed_at is None
    assert account.total_amount is None


def test_post_line_quantizes_quantity_times_unit():
    account = billing.open_account(now=NOW)

    line = billing.post_line(
        account,
        kind=LineKind.EXTRA,
        service_date=MARCH_7,
        unit_amount=Decimal("120.00"),
        quantity=Decimal("0.3333"),
        posted_by=None,
        now=NOW,
    )

    assert line.amount == Decimal("40.00")


def test_post_lines_posts_in_one_lock_and_bulk():
    account = billing.open_account(now=NOW)

    lines = billing.post_lines(
        account,
        [
            billing.LineInput(LineKind.DAILY, MARCH_7, Decimal("120.00")),
            billing.LineInput(LineKind.DAILY, MARCH_8, Decimal("180.00")),
        ],
        posted_by=None,
        now=NOW,
    )

    assert [line.amount for line in lines] == [Decimal("120.00"), Decimal("180.00")]
    assert AccountLine.objects.filter(account=account).count() == 2


def test_post_line_on_closed_account_is_rejected():
    account = billing.open_account(now=NOW)
    daily(account)
    billing.close_account(account, now=NOW)

    with pytest.raises(billing.AccountNotOpenError) as excinfo:
        daily(account, service_date=MARCH_8)

    assert excinfo.value.code == "INVALID_STATUS"
    assert excinfo.value.status_code == 409


def test_late_fee_line_with_a_zero_factor_is_accepted():
    account = billing.open_account(now=NOW)

    line = billing.post_line(
        account,
        kind=LineKind.LATE_FEE,
        service_date=MARCH_8,
        unit_amount=Decimal("180.00"),
        quantity=Decimal("0"),
        posted_by=None,
        now=NOW,
    )

    assert line.amount == Decimal("0.00")


def test_close_account_freezes_the_sum_of_lines():
    account = billing.open_account(now=NOW)
    daily(account)
    daily(account, service_date=MARCH_8, unit=Decimal("180.00"))
    closed_at = local(MARCH_8, 12, 1)

    closed = billing.close_account(account, now=closed_at)

    assert closed.status == AccountStatus.CLOSED
    assert closed.closed_at == closed_at
    assert closed.total_amount == Decimal("300.00")


def test_close_empty_account_totals_zero():
    account = billing.open_account(now=NOW)

    closed = billing.close_account(account, now=NOW)

    assert closed.total_amount == Decimal("0.00")


def test_close_account_twice_is_rejected():
    account = billing.open_account(now=NOW)
    billing.close_account(account, now=NOW)

    with pytest.raises(billing.AccountNotOpenError):
        billing.close_account(account, now=NOW)


def test_register_payment_requires_closed_account(actor):
    account = billing.open_account(now=NOW)

    with pytest.raises(billing.AccountNotClosedError) as excinfo:
        billing.register_payment(account, method="PIX", now=NOW, actor=actor)

    assert excinfo.value.code == "INVALID_STATUS"
    assert not Payment.objects.exists()


def test_register_payment_marks_paid_in_the_same_transaction(actor):
    account = billing.open_account(now=NOW)
    daily(account)
    billing.close_account(account, now=NOW)
    paid_at = local(MARCH_8, 12, 30)

    paid = billing.register_payment(account, method="PIX", now=paid_at, actor=actor)

    assert paid.status == AccountStatus.PAID
    payment = Payment.objects.get(account=account)
    assert payment.amount == Decimal("120.00")
    assert payment.method == "PIX"
    assert payment.paid_at == paid_at
    assert payment.received_by_id == actor.pk


def test_register_payment_twice_is_rejected_with_paid_at(actor):
    account = billing.open_account(now=NOW)
    daily(account)
    billing.close_account(account, now=NOW)
    billing.register_payment(account, method="PIX", now=NOW, actor=actor)

    with pytest.raises(billing.AccountAlreadyPaidError) as excinfo:
        billing.register_payment(account, method="CASH", now=NOW, actor=actor)

    assert excinfo.value.extra["paid_at"] == timezone.localtime(NOW).isoformat()
    assert Payment.objects.filter(account=account).count() == 1


def test_account_closed_is_complete_constraint():
    with pytest.raises(IntegrityError) as excinfo, transaction.atomic():
        Account.objects.create(status=AccountStatus.CLOSED, opened_at=NOW)

    assert "account_closed_is_complete" in str(excinfo.value)


def test_daily_line_is_unique_per_service_date():
    account = billing.open_account(now=NOW)
    daily(account)

    with pytest.raises(IntegrityError) as excinfo, transaction.atomic():
        daily(account)

    assert "accountline_one_per_kind_date" in str(excinfo.value)


def test_extra_lines_may_repeat_a_date():
    account = billing.open_account(now=NOW)

    for description in ("Frigobar", "Lavanderia"):
        billing.post_line(
            account,
            kind=LineKind.EXTRA,
            service_date=MARCH_7,
            unit_amount=Decimal("12.50"),
            description=description,
            posted_by=None,
            now=NOW,
        )

    assert AccountLine.objects.filter(account=account, kind=LineKind.EXTRA).count() == 2


def test_only_one_late_fee_per_account():
    account = billing.open_account(now=NOW)
    billing.post_line(
        account,
        kind=LineKind.LATE_FEE,
        service_date=MARCH_8,
        unit_amount=Decimal("180.00"),
        posted_by=None,
        now=NOW,
    )

    with pytest.raises(IntegrityError) as excinfo, transaction.atomic():
        billing.post_line(
            account,
            kind=LineKind.LATE_FEE,
            service_date=MARCH_8 + timedelta(days=1),
            unit_amount=Decimal("180.00"),
            posted_by=None,
            now=NOW,
        )

    assert "accountline_one_late_fee" in str(excinfo.value)


def test_account_with_payment_is_protected_from_deletion(actor):
    account = billing.open_account(now=NOW)
    daily(account)
    billing.close_account(account, now=NOW)
    billing.register_payment(account, method="PIX", now=NOW, actor=actor)

    with pytest.raises(IntegrityError), transaction.atomic():
        Account.objects.filter(pk=account.pk).delete()
