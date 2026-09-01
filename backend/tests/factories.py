"""
Fabricas de teste (SPEC 6.1).

`ReservationFactory` tem os traits `checked_in` e `checked_out`. O trait
`checked_out` congela os totais com o PROPRIO motor (`pricing`), nunca com
numeros digitados a mao: fixture que recalcula dinheiro por conta propria
mente sobre o sistema.
"""

from __future__ import annotations

from datetime import date, datetime, time, timedelta

import factory
from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import make_password
from django.utils import timezone

from hotel.models import Guest, Reservation, ReservationStatus
from hotel.services import pricing

CHECKIN_TIME = time(15, 0)
CHECKOUT_TIME = time(11, 0)

DEFAULT_PASSWORD = "senha-de-teste-123"


def local_datetime(day: date, at: time) -> datetime:
    """Datetime ciente em America/Sao_Paulo -- o fuso das regras (SPEC 0.3)."""
    return timezone.make_aware(datetime.combine(day, at), timezone.get_current_timezone())


class UserFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = get_user_model()
        django_get_or_create = ("username",)

    username = factory.Sequence(lambda n: f"atendente{n}")
    # O hash entra no proprio INSERT. Com PostGenerationMethodCall e
    # skip_postgeneration_save, set_password roda em memoria e nunca e salvo:
    # authenticate() devolve None e todo login via factory falha.
    password = factory.LazyFunction(lambda: make_password(DEFAULT_PASSWORD))


class GuestFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Guest

    full_name = factory.Sequence(lambda n: f"Hospede Teste {n}")
    # 11 digitos unicos: `Guest.save()` derruba os hashes a partir daqui.
    document = factory.Sequence(lambda n: f"{n:011d}")
    phone = factory.Sequence(lambda n: f"(21) 9{n:04d}-{n:04d}")


class ReservationFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Reservation

    class Params:
        checked_in = factory.Trait(
            status=ReservationStatus.CHECKED_IN,
            checked_in_at=factory.LazyAttribute(
                lambda o: local_datetime(o.checkin_date, CHECKIN_TIME)
            ),
        )
        checked_out = factory.Trait(
            status=ReservationStatus.CHECKED_OUT,
            checked_in_at=factory.LazyAttribute(
                lambda o: local_datetime(o.checkin_date, CHECKIN_TIME)
            ),
            checked_out_at=factory.LazyAttribute(
                lambda o: local_datetime(o.checkout_date, CHECKOUT_TIME)
            ),
            total_daily=factory.LazyAttribute(lambda o: _frozen_bill(o).subtotal_daily),
            total_parking=factory.LazyAttribute(lambda o: _frozen_bill(o).subtotal_parking),
            late_fee=factory.LazyAttribute(lambda o: _frozen_bill(o).late_fee),
            total_amount=factory.LazyAttribute(lambda o: _frozen_bill(o).total),
        )

    guest = factory.SubFactory(GuestFactory)
    checkin_date = factory.LazyFunction(timezone.localdate)
    checkout_date = factory.LazyAttribute(lambda o: o.checkin_date + timedelta(days=2))
    has_vehicle = False


def _frozen_bill(obj) -> pricing.Bill:
    """Extrato do trait `checked_out`, calculado pelo motor de verdade."""
    return pricing.calculate_bill(
        checkin=local_datetime(obj.checkin_date, CHECKIN_TIME),
        checkout=local_datetime(obj.checkout_date, CHECKOUT_TIME),
        has_vehicle=obj.has_vehicle,
    )
