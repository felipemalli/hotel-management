from datetime import date, datetime, time
from decimal import Decimal
from zoneinfo import ZoneInfo

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext

from hotel.reservations import selectors
from hotel.reservations import services as service
from hotel.reservations.models import ReservationStatus
from tests.factories import GuestFactory, ReservationFactory, RoomFactory, UserFactory

pytestmark = pytest.mark.django_db

SAO_PAULO = ZoneInfo("America/Sao_Paulo")
MARCH_7 = date(2025, 3, 7)
MARCH_9 = date(2025, 3, 9)
MARCH_11 = date(2025, 3, 11)


def local(day: date, hour: int, minute: int = 0) -> datetime:
    return datetime.combine(day, time(hour, minute), tzinfo=SAO_PAULO)


@pytest.fixture
def actor():
    return UserFactory(username="atendente-do-grupo")


def book(*, actor, room=None, companions=(), guest=None, checkin=MARCH_7, checkout=MARCH_9):
    return service.create_reservation(
        guest=guest or GuestFactory(),
        room=room or RoomFactory(capacity=4),
        companions=companions,
        checkin_date=checkin,
        checkout_date=checkout,
        actor=actor,
        today=checkin,
    )


def test_create_reservation_persists_the_companions(actor):
    eva, davi = GuestFactory(), GuestFactory()

    reservation = book(actor=actor, companions=[eva, davi])

    assert set(reservation.companions.all()) == {eva, davi}


def test_create_reservation_rejects_over_capacity(actor):
    room = RoomFactory(number="C01", capacity=2)

    with pytest.raises(service.DomainValidationError) as excinfo:
        book(actor=actor, room=room, companions=[GuestFactory(), GuestFactory()])

    assert "companion_ids" in excinfo.value.extra
    assert "C01" in excinfo.value.extra["companion_ids"][0]
    assert "2" in excinfo.value.extra["companion_ids"][0]


def test_capacity_counts_the_holder(actor):
    """Titular + 1 acompanhante = 2 pessoas: cabe exatamente num quarto de 2."""
    room = RoomFactory(number="C02", capacity=2)

    reservation = book(actor=actor, room=room, companions=[GuestFactory()])

    assert reservation.companions.count() == 1


def test_create_reservation_rejects_holder_as_companion(actor):
    guest = GuestFactory()

    with pytest.raises(service.DomainValidationError) as excinfo:
        book(actor=actor, guest=guest, companions=[guest])

    assert "companion_ids" in excinfo.value.extra


def test_create_reservation_rejects_duplicate_companions(actor):
    eva = GuestFactory()

    with pytest.raises(service.DomainValidationError) as excinfo:
        book(actor=actor, companions=[eva, eva])

    assert "companion_ids" in excinfo.value.extra


def test_create_reservation_is_atomic_across_companions(actor, monkeypatch):
    """Reserva sem acompanhantes gravados consumiria a capacidade em silencio.

    Falha injetada no ponto exato entre as duas escritas: se a gravacao dos
    acompanhantes estivesse FORA da `atomic` da reserva, a reserva
    sobreviveria -- ocupando o quarto para um grupo que nao existe.
    """
    from hotel.reservations.models import Reservation

    def explode(self, *args, **kwargs):
        raise RuntimeError("falha ao gravar acompanhante")

    manager_class = type(ReservationFactory().companions)
    monkeypatch.setattr(manager_class, "set", explode)
    before = Reservation.objects.count()

    with pytest.raises(RuntimeError):
        book(actor=actor, companions=[GuestFactory()])

    assert Reservation.objects.count() == before


def test_checkin_locks_people_in_pk_order_without_join(actor):
    """Tres detalhes do lock, cada um com uma falha real por tras.

    `ORDER BY` porque ordens diferentes entre transacoes dao deadlock; sem
    `JOIN` porque o PostgreSQL recusa `FOR UPDATE` no lado anulavel de um outer
    join (e o ORM gera outer join ao atravessar M2M); e materializado, porque
    queryset preguicoso nunca chega a executar o `FOR UPDATE`.
    """
    reservation = book(actor=actor, companions=[GuestFactory(), GuestFactory()])

    with CaptureQueriesContext(connection) as captured:
        service.check_in(reservation, now=local(MARCH_7, 15), actor=actor)

    locks = [
        query["sql"]
        for query in captured.captured_queries
        if "FOR UPDATE" in query["sql"] and "guests_guest" in query["sql"]
    ]
    assert len(locks) == 1, locks
    assert "ORDER BY" in locks[0]
    assert "JOIN" not in locks[0].upper()


