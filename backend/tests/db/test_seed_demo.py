from datetime import date, timedelta
from decimal import Decimal
from io import StringIO
from unittest import mock

import pytest
from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.utils import timezone
from freezegun import freeze_time

from accounts.models import Role
from hotel.billing.models import AccountStatus, PaymentMethod
from hotel.guests import selectors as guest_selectors
from hotel.guests import services as guests_service
from hotel.guests.models import Guest
from hotel.reservations import selectors
from hotel.reservations import services as reservations_service
from hotel.reservations.models import Reservation, ReservationStatus
from hotel.rooms.models import Room

pytestmark = pytest.mark.django_db


def run_seed() -> str:
    out = StringIO()
    call_command("seed_demo", stdout=out)
    return out.getvalue()


def test_seed_populates_the_three_tabs():
    run_seed()

    assert get_user_model().objects.filter(username="atendente").exists()
    # Acompanhante entra na aba pelo proprio nome: Eva com Bruno, os Castro com Helena.
    assert {guest.full_name for guest in selectors.guests_pending_checkin()} == {
        "Ana Souza",
        "Fernanda Torres",
        "Gustavo Pinto",
        "Helena Castro",
        "Bento Castro",
        "Clara Castro",
        "Paula Antunes",
        "Igor Salles",
    }
    assert {guest.full_name for guest in selectors.guests_in_hotel()} == {
        "Nadia Ferraz",
        "Larissa Ferraz",
        "Theo Ferraz",
        "Otavio Bastos",
        "Bruno Lima",
        "Eva Lima",
        "Marcos Vieira",
    }
    assert guest_selectors.search_guests("Davi").count() == 1


def test_seed_covers_every_reservation_status():
    run_seed()

    counts = {
        status: Reservation.objects.filter(status=status).count() for status in ReservationStatus
    }
    assert counts == {
        ReservationStatus.PENDING: 6,
        ReservationStatus.CHECKED_IN: 4,
        ReservationStatus.CHECKED_OUT: 5,
        ReservationStatus.CANCELLED: 1,
    }


def test_seed_spreads_the_calendar_around_today():
    """As telas se leem pela data de hoje: cada vizinhanca dela precisa de ficha.

    Sem isto o cenario cabe num unico dia e a demo nao mostra saida do dia,
    chegada de amanha, reserva atrasada nem hospede que passou do previsto.
    """
    run_seed()

    today = timezone.localdate()
    in_hotel = Reservation.objects.filter(status=ReservationStatus.CHECKED_IN)
    pending = Reservation.objects.filter(status=ReservationStatus.PENDING)

    assert in_hotel.filter(checkout_date=today).exists(), "ninguem sai hoje"
    assert in_hotel.filter(checkout_date__gt=today).exists(), "ninguem sai depois de hoje"
    assert in_hotel.filter(checkout_date__lt=today).exists(), "ninguem passou do previsto"

    assert pending.filter(checkin_date=today).exists(), "ninguem chega hoje"
    assert pending.filter(checkin_date__lt=today).exists(), "nenhuma chegada atrasada"
    assert pending.filter(checkin_date=today + timedelta(days=1)).exists(), "ninguem chega amanha"
    assert pending.filter(checkin_date__gt=today + timedelta(days=7)).exists(), "nada distante"

    departures = {
        timezone.localdate(checked_out_at)
        for checked_out_at in Reservation.objects.filter(
            status=ReservationStatus.CHECKED_OUT
        ).values_list("checked_out_at", flat=True)
    }
    assert {today - timedelta(days=1), today - timedelta(days=2)} <= departures


def test_seed_freezes_a_weekend_statement_with_a_late_fee():
    """Cenario da Carla: sex->dom com vaga e saida 12:01 = 425,00."""
    run_seed()

    carla = Reservation.objects.get(
        guest__full_name="Carla Nunes", status=ReservationStatus.CHECKED_OUT
    )

    assert carla.account.total_amount == Decimal("425.00")
    statement = reservations_service.statement(carla)
    assert statement.subtotal_daily == Decimal("300.00")
    assert statement.subtotal_parking == Decimal("35.00")
    assert statement.late_fee == Decimal("90.00")
    assert carla.checked_out_at < timezone.now()


