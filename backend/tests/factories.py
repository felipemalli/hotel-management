"""
Fabricas de teste (SPEC 6.1).

`ReservationFactory` tem os traits `checked_in` e `checked_out`. O trait
`checked_out` congela os totais com o PROPRIO motor (`pricing`), nunca com
numeros digitados a mao: fixture que recalcula dinheiro por conta propria
mente sobre o sistema.
"""

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
    StatementLine,
)
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

    class Params:
        # `is_staff` fica FALSO tambem no admin do hotel: o papel e do produto,
        # e `is_staff` significa "entra no /admin/" -- caminho de escrita que o
        # dominio recusa. O teste que confunde os dois passa por acidente.
        admin = factory.Trait(role=Role.ADMIN)

    username = factory.Sequence(lambda n: f"atendente{n}")
    # O hash entra no proprio INSERT. Com PostGenerationMethodCall e
    # skip_postgeneration_save, set_password roda em memoria e nunca e salvo:
    # authenticate() devolve None e todo login via factory falha.
    password = factory.LazyFunction(lambda: make_password(DEFAULT_PASSWORD))


class PricingPolicyFactory(factory.django.DjangoModelFactory):
    """Politica de tarifa. Por padrao, os valores do briefing.

    `django_get_or_create=("effective_from",)` porque a linha de bootstrap ja
    existe (data migration + fixture autouse): sem isso, cada chamada com a
    vigencia sentinela criaria uma politica duplicada e a resolucao por
    `(-effective_from, -id)` passaria a devolver a copia -- teste verde
    provando a coisa errada.
    """

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
    # 11 digitos unicos: `Guest.save()` normaliza a partir daqui.
    document = factory.Sequence(lambda n: f"{n:011d}")
    # Com DDI: a fabrica escreve pelo ORM, que nao valida o telefone (a
    # autoridade e `create_guest`). Um literal sem `+55` aqui produziria uma
    # base de teste que a API nao aceitaria criar -- fixture mentindo sobre o
    # sistema.
    phone = factory.Sequence(lambda n: f"+55 21 9{n:04d}{n:04d}")
    nationality = "BR"


class ReservationFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Reservation
        # O hook `with_statement_lines` grava em OUTRA tabela; um `save()`
        # automatico da reserva depois dele seria uma escrita a mais, e com
        # `update_fields` ausente reescreveria a linha inteira.
        skip_postgeneration_save = True

    class Params:
        # `policy` nos dois traits: a constraint `resv_active_has_policy`
        # recusa reserva CHECKED_IN/CHECKED_OUT sem politica, porque sem ela
        # `statement()` nao saberia com que tarifa a conta foi fechada.
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
    checkin_date = factory.LazyFunction(timezone.localdate)
    checkout_date = factory.LazyAttribute(lambda o: o.checkin_date + timedelta(days=2))
    has_vehicle = False

    @factory.post_generation
    def with_statement_lines(obj, create, extracted, **kwargs):
        """Linhas do extrato para o trait `checked_out`.

        `post_generation` e nao `LazyAttribute` porque as linhas sao outra
        tabela e precisam do pk da reserva. Os valores vem do PROPRIO motor
        (`_frozen_bill`), nunca digitados: fixture que recalcula dinheiro por
        conta propria mente sobre o sistema.
        """
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
    """Extrato do trait `checked_out`, calculado pelo motor de verdade."""
    return pricing.calculate_bill(
        checkin=local_datetime(obj.checkin_date, CHECKIN_TIME),
        checkout=local_datetime(obj.checkout_date, CHECKOUT_TIME),
        has_vehicle=obj.has_vehicle,
    )
