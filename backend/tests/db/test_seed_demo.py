"""
Contrato entre o dominio (B) e o seed de demonstracao (A, SPEC 8.2/A).

O seed e a cadeia de subida do compose: se a interface do dominio divergir
dele, `docker compose up` quebra antes de qualquer teste de API. Este modulo
e o alarme antecipado disso -- e, de passagem, prova as promessas do seed:
datas relativas (R4), idempotencia e um extrato de fim de semana com multa.
"""

from decimal import Decimal
from io import StringIO

import pytest
from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.utils import timezone

from hotel import selectors
from hotel.models import Guest, Reservation, ReservationStatus

pytestmark = pytest.mark.django_db


def run_seed() -> str:
    out = StringIO()
    call_command("seed_demo", stdout=out)
    return out.getvalue()


def test_seed_populates_the_three_tabs():
    run_seed()

    assert get_user_model().objects.filter(username="atendente").exists()
    assert [guest.full_name for guest in selectors.guests_pending_checkin()] == ["Ana Souza"]
    assert [guest.full_name for guest in selectors.guests_in_hotel()] == ["Bruno Lima"]
    assert selectors.search_guests("Davi").count() == 1


def test_seed_freezes_a_weekend_statement_with_a_late_fee():
    """Cenario da Carla: sex->dom com vaga e saida 12:01 = caso T7 (425,00)."""
    run_seed()

    carla = Reservation.objects.get(
        guest__full_name="Carla Nunes", status=ReservationStatus.CHECKED_OUT
    )

    assert carla.total_daily == Decimal("300.00")
    assert carla.total_parking == Decimal("35.00")
    assert carla.late_fee == Decimal("90.00")
    assert carla.total_amount == Decimal("425.00")
    assert carla.checked_out_at < timezone.now()


def test_seed_is_idempotent():
    run_seed()
    guests, reservations = Guest.objects.count(), Reservation.objects.count()
    statuses = dict(Reservation.objects.values_list("pk", "status"))

    run_seed()

    assert Guest.objects.count() == guests
    assert Reservation.objects.count() == reservations
    assert dict(Reservation.objects.values_list("pk", "status")) == statuses


def test_seed_never_logs_pii():
    """SPEC 2.2: log nao contem documento nem telefone."""
    output = run_seed()

    assert "123.456.789-01" not in output
    assert "98888-7777" not in output
