from __future__ import annotations

from datetime import datetime, time
from decimal import Decimal
from typing import TYPE_CHECKING

from core.errors import DomainValidationError
from hotel.billing import engine
from hotel.models import PricingPolicy

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
