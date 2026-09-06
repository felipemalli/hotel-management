from datetime import timedelta

import pytest
from django.utils import timezone

from hotel.guests import selectors as guest_selectors
from hotel.reservations import selectors
from hotel.reservations.models import ReservationStatus
from hotel.rooms import selectors as room_selectors
from tests.factories import GuestFactory, ReservationFactory, RoomFactory

pytestmark = pytest.mark.django_db


def test_search_name_fragment():
    """RF3: nome acha por fragmento, com e sem diferenca de caixa (trigram, D5)."""
    ana = GuestFactory(full_name="Ana Souza")
    mariana = GuestFactory(full_name="Mariana Costa")
    bruno = GuestFactory(full_name="Bruno Lima")

    assert set(guest_selectors.search_guests("ana")) == {ana, mariana}
    assert set(guest_selectors.search_guests("SOU")) == {ana}
    assert set(guest_selectors.search_guests("  bruno  ")) == {bruno}
    assert list(guest_selectors.search_guests("inexistente")) == []


def test_search_document_any_format():
    """RF3: documento acha por valor exato em qualquer formatacao (D9)."""
    ana = GuestFactory(full_name="Ana Souza", document="123.456.789-01")
    GuestFactory(full_name="Bruno Lima", document="987.654.321-00")

    for term in ["123.456.789-01", "12345678901", "123 456 789 01"]:
        assert set(guest_selectors.search_guests(term)) == {ana}, term


def test_search_document_by_fragment():
    """D5: fragmento de documento acha -- cifra nao esta mais no caminho."""
    ana = GuestFactory(full_name="Ana Souza", document="123.456.789-01")

    assert set(guest_selectors.search_guests("789")) == {ana}
    assert set(guest_selectors.search_guests("789-01")) == {ana}


def test_search_phone_by_fragment():
    """D5: fragmento de telefone acha, com ou sem mascara no termo."""
    ana = GuestFactory(full_name="Ana Souza", phone="+55 21 98888-7777")

    assert set(guest_selectors.search_guests("98888")) == {ana}
    assert set(guest_selectors.search_guests("888-7777")) == {ana}


def test_search_phone_any_format():
    """RF3: telefone acha por valor exato em qualquer formatacao (D9)."""
    ana = GuestFactory(full_name="Ana Souza", phone="+55 21 98888-7777")
    GuestFactory(full_name="Bruno Lima", phone="+55 11 97777-6666")

    for term in ["+55 21 98888-7777", "5521988887777", "21 98888 7777", "98888"]:
        assert set(guest_selectors.search_guests(term)) == {ana}, term


def test_search_passport_does_not_collide_with_another_passport():
    """D9: normalizacao alfanumerica preserva as letras do passaporte."""
    carla = GuestFactory(full_name="Carla Nunes", document="AB123456")
    GuestFactory(full_name="Davi Rocha", document="CD123456")

    assert set(guest_selectors.search_guests("ab123456")) == {carla}


def test_search_without_term_lists_everyone():
    guests = {GuestFactory(), GuestFactory()}

    assert set(guest_selectors.search_guests()) == guests
    assert set(guest_selectors.search_guests("   ")) == guests


def test_search_term_without_alphanumerics_matches_nothing():
    """Termo so de separadores nao gera predicado de documento/telefone vazio."""
    GuestFactory(full_name="Ana Souza", document="123.456.789-01")

    assert list(guest_selectors.search_guests("()-.")) == []


def test_in_hotel_only_checked_in():
    """RF4: so hospedes com reserva CHECKED_IN."""
    inside = ReservationFactory(checked_in=True).guest
    ReservationFactory()  # PENDING
    ReservationFactory(checked_out=True)
    cancelled = ReservationFactory()
    cancelled.status = ReservationStatus.CANCELLED
    cancelled.save(update_fields=["status"])

    result = list(selectors.guests_in_hotel())

    assert result == [inside]
    active = getattr(result[0], selectors.ACTIVE_RESERVATIONS_ATTR)
    assert len(active) == 1
    assert active[0].status == ReservationStatus.CHECKED_IN


