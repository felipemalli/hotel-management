from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

import pytest
from django.db import IntegrityError, transaction
from django.utils import timezone

from hotel.models import Reservation, ReservationStatus, Room
from hotel.reservations import selectors
from hotel.reservations import services as service
from hotel.rooms import services as catalog
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
    return UserFactory(username="atendente-dos-quartos")


def book(room, *, actor, checkin=MARCH_7, checkout=MARCH_9, today=MARCH_7, **kwargs):
    return service.create_reservation(
        guest=GuestFactory(),
        room=room,
        checkin_date=checkin,
        checkout_date=checkout,
        actor=actor,
        today=today,
        **kwargs,
    )


def test_room_overlap_rejected_by_exclusion():
    """`resv_room_no_overlap` e a autoridade da agenda, sem passar por servico."""
    room = RoomFactory()
    ReservationFactory(room=room, checkin_date=MARCH_7, checkout_date=MARCH_9)

    with pytest.raises(IntegrityError), transaction.atomic():
        ReservationFactory(room=room, checkin_date=date(2025, 3, 8), checkout_date=MARCH_11)


def test_adjacent_stays_in_same_room_are_allowed():
    """Sai dia 09, entra dia 09: `[)` deixa passar -- mesma semantica de D1."""
    room = RoomFactory()
    ReservationFactory(room=room, checkin_date=MARCH_7, checkout_date=MARCH_9)

    ReservationFactory(room=room, checkin_date=MARCH_9, checkout_date=MARCH_11)

    assert Reservation.objects.filter(room=room).count() == 2


@pytest.mark.parametrize(
    "trait",
    [{"status": ReservationStatus.CANCELLED}, {"checked_out": True}],
    ids=["cancelled", "checked_out"],
)
def test_cancelled_and_checked_out_release_the_room(trait):
    """A exclusao so olha PENDING/CHECKED_IN: encerrada libera a agenda."""
    room = RoomFactory()
    ReservationFactory(room=room, checkin_date=MARCH_7, checkout_date=MARCH_9, **trait)

    ReservationFactory(room=room, checkin_date=MARCH_7, checkout_date=MARCH_9)

    assert Reservation.objects.filter(room=room).count() == 2


def test_one_checked_in_per_room_constraint():
    """O FATO fisico: a agenda pode ter liberado, o quarto nao (D6/D7/D14)."""
    room = RoomFactory()
    ReservationFactory(room=room, checkin_date=MARCH_7, checkout_date=MARCH_9, checked_in=True)

    with pytest.raises(IntegrityError), transaction.atomic():
        ReservationFactory(
            room=room, checkin_date=MARCH_11, checkout_date=date(2025, 3, 13), checked_in=True
        )


def test_room_number_is_unique():
    RoomFactory(number="101")

    with pytest.raises(IntegrityError), transaction.atomic():
        Room.objects.create(number="101", capacity=2)


def test_room_capacity_must_be_positive():
    with pytest.raises(IntegrityError), transaction.atomic():
        Room.objects.create(number="000", capacity=0)


def test_room_with_reservations_is_protected_from_deletion():
    reservation = ReservationFactory()

    with pytest.raises(IntegrityError), transaction.atomic():
        reservation.room.delete()


def test_create_reservation_raises_room_unavailable_with_conflict_id(actor):
    room = RoomFactory()
    existing = book(room, actor=actor)

    with pytest.raises(service.RoomUnavailableError) as excinfo:
        book(room, actor=actor, checkin=date(2025, 3, 8), checkout=MARCH_11)

    assert excinfo.value.code == "ROOM_UNAVAILABLE"
    assert excinfo.value.status_code == 409
    assert excinfo.value.extra == {
        "room_id": room.pk,
        "conflicting_reservation_id": existing.pk,
        "conflicting_status": ReservationStatus.PENDING,
        "conflicting_checkin_date": MARCH_7.isoformat(),
    }
    assert Reservation.objects.filter(room=room).count() == 1


def test_room_unavailable_race_is_translated_from_constraint(actor, monkeypatch):
    """Neutralizada a guarda, o `EXCLUDE` decide -- e sai 409, nunca 500.

    Reproduz a corrida entre dois atendentes reservando o mesmo quarto ao mesmo
    tempo: os dois passam pela leitura previa e so o banco resolve. Sem a
    traducao por nome dentro do savepoint, o `IntegrityError` escaparia cru e o
    handler devolveria 500 com corpo HTML.
    """
    room = RoomFactory()
    book(room, actor=actor)
    monkeypatch.setattr(service, "_assert_room_free", lambda *a, **k: None)

    with pytest.raises(service.RoomUnavailableError) as excinfo:
        book(room, actor=actor, checkin=date(2025, 3, 8), checkout=MARCH_11)

    assert excinfo.value.extra["room_id"] == room.pk
    assert Reservation.objects.filter(room=room).count() == 1


def test_create_reservation_rejects_inactive_room(actor):
    """Estado do recurso, nao forma: o quarto existe, so nao esta em operacao."""
    room = RoomFactory(is_active=False)

    with pytest.raises(service.DomainValidationError) as excinfo:
        book(room, actor=actor)

    assert "room_id" in excinfo.value.extra
    assert not Reservation.objects.exists()


def test_overdue_pending_holds_the_room_until_cancelled(actor):
    """D14 complementada: pendencia vencida RETEM o quarto ate o cancel.

    O sistema nao muda estado sem gesto humano, e a consequencia e que o quarto
    fica preso. Ou o atendente cancela, ou faz o check-in.
    """
    room = RoomFactory()
    overdue = ReservationFactory(room=room, checkin_date=MARCH_7, checkout_date=MARCH_9)

    with pytest.raises(service.RoomUnavailableError):
        book(room, actor=actor, checkin=date(2025, 3, 8), checkout=MARCH_11)

    service.cancel(overdue, now=local(MARCH_9, 10), actor=actor)

    assert book(room, actor=actor, checkin=date(2025, 3, 8), checkout=MARCH_11).pk