def test_seed_leaves_paid_and_open_accounts_in_every_method():
    """A aba de reservas filtra por pagamento: os dois lados precisam existir."""
    run_seed()

    checked_out = Reservation.objects.filter(status=ReservationStatus.CHECKED_OUT)
    assert {
        reservation.account.payment.method
        for reservation in checked_out.select_related("account__payment")
        if reservation.account.status == AccountStatus.PAID
    } == {PaymentMethod.CASH, PaymentMethod.CARD, PaymentMethod.PIX}
    assert checked_out.filter(account__status=AccountStatus.CLOSED).count() == 2


def test_seed_gives_a_returning_guest_two_stays():
    """Uma estadia encerrada e uma reserva futura na mesma ficha de hospede."""
    run_seed()

    paula = Guest.objects.get(full_name="Paula Antunes")
    assert list(paula.reservations.order_by("id").values_list("status", flat=True)) == [
        ReservationStatus.CHECKED_OUT,
        ReservationStatus.PENDING,
    ]


def test_seed_keeps_a_room_out_of_service_and_one_free():
    run_seed()

    assert list(Room.objects.filter(is_active=False).values_list("number", flat=True)) == ["302"]
    assert Room.objects.filter(is_active=True).count() >= 10
    # O fluxo de recepcao (e o e2e) precisa de quarto livre para hoje: o
    # cenario nao pode lotar o hotel.
    today = timezone.localdate()
    assert selectors.available_rooms(
        checkin_date=today, checkout_date=today + timedelta(days=1), people=1, today=today
    ).exists()


def test_seed_writes_through_the_services():
    """Nenhuma linha do cenario nasce por `Model.objects.create` no comando.

    O seed afirma no proprio docstring que passa pelos services, e por muito
    tempo isso valia apenas para as transicoes: hospede e reserva eram gravados
    direto no ORM, contornando as validacoes de servico. Como o seed esta na
    cadeia de subida do compose, ele e o primeiro cliente do dominio a rodar --
    se ele pode driblar a camada de mutacao, a afirmacao "toda escrita passa
    por servico" e falsa na pratica.
    """
    created_guests: list[str] = []
    created_reservations: list[date] = []

    real_create_guest = guests_service.create_guest
    real_create_reservation = reservations_service.create_reservation

    def spy_create_guest(**kwargs):
        created_guests.append(kwargs["full_name"])
        return real_create_guest(**kwargs)

    def spy_create_reservation(**kwargs):
        created_reservations.append(kwargs["checkin_date"])
        return real_create_reservation(**kwargs)

    with (
        mock.patch.object(guests_service, "create_guest", spy_create_guest),
        mock.patch.object(reservations_service, "create_reservation", spy_create_reservation),
    ):
        run_seed()

    assert created_guests == [
        "Sofia Marques",
        "Tiago Alves",
        "Ricardo Mattos",
        "Carla Nunes",
        "Paula Antunes",
        "Nadia Ferraz",
        "Larissa Ferraz",
        "Theo Ferraz",
        "Otavio Bastos",
        "Bruno Lima",
        "Eva Lima",
        "Marcos Vieira",
        "Ana Souza",
        "Fernanda Torres",
        "Gustavo Pinto",
        "Helena Castro",
        "Bento Castro",
        "Clara Castro",
        "Igor Salles",
        "Julia Prado",
        "Davi Rocha",
        "Ursula Klein",
    ]
    assert Guest.objects.count() == len(created_guests)
    assert len(created_reservations) == Reservation.objects.count()
    # today=checkin: as fichas passadas existem e o servico recusa agendamento no passado.
    assert min(created_reservations) < timezone.localdate()


def test_seed_guests_have_country_code():
    """O seed passa por `create_guest`, logo obedece a mesma regra da API.

    Um seed com telefone sem DDI seria um seed que a propria API recusaria
    reproduzir -- e, como ele roda na cadeia de subida do compose, a demo
    subiria com dado que o sistema declara invalido.
    """
    run_seed()

    phones = list(Guest.objects.values_list("phone", flat=True))
    assert phones, "o seed nao criou hospede nenhum"
    # Eva e argentina: o DDI nao e 55.
    assert all(phone.isdigit() and len(phone) >= 10 for phone in phones), phones
    assert any(phone.startswith("54") for phone in phones), phones
    assert not any("+" in phone for phone in phones)
    assert {"AR", "BR", "DE", "ES", "FR", "IT", "PT", "US"} <= set(
        Guest.objects.values_list("nationality", flat=True)
    )


