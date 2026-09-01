"""
Camada de leitura (SPEC 4.3, 6.1). Precisa de PG (trigram + hashes).

Os nomes desta suite sao normativos: matriz de rastreabilidade SPEC 6.3
(RF3, RF4, RF5).
"""

from datetime import timedelta

import pytest
from django.utils import timezone

from hotel import selectors
from hotel.models import ReservationStatus
from tests.factories import GuestFactory, ReservationFactory

pytestmark = pytest.mark.django_db


def test_search_name_fragment():
    """RF3: nome acha por fragmento, com e sem diferenca de caixa (trigram, D5)."""
    ana = GuestFactory(full_name="Ana Souza")
    mariana = GuestFactory(full_name="Mariana Costa")
    bruno = GuestFactory(full_name="Bruno Lima")

    assert set(selectors.search_guests("ana")) == {ana, mariana}
    assert set(selectors.search_guests("SOU")) == {ana}
    assert set(selectors.search_guests("  bruno  ")) == {bruno}
    assert list(selectors.search_guests("inexistente")) == []


def test_search_document_any_format():
    """RF3: documento acha por valor exato em qualquer formatacao (D9)."""
    ana = GuestFactory(full_name="Ana Souza", document="123.456.789-01")
    GuestFactory(full_name="Bruno Lima", document="987.654.321-00")

    for term in ["123.456.789-01", "12345678901", "123 456 789 01"]:
        assert set(selectors.search_guests(term)) == {ana}, term


def test_search_document_does_not_match_a_fragment():
    """Trade-off assumido em D5: cifra em repouso custa a busca parcial de PII."""
    GuestFactory(full_name="Ana Souza", document="123.456.789-01")

    assert list(selectors.search_guests("789")) == []


def test_search_phone_any_format():
    """RF3: telefone acha por valor exato em qualquer formatacao (D9)."""
    ana = GuestFactory(full_name="Ana Souza", phone="(21) 98888-7777")
    GuestFactory(full_name="Bruno Lima", phone="(11) 97777-6666")

    for term in ["(21) 98888-7777", "21988887777", "21 98888 7777"]:
        assert set(selectors.search_guests(term)) == {ana}, term


def test_search_passport_does_not_collide_with_another_passport():
    """D9: normalizacao alfanumerica preserva as letras do passaporte."""
    carla = GuestFactory(full_name="Carla Nunes", document="AB123456")
    GuestFactory(full_name="Davi Rocha", document="CD123456")

    assert set(selectors.search_guests("ab123456")) == {carla}


def test_search_without_term_lists_everyone():
    guests = {GuestFactory(), GuestFactory()}

    assert set(selectors.search_guests()) == guests
    assert set(selectors.search_guests("   ")) == guests


def test_search_term_without_alphanumerics_matches_nothing():
    """Termo so de separadores nao gera blind index de valor vazio."""
    GuestFactory(full_name="Ana Souza", document="123.456.789-01")

    assert list(selectors.search_guests("()-.")) == []


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
    # A constraint SPEC 1.5 garante exatamente uma reserva ativa por hospede.
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