def test_checkin_rejects_companion_already_in_hotel(actor):
    eva = GuestFactory()
    ReservationFactory(checked_in=True).companions.add(eva)
    arriving = book(actor=actor, companions=[eva], checkin=MARCH_9, checkout=MARCH_11)

    with pytest.raises(service.InvalidStatusError) as excinfo:
        service.check_in(arriving, now=local(MARCH_9, 15), actor=actor)

    assert "active_reservation_id" in excinfo.value.extra


def test_checkin_rejects_holder_who_is_companion_elsewhere(actor):
    """A regra vale nos dois sentidos: quem acompanha ja esta hospedado."""
    guest = GuestFactory()
    ReservationFactory(checked_in=True).companions.add(guest)
    own = book(actor=actor, guest=guest, checkin=MARCH_9, checkout=MARCH_11)

    with pytest.raises(service.InvalidStatusError):
        service.check_in(own, now=local(MARCH_9, 15), actor=actor)


def test_bill_ignores_companions(actor):
    """Com dois acompanhantes continua 425,00: preco nao muda com pessoas."""
    reservation = book(
        actor=actor,
        room=RoomFactory(capacity=4),
        companions=[GuestFactory(), GuestFactory()],
    )
    reservation.has_vehicle = True
    reservation.save(update_fields=["has_vehicle"])
    service.check_in(reservation, now=local(MARCH_7, 15), actor=actor)

    bill = service.check_out(reservation, now=local(MARCH_9, 12, 1), actor=actor)

    assert bill.total == Decimal("425.00")
    assert len(bill.lines) == 2


def test_in_hotel_includes_companions_of_checked_in_stay(actor):
    eva = GuestFactory(full_name="Eva Lima")
    holder = GuestFactory(full_name="Bruno Lima")
    reservation = book(actor=actor, guest=holder, companions=[eva])
    service.check_in(reservation, now=local(MARCH_7, 15), actor=actor)

    assert [g.full_name for g in selectors.guests_in_hotel()] == ["Bruno Lima", "Eva Lima"]


def test_in_hotel_lists_person_once(actor):
    """`distinct()`: o OR sobre duas relacoes multivaloradas duplica a linha."""
    eva = GuestFactory(full_name="Eva Lima")
    reservation = book(actor=actor, companions=[eva])
    service.check_in(reservation, now=local(MARCH_7, 15), actor=actor)

    assert selectors.guests_in_hotel().count() == 2


def test_search_in_hotel_matches_companion_by_own_name(actor):
    """O termo casa a pessoa da linha; achar a acompanhante nao exige o titular."""
    eva = GuestFactory(full_name="Eva Lima")
    holder = GuestFactory(full_name="Bruno Lima")
    reservation = book(actor=actor, guest=holder, companions=[eva])
    service.check_in(reservation, now=local(MARCH_7, 15), actor=actor)

    assert [g.full_name for g in selectors.guests_in_hotel("eva")] == ["Eva Lima"]


def test_pending_includes_own_and_companion_reservations(actor):
    """Simetria: se conta como hospedado depois, conta como esperado antes."""
    eva = GuestFactory(full_name="Eva Lima")
    book(actor=actor, guest=GuestFactory(full_name="Bruno Lima"), companions=[eva])

    names = [g.full_name for g in selectors.guests_pending_checkin()]

    assert names == ["Bruno Lima", "Eva Lima"]


def test_pending_merges_own_and_companion_rows_in_date_order(actor):
    """Uma pessoa que e titular numa reserva e acompanhante em outra ve as duas."""
    from hotel.reservations.serializers import GuestPendingCheckinSerializer

    person = GuestFactory(full_name="Dupla Funcao")
    later = book(actor=actor, guest=person, checkin=MARCH_11, checkout=date(2025, 3, 13))
    earlier = book(actor=actor, companions=[person], checkin=MARCH_7, checkout=MARCH_9)

    guest = selectors.guests_pending_checkin().get(pk=person.pk)
    rows = GuestPendingCheckinSerializer(guest).data["pending_reservations"]

    assert [row["id"] for row in rows] == [earlier.pk, later.pk]
    # guest_id e o titular; o front deriva acompanhante de guest_id != id.
    assert rows[0]["guest_id"] != person.pk
    assert rows[1]["guest_id"] == person.pk