def test_in_hotel_lists_each_guest_once():
    guest = GuestFactory()
    today = timezone.localdate()
    ReservationFactory(guest=guest, checked_in=True)
    ReservationFactory(
        guest=guest,
        checkin_date=today + timedelta(days=10),
        checkout_date=today + timedelta(days=12),
    )

    assert list(selectors.guests_in_hotel()) == [guest]


def test_pending_checkin_lists_pending():
    """RF5: pendentes, inclusive as vencidas (D14)."""
    guest = GuestFactory(full_name="Ana Souza")
    today = timezone.localdate()
    overdue = ReservationFactory(
        guest=guest,
        checkin_date=today - timedelta(days=3),
        checkout_date=today - timedelta(days=1),
    )
    future = ReservationFactory(
        guest=guest,
        checkin_date=today + timedelta(days=5),
        checkout_date=today + timedelta(days=6),
    )
    ReservationFactory(checked_in=True)

    result = list(selectors.guests_pending_checkin())

    assert result == [guest]
    pending = getattr(result[0], selectors.PENDING_RESERVATIONS_ATTR)
    assert {reservation.pk for reservation in pending} == {overdue.pk, future.pk}


def test_in_hotel_composes_with_search():
    """A busca da tela vale nas abas: filtra dentro de quem esta no hotel."""
    ana = GuestFactory(full_name="Ana Souza", document="123.456.789-01")
    ReservationFactory(guest=ana, checked_in=True)
    ReservationFactory(guest=GuestFactory(full_name="Bruno Lima"), checked_in=True)
    GuestFactory(full_name="Ana Prado")  # mesmo nome, sem reserva: a aba manda

    assert list(selectors.guests_in_hotel("ana")) == [ana]
    assert list(selectors.guests_in_hotel("789")) == [ana]
    assert list(selectors.guests_in_hotel("  ")) == list(selectors.guests_in_hotel())


def test_pending_checkin_composes_with_search():
    ana = GuestFactory(full_name="Ana Souza")
    bruno = GuestFactory(full_name="Bruno Lima")
    ReservationFactory(guest=ana)
    ReservationFactory(guest=bruno)

    assert list(selectors.guests_pending_checkin("ana")) == [ana]
    assert list(selectors.guests_pending_checkin("bruno")) == [bruno]


def test_list_reservations_filters_by_status_and_guest():
    checked_in = ReservationFactory(checked_in=True)
    pending = ReservationFactory(guest=checked_in.guest)
    other = ReservationFactory()

    assert set(selectors.list_reservations()) == {checked_in, pending, other}
    assert set(selectors.list_reservations(status=ReservationStatus.PENDING)) == {pending, other}
    assert set(selectors.list_reservations(guest_id=checked_in.guest_id)) == {checked_in, pending}
    assert set(
        selectors.list_reservations(
            status=ReservationStatus.CHECKED_IN, guest_id=checked_in.guest_id
        )
    ) == {checked_in}


def test_list_reservations_filters_by_search():
    """Nº (com/sem '#'), titular ou quarto por fragmento — nunca acompanhante."""
    ana = ReservationFactory(guest__full_name="Ana Souza", room__number="103")
    bruno = ReservationFactory(guest__full_name="Bruno Lima", room__number="102")

    assert set(selectors.list_reservations(search="ana")) == {ana}
    assert set(selectors.list_reservations(search="103")) == {ana}
    assert set(selectors.list_reservations(search=f"#{ana.pk}")) == {ana}
    assert set(selectors.list_reservations(search=str(ana.pk))) == {ana}
    assert set(selectors.list_reservations(search="lima")) == {bruno}
    assert set(selectors.list_reservations(search="inexistente")) == set()


def test_list_rooms_filters_by_search():
    """RF novo: busca por fragmento do número do quarto."""
    room_101 = RoomFactory(number="101")
    room_301 = RoomFactory(number="301")

    assert set(room_selectors.list_rooms(search="101")) == {room_101}
    assert set(room_selectors.list_rooms(search="30")) == {room_301}
    assert set(room_selectors.list_rooms(search="inexistente")) == set()
    assert set(room_selectors.list_rooms()) == {room_101, room_301}