def test_seed_is_idempotent():
    run_seed()
    guests, reservations = Guest.objects.count(), Reservation.objects.count()
    statuses = dict(Reservation.objects.values_list("pk", "status"))

    run_seed()

    assert Guest.objects.count() == guests
    assert Reservation.objects.count() == reservations
    assert dict(Reservation.objects.values_list("pk", "status")) == statuses


def test_seed_creates_admin_role_without_staff_flag():
    """A credencial de demo do papel ADMIN nasce sem as flags do Django.

    O papel do produto e a coluna `role`. `is_superuser` e o que importa aqui:
    ele curto-circuita `IsHotelAdmin`, entao uma credencial de demo com senha
    publicada nao pode carrega-lo.
    """
    run_seed()

    admin = get_user_model().objects.get(username="admin")
    assert admin.role == Role.ADMIN
    assert admin.is_staff is False
    assert admin.is_superuser is False
    assert admin.check_password("admin123")
    attendant = get_user_model().objects.get(username="atendente")
    assert attendant.role == Role.ATTENDANT
    assert not get_user_model().objects.filter(is_staff=True).exists()


def test_seed_never_logs_pii():
    output = run_seed()

    assert "123.456.789-01" not in output
    assert "98888-7777" not in output
    for document, phone in Guest.objects.values_list("document", "phone"):
        assert document not in output
        assert phone not in output


def test_seed_demotes_an_existing_privileged_attendant():
    """A correcao precisa alcancar banco ja provisionado.

    `get_or_create` nao toca em linha existente, entao um banco que subiu o
    compose antes da correcao guardaria para sempre um superusuario com a senha
    publicada no README -- e superusuario passa por `IsHotelAdmin` sem ter o papel.
    """
    user_model = get_user_model()
    user_model.objects.create_user(
        username="atendente", password="atendente123", is_staff=True, is_superuser=True
    )

    call_command("seed_demo")

    attendant = user_model.objects.get(username="atendente")
    assert attendant.is_staff is False
    assert attendant.is_superuser is False
    assert attendant.check_password("atendente123")


def test_seed_is_idempotent_across_dates():
    """Reexecucao em data POSTERIOR nao pode abortar o comando.

    As datas do cenario derivam de `localdate()`. Chaveado por data, o seed
    criava reserva nova a cada dia e o `check_in` do Bruno batia na invariante
    de uma estadia ativa por hospede: o comando abortava, e como ele esta na
    cadeia de subida do compose, o gunicorn nunca subia. Um `docker compose up`
    no dia seguinte (sem `-v`) derrubava a API.
    """
    with freeze_time("2026-09-01 10:00:00-03:00"):
        call_command("seed_demo", stdout=StringIO())

    guests_after_first = Guest.objects.count()
    reservations_after_first = Reservation.objects.count()

    with freeze_time("2026-09-03 10:00:00-03:00"):
        call_command("seed_demo", stdout=StringIO())

    assert Guest.objects.count() == guests_after_first
    assert Reservation.objects.count() == reservations_after_first
    assert Reservation.objects.filter(status=ReservationStatus.PENDING).exists()
    assert Reservation.objects.filter(status=ReservationStatus.CHECKED_IN).exists()
    assert Reservation.objects.filter(status=ReservationStatus.CHECKED_OUT).exists()
    assert Reservation.objects.filter(status=ReservationStatus.CANCELLED).exists()


@pytest.mark.parametrize(
    "frozen",
    ["2026-09-07", "2026-09-08", "2026-09-09", "2026-09-10", "2026-09-11", "2026-09-12"],
)
def test_seed_runs_on_every_weekday(frozen):
    """A ficha da Carla ancora no ultimo domingo, nao num deslocamento fixo.

    Dependendo do dia da semana ela cai dentro da janela de outra ficha, e uma
    colisao de quarto abortaria o comando -- que esta na cadeia de subida do
    compose.
    """
    with freeze_time(f"{frozen} 10:00:00-03:00"):
        run_seed()

    assert Reservation.objects.filter(status=ReservationStatus.CHECKED_OUT).count() == 5
    assert Reservation.objects.filter(status=ReservationStatus.CHECKED_IN).count() == 4