def test_checkin_blocked_while_room_still_occupied(actor):
    """OVERSTAY: o anterior nao saiu, mesmo com a agenda ja liberada."""
    room = RoomFactory()
    ReservationFactory(room=room, checkin_date=MARCH_7, checkout_date=MARCH_9, checked_in=True)
    arriving = ReservationFactory(room=room, checkin_date=MARCH_9, checkout_date=MARCH_11)

    with pytest.raises(service.RoomUnavailableError) as excinfo:
        service.check_in(arriving, now=local(MARCH_9, 15), actor=actor)

    assert excinfo.value.code == "ROOM_UNAVAILABLE"
    assert excinfo.value.extra["room_id"] == room.pk


def test_early_arrival_cannot_take_a_room_promised_to_another_pending(actor):
    """D7 complementada: chegar antes segue permitido, salvo se toma o quarto.

    A reserva de 09->11 aparece no balcao no dia 07 e quer entrar ja. Sem a
    guarda, ela ocuparia o quarto que esta prometido a outra reserva de 07->09
    -- e o `EXCLUDE` nao pega, porque olha as datas AGENDADAS, que nao se
    cruzam.
    """
    room = RoomFactory()
    promised = ReservationFactory(room=room, checkin_date=MARCH_7, checkout_date=MARCH_9)
    early = ReservationFactory(room=room, checkin_date=MARCH_9, checkout_date=MARCH_11)

    with pytest.raises(service.RoomUnavailableError) as excinfo:
        service.check_in(early, now=local(MARCH_7, 15), actor=actor)

    assert excinfo.value.extra["conflicting_reservation_id"] == promised.pk


def test_early_arrival_is_allowed_when_the_room_is_free(actor):
    """A guarda e estreita: sem quarto prometido, D7 continua valendo."""
    room = RoomFactory()
    early = ReservationFactory(room=room, checkin_date=MARCH_9, checkout_date=MARCH_11)

    returned = service.check_in(early, now=local(MARCH_7, 15), actor=actor)

    assert returned.status == ReservationStatus.CHECKED_IN


def test_available_rooms_excludes_overlapping_undersized_and_overstayed():
    free = RoomFactory(number="201", capacity=2)
    booked = RoomFactory(number="202", capacity=2)
    small = RoomFactory(number="203", capacity=1)
    inactive = RoomFactory(number="204", capacity=4, is_active=False)
    overstayed = RoomFactory(number="205", capacity=2)

    ReservationFactory(room=booked, checkin_date=MARCH_7, checkout_date=MARCH_9)
    ReservationFactory(
        room=overstayed,
        checkin_date=date(2025, 3, 1),
        checkout_date=date(2025, 3, 3),
        checked_in=True,
    )

    rooms = selectors.available_rooms(
        checkin_date=MARCH_7, checkout_date=MARCH_9, people=2, today=MARCH_7
    )

    assert list(rooms) == [free]
    assert booked not in rooms
    assert small not in rooms
    assert inactive not in rooms
    assert overstayed not in rooms


def test_available_rooms_ignores_cancelled_overlap_on_same_room():
    room = RoomFactory(number="301")
    ReservationFactory(
        room=room,
        checkin_date=MARCH_7,
        checkout_date=MARCH_9,
        status=ReservationStatus.CANCELLED,
    )

    rooms = selectors.available_rooms(
        checkin_date=MARCH_7, checkout_date=MARCH_9, people=1, today=MARCH_7
    )

    assert room in rooms


def test_available_rooms_ignores_overstay_for_a_future_period():
    """Overstay so tira o quarto quando o periodo COMECA hoje ou antes."""
    room = RoomFactory(number="302")
    ReservationFactory(
        room=room,
        checkin_date=date(2025, 3, 1),
        checkout_date=date(2025, 3, 3),
        checked_in=True,
    )

    future = selectors.available_rooms(
        checkin_date=MARCH_11, checkout_date=date(2025, 3, 13), people=1, today=MARCH_7
    )

    assert room in future


def test_create_room_rejects_a_duplicate_number():
    catalog.create_room(number="401", capacity=2)

    with pytest.raises(catalog.DuplicateRoomNumberError) as excinfo:
        catalog.create_room(number="401", capacity=3)

    assert excinfo.value.status_code == 400
    assert "number" in excinfo.value.extra


def test_update_room_refuses_to_deactivate_a_room_in_use():
    reservation = ReservationFactory()

    with pytest.raises(catalog.RoomInUseError) as excinfo:
        catalog.update_room(reservation.room, is_active=False)

    assert excinfo.value.code == "INVALID_STATUS"
    reservation.room.refresh_from_db()
    assert reservation.room.is_active is True


def test_update_room_deactivates_a_free_room():
    room = RoomFactory()

    catalog.update_room(room, is_active=False)

    room.refresh_from_db()
    assert room.is_active is False


def test_update_room_changes_capacity():
    room = RoomFactory(capacity=2)

    catalog.update_room(room, capacity=4)

    room.refresh_from_db()
    assert room.capacity == 4


def test_seed_dates_do_not_collide_in_the_same_room():
    """Regressao do seed: as fichas usam quartos distintos de proposito."""
    today = timezone.localdate()
    room = RoomFactory()
    ReservationFactory(room=room, checkin_date=today, checkout_date=today + timedelta(days=2))

    with pytest.raises(IntegrityError), transaction.atomic():
        ReservationFactory(room=room, checkin_date=today, checkout_date=today + timedelta(days=1))
