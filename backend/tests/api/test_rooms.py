from datetime import timedelta

import pytest
from django.utils import timezone

from hotel.models import ReservationStatus, Room
from tests.factories import GuestFactory, ReservationFactory, RoomFactory

pytestmark = pytest.mark.django_db

ROOMS_URL = "/api/rooms/"
AVAILABLE_URL = "/api/rooms/available/"


def test_rooms_post_requires_admin_403(auth_client):
    response = auth_client.post(ROOMS_URL, {"number": "301", "capacity": 3}, format="json")

    assert response.status_code == 403
    assert response.data["code"] == "PERMISSION_DENIED"
    assert not Room.objects.filter(number="301").exists()


def test_admin_creates_room_201(admin_client):
    response = admin_client.post(ROOMS_URL, {"number": "301", "capacity": 3}, format="json")

    assert response.status_code == 201
    assert response.data == {
        "id": response.data["id"],
        "number": "301",
        "capacity": 3,
        "is_active": True,
        "created_at": response.data["created_at"],
    }


def test_create_room_rejects_zero_capacity_400(admin_client):
    response = admin_client.post(ROOMS_URL, {"number": "302", "capacity": 0}, format="json")

    assert response.status_code == 400
    assert "capacity" in response.data["extra"]


def test_create_room_rejects_a_duplicate_number_400(admin_client):
    RoomFactory(number="303")

    response = admin_client.post(ROOMS_URL, {"number": "303", "capacity": 2}, format="json")

    assert response.status_code == 400
    assert response.data["code"] == "VALIDATION_ERROR"
    assert "number" in response.data["extra"]


def test_patch_room_requires_admin_403(auth_client):
    room = RoomFactory()

    response = auth_client.patch(f"{ROOMS_URL}{room.pk}/", {"capacity": 4}, format="json")

    assert response.status_code == 403


def test_admin_deactivates_a_free_room(admin_client):
    room = RoomFactory()

    response = admin_client.patch(f"{ROOMS_URL}{room.pk}/", {"is_active": False}, format="json")

    assert response.status_code == 200
    assert response.data["is_active"] is False


def test_deactivating_a_room_in_use_returns_409(admin_client):
    reservation = ReservationFactory()

    response = admin_client.patch(
        f"{ROOMS_URL}{reservation.room_id}/", {"is_active": False}, format="json"
    )

    assert response.status_code == 409
    assert response.data["code"] == "INVALID_STATUS"


def test_rooms_have_no_delete(admin_client):
    """`PROTECT` + histórico: quarto sai de operação, não some."""
    room = RoomFactory()

    assert admin_client.delete(f"{ROOMS_URL}{room.pk}/").status_code == 405


def test_list_hides_inactive_rooms_by_default(auth_client):
    active = RoomFactory(number="401")
    RoomFactory(number="402", is_active=False)

    default = auth_client.get(ROOMS_URL).data["results"]
    including = auth_client.get(ROOMS_URL, {"is_active": "false"}).data["results"]

    assert [row["number"] for row in default] == [active.number]
    assert {row["number"] for row in including} == {"401", "402"}


def test_available_rooms_endpoint(auth_client):
    today = timezone.localdate()
    free = RoomFactory(number="501", capacity=2)
    booked = RoomFactory(number="502", capacity=2)
    ReservationFactory(room=booked, checkin_date=today, checkout_date=today + timedelta(days=3))

    response = auth_client.get(
        AVAILABLE_URL,
        {
            "checkin_date": str(today + timedelta(days=1)),
            "checkout_date": str(today + timedelta(days=2)),
            "people": 2,
        },
    )

    assert response.status_code == 200
    assert [row["number"] for row in response.data["results"]] == [free.number]


def test_available_rooms_rejects_an_inverted_interval(auth_client):
    """FORMA, não D13: `daterange(fim, inicio)` levantaria `DataError` no PG."""
    today = timezone.localdate()

    response = auth_client.get(
        AVAILABLE_URL,
        {"checkin_date": str(today + timedelta(days=2)), "checkout_date": str(today)},
    )

    assert response.status_code == 400
    assert "checkout_date" in response.data["extra"]


def test_available_rooms_requires_the_dates(auth_client):
    response = auth_client.get(AVAILABLE_URL)

    assert response.status_code == 400
    assert set(response.data["extra"]) == {"checkin_date", "checkout_date"}


def test_room_routes_require_authentication(api_client):
    for url in (ROOMS_URL, AVAILABLE_URL):
        assert api_client.get(url).status_code == 401, url


def test_create_reservation_requires_room(auth_client):
    guest = GuestFactory()
    today = timezone.localdate()

    response = auth_client.post(
        "/api/reservations/",
        {
            "guest_id": guest.pk,
            "checkin_date": str(today),
            "checkout_date": str(today + timedelta(days=2)),
        },
        format="json",
    )

    assert response.status_code == 400
    assert "room_id" in response.data["extra"]


def test_create_reservation_on_a_busy_room_returns_409(auth_client):
    today = timezone.localdate()
    room = RoomFactory()
    existing = ReservationFactory(
        room=room, checkin_date=today, checkout_date=today + timedelta(days=3)
    )

    response = auth_client.post(
        "/api/reservations/",
        {
            "guest_id": GuestFactory().pk,
            "room_id": room.pk,
            "checkin_date": str(today + timedelta(days=1)),
            "checkout_date": str(today + timedelta(days=2)),
        },
        format="json",
    )

    assert response.status_code == 409
    assert response.data["code"] == "ROOM_UNAVAILABLE"
    assert response.data["extra"]["conflicting_reservation_id"] == existing.pk
    assert response.data["extra"]["conflicting_status"] == ReservationStatus.PENDING


def test_create_reservation_on_an_inactive_room_returns_400(auth_client):
    today = timezone.localdate()
    room = RoomFactory(is_active=False)

    response = auth_client.post(
        "/api/reservations/",
        {
            "guest_id": GuestFactory().pk,
            "room_id": room.pk,
            "checkin_date": str(today),
            "checkout_date": str(today + timedelta(days=2)),
        },
        format="json",
    )

    assert response.status_code == 400
    assert "room_id" in response.data["extra"]


def test_create_reservation_rejects_an_unknown_room(auth_client):
    today = timezone.localdate()

    response = auth_client.post(
        "/api/reservations/",
        {
            "guest_id": GuestFactory().pk,
            "room_id": 999999,
            "checkin_date": str(today),
            "checkout_date": str(today + timedelta(days=2)),
        },
        format="json",
    )

    assert response.status_code == 400
    assert "room_id" in response.data["extra"]
