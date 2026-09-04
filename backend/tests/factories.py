from __future__ import annotations

from datetime import date, datetime, time, timedelta
from decimal import Decimal

import factory
from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import make_password
from django.utils import timezone

from accounts.models import Role
from hotel.models import (
    Guest,
    PricingPolicy,
    Reservation,
    ReservationStatus,
    Room,
    StatementLine,
)
from hotel.services import pricing

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
        checked_in = factory.Trait(
            status=ReservationStatus.CHECKED_IN,
            checked_in_at=factory.LazyAttribute(
                lambda o: local_datetime(o.checkin_date, CHECKIN_TIME)
            ),
            policy=factory.SubFactory(PricingPolicyFactory),
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
            total_daily=factory.LazyAttribute(lambda o: _frozen_bill(o).subtotal_daily),
            total_parking=factory.LazyAttribute(lambda o: _frozen_bill(o).subtotal_parking),
            late_fee=factory.LazyAttribute(lambda o: _frozen_bill(o).late_fee),
            late_fee_base=factory.LazyAttribute(lambda o: _frozen_bill(o).late_fee_base),
            total_amount=factory.LazyAttribute(lambda o: _frozen_bill(o).total),
            with_statement_lines=True,
        )

    guest = factory.SubFactory(GuestFactory)
    # Quarto proprio: sem isto, dois testes no mesmo quarto esbarram no EXCLUDE.
    room = factory.SubFactory(RoomFactory)
    checkin_date = factory.LazyFunction(timezone.localdate)
    checkout_date = factory.LazyAttribute(lambda o: o.checkin_date + timedelta(days=2))
    has_vehicle = False

    @factory.post_generation
    def with_statement_lines(obj, create, extracted, **kwargs):
        if not create or not extracted:
            return
        StatementLine.objects.bulk_create(
            StatementLine(
                reservation=obj,
                date=line.date,
                daily_rate=line.daily_rate,
                parking_fee=line.parking_fee,
            )
            for line in _frozen_bill(obj).lines
        )


def _frozen_bill(obj) -> pricing.Bill:
    return pricing.calculate_bill(
        checkin=local_datetime(obj.checkin_date, CHECKIN_TIME),
        checkout=local_datetime(obj.checkout_date, CHECKOUT_TIME),
        has_vehicle=obj.has_vehicle,
    )
