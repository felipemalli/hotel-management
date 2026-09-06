from __future__ import annotations

from datetime import date, datetime, time, timedelta
from decimal import Decimal

import factory
from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import make_password
from django.utils import timezone

from accounts.models import Role
from hotel.billing import engine as pricing
from hotel.billing import services as billing
from hotel.billing.models import Account, LineKind, PricingPolicy
from hotel.guests.models import Guest
from hotel.reservations.models import Reservation, ReservationStatus
from hotel.rooms.models import Room

CHECKIN_TIME = time(15, 0)
CHECKOUT_TIME = time(11, 0)

DEFAULT_PASSWORD = "senha-de-teste-123"


def local_datetime(day: date, at: time) -> datetime:
    return timezone.make_aware(datetime.combine(day, at), timezone.get_current_timezone())


class UserFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = get_user_model()
        django_get_or_create = ("username",)

    class Params:
        admin = factory.Trait(role=Role.ADMIN)

    username = factory.Sequence(lambda n: f"atendente{n}")
    # Hash no INSERT. PostGenerationMethodCall + skip_postgeneration_save
    # roda set_password em memoria e nunca grava: authenticate() devolve None.
    password = factory.LazyFunction(lambda: make_password(DEFAULT_PASSWORD))


class RoomFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Room

    number = factory.Sequence(lambda n: f"1{n:03d}")
    capacity = 2
    is_active = True


class PricingPolicyFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = PricingPolicy
        django_get_or_create = ("effective_from",)

    weekday_rate = Decimal("120.00")
    weekend_rate = Decimal("180.00")
    weekday_park = Decimal("15.00")
    weekend_park = Decimal("20.00")
    late_fee_factor = Decimal("0.5")
    checkin_opens = time(14, 0)
    checkout_limit = time(12, 0)
    effective_from = factory.LazyFunction(timezone.now)


class AccountFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Account

    opened_at = factory.LazyFunction(timezone.now)


class GuestFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Guest

    full_name = factory.Sequence(lambda n: f"Hospede Teste {n}")
    document = factory.Sequence(lambda n: f"{n:011d}")
    phone = factory.Sequence(lambda n: f"+55 21 9{n:04d}{n:04d}")
    nationality = "BR"


class ReservationFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Reservation
        skip_postgeneration_save = True

    class Params:
        # resv_account_matches_status: hospede dentro do hotel tem conta aberta.
        checked_in = factory.Trait(
            status=ReservationStatus.CHECKED_IN,
            checked_in_at=factory.LazyAttribute(
                lambda o: local_datetime(o.checkin_date, CHECKIN_TIME)
            ),
            policy=factory.SubFactory(PricingPolicyFactory),
            account=factory.LazyAttribute(
                lambda o: billing.open_account(now=local_datetime(o.checkin_date, CHECKIN_TIME))
            ),
        )
        checked_out = factory.Trait(
            status=ReservationStatus.CHECKED_OUT,
            policy=factory.SubFactory(PricingPolicyFactory),
            checked_in_at=factory.LazyAttribute(
                lambda o: local_datetime(o.checkin_date, CHECKIN_TIME)
            ),
            checked_out_at=factory.LazyAttribute(
                lambda o: local_datetime(o.checkout_date, CHECKOUT_TIME)
            ),
            account=factory.LazyAttribute(lambda o: _frozen_account(o)),
        )

    guest = factory.SubFactory(GuestFactory)
    # Quarto proprio: sem isto, dois testes no mesmo quarto esbarram no EXCLUDE.
    room = factory.SubFactory(RoomFactory)
    checkin_date = factory.LazyFunction(timezone.localdate)
    checkout_date = factory.LazyAttribute(lambda o: o.checkin_date + timedelta(days=2))
    has_vehicle = False


def _frozen_bill(obj) -> pricing.Bill:
    return pricing.calculate_bill(
        checkin_day=obj.checkin_date,
        checkout_day=obj.checkout_date,
        checkout_time=CHECKOUT_TIME,
        booked_checkout_day=obj.checkout_date,
        has_vehicle=obj.has_vehicle,
    )


def _frozen_account(obj) -> Account:
    """Percorre o mesmo caminho do checkout: abre, lanca as linhas e fecha."""
    closed_at = local_datetime(obj.checkout_date, CHECKOUT_TIME)
    bill = _frozen_bill(obj)
    account = billing.open_account(now=local_datetime(obj.checkin_date, CHECKIN_TIME))

    lines = [
        billing.LineInput(
            kind=LineKind.DAILY,
            service_date=line.date,
            unit_amount=line.daily_rate,
            description=line.weekday_label,
        )
        for line in bill.lines
    ]
    lines += [
        billing.LineInput(
            kind=LineKind.PARKING,
            service_date=line.date,
            unit_amount=line.parking_fee,
            description="vaga de estacionamento",
        )
        for line in bill.lines
        if line.parking_fee
    ]
    if bill.late_fee_applied:
        lines.append(
            billing.LineInput(
                kind=LineKind.LATE_FEE,
                service_date=obj.checkout_date,
                unit_amount=bill.late_fee_base,
                quantity=pricing.DEFAULT_RATES.late_fee_factor,
            )
        )

    billing.post_lines(account, lines, posted_by=None, now=closed_at)
    return billing.close_account(account, now=closed_at)