def test_statement_does_not_list_companions(actor):
    """O extrato e a conta, e a conta e do titular."""
    from hotel.reservations.serializers import build_statement

    reservation = book(actor=actor, companions=[GuestFactory()])
    service.check_in(reservation, now=local(MARCH_7, 15), actor=actor)
    bill = service.check_out(reservation, now=local(MARCH_9, 11), actor=actor)

    payload = build_statement(reservation, bill)

    assert "companions" not in payload
    assert payload["guest"] == reservation.guest


def test_cancelled_reservation_does_not_list_its_companions(actor):
    eva = GuestFactory()
    reservation = book(actor=actor, companions=[eva])
    service.cancel(reservation, now=local(MARCH_7, 10), actor=actor)

    assert eva not in selectors.guests_pending_checkin()
    assert reservation.status == ReservationStatus.CANCELLED


def test_add_companions_on_pending_reservation(actor):
    eva, davi = GuestFactory(), GuestFactory()
    reservation = book(actor=actor, room=RoomFactory(capacity=4), companions=[eva])

    updated = service.add_companions(reservation, companions=[davi])

    assert set(updated.companions.all()) == {eva, davi}


def test_add_companions_rejects_over_capacity(actor):
    room = RoomFactory(number="C03", capacity=2)
    reservation = book(actor=actor, room=room, companions=[GuestFactory()])

    with pytest.raises(service.DomainValidationError) as excinfo:
        service.add_companions(reservation, companions=[GuestFactory()])

    assert "companion_ids" in excinfo.value.extra
    assert "C03" in excinfo.value.extra["companion_ids"][0]


def test_add_companions_rejects_holder(actor):
    guest = GuestFactory()
    reservation = book(actor=actor, guest=guest)

    with pytest.raises(service.DomainValidationError) as excinfo:
        service.add_companions(reservation, companions=[guest])

    assert "companion_ids" in excinfo.value.extra


def test_add_companions_rejects_already_listed(actor):
    eva = GuestFactory()
    reservation = book(actor=actor, companions=[eva])

    with pytest.raises(service.DomainValidationError) as excinfo:
        service.add_companions(reservation, companions=[eva])

    assert "já é acompanhante" in excinfo.value.extra["companion_ids"][0]


def test_add_companions_rejects_empty_list(actor):
    reservation = book(actor=actor)

    with pytest.raises(service.DomainValidationError) as excinfo:
        service.add_companions(reservation, companions=[])

    assert "companion_ids" in excinfo.value.extra


def test_add_companions_rejects_anything_but_pending(actor):
    eva = GuestFactory()
    reservation = book(actor=actor)
    service.check_in(reservation, now=local(MARCH_7, 15), actor=actor)

    with pytest.raises(service.InvalidStatusError) as excinfo:
        service.add_companions(reservation, companions=[eva])

    assert excinfo.value.extra["status"] == ReservationStatus.CHECKED_IN


def test_remove_companion_from_pending_reservation(actor):
    eva, davi = GuestFactory(), GuestFactory()
    reservation = book(actor=actor, companions=[eva, davi])

    updated = service.remove_companion(reservation, companion_id=eva.pk)

    assert set(updated.companions.all()) == {davi}


def test_remove_companion_rejects_someone_not_listed(actor):
    reservation = book(actor=actor)

    with pytest.raises(service.DomainValidationError) as excinfo:
        service.remove_companion(reservation, companion_id=GuestFactory().pk)

    assert "companion_ids" in excinfo.value.extra


def test_remove_companion_rejects_anything_but_pending(actor):
    eva = GuestFactory()
    reservation = book(actor=actor, companions=[eva])
    service.check_in(reservation, now=local(MARCH_7, 15), actor=actor)

    with pytest.raises(service.InvalidStatusError) as excinfo:
        service.remove_companion(reservation, companion_id=eva.pk)

    assert excinfo.value.extra["status"] == ReservationStatus.CHECKED_IN


def test_add_companions_locks_room_before_reservation(actor):
    """A ordem tem que ser a mesma do check_in: invertida, as duas dao deadlock."""
    reservation = book(actor=actor)

    with CaptureQueriesContext(connection) as captured:
        service.add_companions(reservation, companions=[GuestFactory()])

    locked = [
        table
        for query in captured.captured_queries
        if "FOR UPDATE" in query["sql"]
        for table in ("rooms_room", "reservations_reservation")
        if table in query["sql"]
    ]
    assert locked == ["rooms_room", "reservations_reservation"]
