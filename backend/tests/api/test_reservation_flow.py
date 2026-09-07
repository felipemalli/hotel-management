from datetime import date, timedelta
from decimal import Decimal

import pytest
from django.utils import timezone
from freezegun import freeze_time

from hotel.reservations.models import Reservation, ReservationStatus
from tests.api.conftest import local
from tests.factories import GuestFactory, ReservationFactory, RoomFactory

pytestmark = pytest.mark.django_db

MARCH_7 = date(2025, 3, 7)  # sexta
MARCH_9 = date(2025, 3, 9)  # domingo

# Extrato da estadia sex 07/03 15:00 -> dom 09/03 12:01, com vaga.
T7_LINES = [
    {
        "date": "2025-03-07",
        "weekday": "sexta-feira",
        "daily_rate": "120.00",
        "parking_fee": "15.00",
    },
    {
        "date": "2025-03-08",
        "weekday": "sábado",
        "daily_rate": "180.00",
        "parking_fee": "20.00",
    },
]


def t7_reservation() -> Reservation:
    """Reserva agendada sex 07/03 -> dom 09/03, com vaga, ainda PENDING."""
    return ReservationFactory(checkin_date=MARCH_7, checkout_date=MARCH_9, has_vehicle=True)


def checkin_url(reservation: Reservation) -> str:
    return f"/api/reservations/{reservation.pk}/check-in/"


def checkout_url(reservation: Reservation) -> str:
    return f"/api/reservations/{reservation.pk}/checkout/"


def cancel_url(reservation: Reservation) -> str:
    return f"/api/reservations/{reservation.pk}/cancel/"


def companions_url(reservation: Reservation) -> str:
    return f"/api/reservations/{reservation.pk}/companions/"


def detail_url(reservation: Reservation) -> str:
    return f"/api/reservations/{reservation.pk}/"


def statement_url(reservation: Reservation) -> str:
    return f"/api/reservations/{reservation.pk}/statement/"


def test_create_reservation_persists_pending(auth_client):
    """Reserva nasce PENDING e sem conta."""
    guest = GuestFactory()
    today = timezone.localdate()

    response = auth_client.post(
        "/api/reservations/",
        {
            "guest_id": guest.pk,
            "room_id": RoomFactory().pk,
            "checkin_date": str(today + timedelta(days=4)),
            "checkout_date": str(today + timedelta(days=7)),
            "has_vehicle": True,
        },
        format="json",
    )

    assert response.status_code == 201
    assert response.data["status"] == ReservationStatus.PENDING
    assert response.data["guest_id"] == guest.pk
    assert response.data["has_vehicle"] is True
    assert response.data["checked_in_at"] is None
    assert response.data["checked_out_at"] is None
    assert response.data["account"] is None

    stored = Reservation.objects.get(pk=response.data["id"])
    assert stored.guest_id == guest.pk
    assert stored.status == ReservationStatus.PENDING


def test_create_reservation_in_the_past_returns_400(auth_client):
    """Reserva e compromisso futuro."""
    guest = GuestFactory()
    today = timezone.localdate()

    response = auth_client.post(
        "/api/reservations/",
        {
            "guest_id": guest.pk,
            "room_id": RoomFactory().pk,
            "checkin_date": str(today - timedelta(days=1)),
            "checkout_date": str(today + timedelta(days=1)),
        },
        format="json",
    )

    assert response.status_code == 400
    assert response.data["code"] == "VALIDATION_ERROR"
    assert "checkin_date" in response.data["extra"]
    assert not Reservation.objects.exists()


def test_create_reservation_requires_one_night(auth_client):
    """Agendamento exige no minimo 1 noite -- day-use so existe como fato."""
    guest = GuestFactory()
    today = timezone.localdate()

    response = auth_client.post(
        "/api/reservations/",
        {
            "guest_id": guest.pk,
            "room_id": RoomFactory().pk,
            "checkin_date": str(today),
            "checkout_date": str(today),
        },
        format="json",
    )

    assert response.status_code == 400
    assert response.data["code"] == "VALIDATION_ERROR"
    assert "checkout_date" in response.data["extra"]


def test_create_reservation_requires_existing_guest(auth_client):
    today = timezone.localdate()

    response = auth_client.post(
        "/api/reservations/",
        {
            "guest_id": 999999,
            "room_id": RoomFactory().pk,
            "checkin_date": str(today),
            "checkout_date": str(today + timedelta(days=1)),
        },
        format="json",
    )

    assert response.status_code == 400
    assert response.data["code"] == "VALIDATION_ERROR"
    assert "guest_id" in response.data["extra"]


def test_checkin_after_14_succeeds(auth_client):
    """14:00:00 em ponto NAO e cedo."""
    reservation = t7_reservation()

    with freeze_time(local(MARCH_7, 14, 0, 0)):
        response = auth_client.post(checkin_url(reservation), {}, format="json")

    assert response.status_code == 200
    assert response.data["status"] == ReservationStatus.CHECKED_IN
    assert response.data["checked_in_at"] == "2025-03-07T14:00:00-03:00"
    reservation.refresh_from_db()
    assert reservation.status == ReservationStatus.CHECKED_IN


def test_checkin_before_14_returns_409_and_override(auth_client):
    reservation = t7_reservation()

    with freeze_time(local(MARCH_7, 13, 59, 59)):
        blocked = auth_client.post(checkin_url(reservation), {"allow_early": False}, format="json")

        assert blocked.status_code == 409
        assert blocked.data == {
            "code": "EARLY_CHECKIN",
            "detail": "Check-in permitido a partir das 14:00.",
            "extra": {"server_time": "13:59", "opens_at": "14:00"},
        }
        reservation.refresh_from_db()
        assert reservation.status == ReservationStatus.PENDING
        assert reservation.checked_in_at is None

        confirmed = auth_client.post(checkin_url(reservation), {"allow_early": True}, format="json")

    assert confirmed.status_code == 200
    assert confirmed.data["status"] == ReservationStatus.CHECKED_IN
    assert confirmed.data["checked_in_at"] == "2025-03-07T13:59:59-03:00"


def test_checkin_twice_returns_invalid_status(auth_client):
    reservation = t7_reservation()

    with freeze_time(local(MARCH_7, 15, 0)):
        assert auth_client.post(checkin_url(reservation), {}, format="json").status_code == 200
        response = auth_client.post(checkin_url(reservation), {}, format="json")

    assert response.status_code == 409
    assert response.data["code"] == "INVALID_STATUS"
    assert response.data["extra"] == {"status": ReservationStatus.CHECKED_IN}


def test_checkin_on_cancelled_returns_invalid_status(auth_client):
    reservation = ReservationFactory(
        checkin_date=MARCH_7, checkout_date=MARCH_9, status=ReservationStatus.CANCELLED
    )

    with freeze_time(local(MARCH_7, 15, 0)):
        response = auth_client.post(checkin_url(reservation), {}, format="json")

    assert response.status_code == 409
    assert response.data["code"] == "INVALID_STATUS"


def test_checkout_freezes_totals(auth_client):
    """Os totais ficam congelados na linha, mesmo que a tarifa mude depois."""
    reservation = t7_reservation()

    with freeze_time(local(MARCH_7, 15, 0)):
        auth_client.post(checkin_url(reservation), {}, format="json")
    with freeze_time(local(MARCH_9, 12, 1)):
        response = auth_client.post(checkout_url(reservation), format="json")

    assert response.status_code == 200
    stored = Reservation.objects.get(pk=reservation.pk)
    assert stored.status == ReservationStatus.CHECKED_OUT
    assert stored.account.status == "CLOSED"
    assert stored.account.total_amount == Decimal("425.00")
    assert stored.checked_out_at is not None
    assert response.data["subtotal_daily"] == "300.00"
    assert response.data["subtotal_parking"] == "35.00"
    assert response.data["late_fee"]["amount"] == "90.00"


def test_checkout_statement_matches_T7(auth_client):
    """O extrato inteiro bate, campo a campo, com a estadia sex->dom com vaga e multa."""
    reservation = t7_reservation()

    with freeze_time(local(MARCH_7, 15, 0)):
        auth_client.post(checkin_url(reservation), {}, format="json")
    with freeze_time(local(MARCH_9, 12, 1)):
        response = auth_client.post(checkout_url(reservation), format="json")

    assert response.status_code == 200
    assert response.data == {
        "reservation_id": reservation.pk,
        "guest": {"id": reservation.guest_id, "full_name": reservation.guest.full_name},
        "checked_in_at": "2025-03-07T15:00:00-03:00",
        "checked_out_at": "2025-03-09T12:01:00-03:00",
        "lines": T7_LINES,
        "subtotal_daily": "300.00",
        "subtotal_parking": "35.00",
        "late_fee": {
            "applied": True,
            "amount": "90.00",
            "days": [
                {
                    "date": "2025-03-09",
                    "weekday": "domingo",
                    "base_rate": "180.00",
                    "amount": "90.00",
                }
            ],
        },
        "total": "425.00",
        "payment": None,
    }


def test_statement_reissues_the_exact_checkout_receipt(auth_client):
    """2a via: mesmo recibo do checkout, recomputado dos fatos.

    Se um dia a tarifa mudar por baixo, este assert e o que acusa a
    divergencia entre o extrato reemitido e o que o hospede pagou.
    """
    reservation = t7_reservation()

    with freeze_time(local(MARCH_7, 15, 0)):
        auth_client.post(checkin_url(reservation), {}, format="json")
    with freeze_time(local(MARCH_9, 12, 1)):
        checkout = auth_client.post(checkout_url(reservation), format="json")

    reissued = auth_client.get(statement_url(reservation))

    assert reissued.status_code == 200
    assert reissued.data == checkout.data
    assert reissued.data["total"] == "425.00"


def test_statement_before_checkout_returns_invalid_status(auth_client):
    """Extrato so existe depois do checkout -- 409 no envelope, nunca 404 HTML."""
    reservation = ReservationFactory(checked_in=True)

    response = auth_client.get(statement_url(reservation))

    assert response.status_code == 409
    assert response.data["code"] == "INVALID_STATUS"


def test_reservation_detail_returns_the_full_object(auth_client):
    # Datas fixas: o trait checked_out usa "hoje" e o total mudaria com o weekday.
    reservation = ReservationFactory(checked_out=True, checkin_date=MARCH_7, checkout_date=MARCH_9)

    response = auth_client.get(detail_url(reservation))

    assert response.status_code == 200
    assert response.data["id"] == reservation.pk
    assert response.data["status"] == ReservationStatus.CHECKED_OUT
    assert response.data["account"]["status"] == "CLOSED"
    assert response.data["account"]["total_amount"] == "300.00"
    assert response.data["account"]["payment"] is None


def test_checkout_at_noon_has_no_late_fee(auth_client):
    """12:00:00 em ponto e isento -- `late_fee.applied` sai `false`."""
    reservation = ReservationFactory(checkin_date=MARCH_7, checkout_date=MARCH_9)

    with freeze_time(local(MARCH_7, 15, 0)):
        auth_client.post(checkin_url(reservation), {}, format="json")
    with freeze_time(local(MARCH_9, 12, 0, 0)):
        response = auth_client.post(checkout_url(reservation), format="json")

    assert response.status_code == 200
    assert response.data["late_fee"] == {
        "applied": False,
        "amount": "0.00",
        "days": [],
    }
    assert response.data["total"] == "300.00"


def test_double_checkout_returns_invalid_status(auth_client):
    """Duplo checkout e conflito -- o dinheiro nao recalcula."""
    reservation = t7_reservation()

    with freeze_time(local(MARCH_7, 15, 0)):
        auth_client.post(checkin_url(reservation), {}, format="json")
    with freeze_time(local(MARCH_9, 12, 1)):
        assert auth_client.post(checkout_url(reservation), format="json").status_code == 200
        response = auth_client.post(checkout_url(reservation), format="json")

    assert response.status_code == 409
    assert response.data["code"] == "INVALID_STATUS"
    assert Reservation.objects.get(pk=reservation.pk).account.total_amount == Decimal("425.00")


def test_checkout_without_checkin_returns_invalid_status(auth_client):
    reservation = t7_reservation()

    with freeze_time(local(MARCH_9, 12, 1)):
        response = auth_client.post(checkout_url(reservation), format="json")

    assert response.status_code == 409
    assert response.data["code"] == "INVALID_STATUS"


def test_cancel_pending_reservation(auth_client):
    """`PENDING -> CANCELLED` e a unica transicao de cancelamento."""
    reservation = t7_reservation()

    response = auth_client.post(cancel_url(reservation), format="json")

    assert response.status_code == 200
    assert response.data["status"] == ReservationStatus.CANCELLED
    assert Reservation.objects.get(pk=reservation.pk).status == ReservationStatus.CANCELLED


def test_cancel_checked_in_returns_invalid_status(auth_client):
    """Hospede no hotel nao cancela -- exigiria politica de estorno inexistente."""
    reservation = t7_reservation()

    with freeze_time(local(MARCH_7, 15, 0)):
        auth_client.post(checkin_url(reservation), {}, format="json")
    response = auth_client.post(cancel_url(reservation), format="json")

    assert response.status_code == 409
    assert response.data["code"] == "INVALID_STATUS"


def test_list_reservations_filters_by_status_and_guest(auth_client):
    guest = GuestFactory()
    pending = ReservationFactory(guest=guest, checkin_date=MARCH_7, checkout_date=MARCH_9)
    cancelled = ReservationFactory(
        guest=guest,
        checkin_date=MARCH_7,
        checkout_date=MARCH_9,
        status=ReservationStatus.CANCELLED,
    )
    other = ReservationFactory(checkin_date=MARCH_7, checkout_date=MARCH_9)

    def ids(params: dict) -> set[int]:
        results = auth_client.get("/api/reservations/", params).data["results"]
        return {item["id"] for item in results}

    assert ids({}) == {pending.pk, cancelled.pk, other.pk}
    assert ids({"status": "PENDING"}) == {pending.pk, other.pk}
    assert ids({"guest": guest.pk}) == {pending.pk, cancelled.pk}
    assert ids({"status": "CANCELLED", "guest": guest.pk}) == {cancelled.pk}


def test_list_reservations_filters_by_search(auth_client):
    """Nº (com/sem '#'), titular ou quarto por fragmento (feature nova, sem SPEC)."""
    ana = ReservationFactory(guest__full_name="Ana Souza", room__number="103")
    bruno = ReservationFactory(guest__full_name="Bruno Lima", room__number="102")

    def ids(params: dict) -> set[int]:
        results = auth_client.get("/api/reservations/", params).data["results"]
        return {item["id"] for item in results}

    assert ids({"search": "ana"}) == {ana.pk}
    assert ids({"search": "103"}) == {ana.pk}
    assert ids({"search": f"#{ana.pk}"}) == {ana.pk}
    assert ids({"search": "lima"}) == {bruno.pk}
    assert ids({"search": "inexistente"}) == set()


def test_list_reservations_filters_by_stay_dates(auth_client):
    arriving = ReservationFactory(checkin_date=MARCH_7, checkout_date=MARCH_9)
    leaving = ReservationFactory(checkin_date=MARCH_9, checkout_date=MARCH_7 + timedelta(days=7))

    def ids(params: dict) -> set[int]:
        results = auth_client.get("/api/reservations/", params).data["results"]
        return {item["id"] for item in results}

    assert ids({"checkin_date": MARCH_7.isoformat()}) == {arriving.pk}
    assert ids({"checkout_date": MARCH_9.isoformat()}) == {arriving.pk}
    assert ids({"checkin_date": MARCH_9.isoformat()}) == {leaving.pk}
    assert ids({"checkin_date": MARCH_7.isoformat(), "checkout_date": MARCH_7.isoformat()}) == set()


def test_list_reservations_orders_by_stay_dates(auth_client):
    early = ReservationFactory(checkin_date=MARCH_7, checkout_date=MARCH_7 + timedelta(days=10))
    late = ReservationFactory(checkin_date=MARCH_9, checkout_date=MARCH_9 + timedelta(days=1))

    def ids(ordering: str) -> list[int]:
        results = auth_client.get("/api/reservations/", {"ordering": ordering}).data["results"]
        return [item["id"] for item in results]

    assert ids("checkin_date") == [early.pk, late.pk]
    assert ids("-checkin_date") == [late.pk, early.pk]
    assert ids("checkout_date") == [late.pk, early.pk]
    assert ids("-checkout_date") == [early.pk, late.pk]


def test_list_reservations_breaks_date_ties_by_id(auth_client):
    """Sem ordem total, a mesma linha reaparece (ou some) ao virar a pagina."""
    first, second, third = (
        ReservationFactory(checkin_date=MARCH_7, checkout_date=MARCH_9) for _ in range(3)
    )
    response = auth_client.get("/api/reservations/", {"ordering": "-checkin_date"})

    assert [item["id"] for item in response.data["results"]] == [first.pk, second.pk, third.pk]


@pytest.mark.parametrize(
    ("params", "field"),
    [
        ({"status": "SLEEPING"}, "status"),
        ({"guest": "abc"}, "guest"),
        ({"ordering": "guest"}, "ordering"),
        ({"checkin_date": "ontem"}, "checkin_date"),
        ({"checkout_date": "31/12/2026"}, "checkout_date"),
    ],
)
def test_list_reservations_rejects_bad_filters(auth_client, params, field):
    response = auth_client.get("/api/reservations/", params)

    assert response.status_code == 400
    assert response.data["code"] == "VALIDATION_ERROR"
    assert field in response.data["extra"]


def test_reservation_not_found_returns_envelope(auth_client):
    response = auth_client.post("/api/reservations/999999/check-in/", {}, format="json")

    assert response.status_code == 404
    assert response.data["code"] == "NOT_FOUND"


def test_checkin_with_active_stay_returns_invalid_status_not_500(auth_client):
    """Regressao: hospede com estadia ativa devolvia HTTP 500 com corpo HTML.

    A constraint `resv_one_active_per_guest` e entre linhas; sem checagem no
    service ela chegava ao handler como IntegrityError, que o envelope de erro
    nao classifica. O caminho e alcancavel pela UI: duas reservas PENDING do
    mesmo hospede, check-in nas duas.
    """
    first = t7_reservation()
    second = ReservationFactory(
        guest=first.guest,
        checkin_date=date(2025, 3, 10),
        checkout_date=date(2025, 3, 12),
    )

    with freeze_time(local(MARCH_7, 15, 0)):
        assert auth_client.post(checkin_url(first), {}, format="json").status_code == 200
    with freeze_time(local(date(2025, 3, 10), 15, 0)):
        response = auth_client.post(checkin_url(second), {}, format="json")

    assert response.status_code == 409
    assert response.data["code"] == "INVALID_STATUS"
    assert response.data["extra"]["active_reservation_id"] == first.pk
    second.refresh_from_db()
    assert second.status == ReservationStatus.PENDING


def pay_url(reservation) -> str:
    return f"/api/reservations/{reservation.pk}/pay/"


def _checked_out_t7(auth_client):
    reservation = t7_reservation()
    with freeze_time(local(MARCH_7, 15, 0)):
        auth_client.post(checkin_url(reservation), {}, format="json")
    with freeze_time(local(MARCH_9, 12, 1)):
        auth_client.post(checkout_url(reservation), format="json")
    return reservation


def test_pay_returns_statement_with_payment(auth_client, attendant):
    reservation = _checked_out_t7(auth_client)

    with freeze_time(local(MARCH_9, 12, 30)):
        response = auth_client.post(pay_url(reservation), {"payment_method": "PIX"}, format="json")

    assert response.status_code == 200
    assert response.data["total"] == "425.00"
    assert response.data["lines"] == T7_LINES
    assert response.data["payment"] == {
        "paid_at": "2025-03-09T12:30:00-03:00",
        "method": "PIX",
        "received_by": {"id": attendant.pk, "username": attendant.username},
    }


def test_statement_reissued_after_payment_shows_it(auth_client):
    reservation = _checked_out_t7(auth_client)
    with freeze_time(local(MARCH_9, 12, 30)):
        paid = auth_client.post(pay_url(reservation), {"payment_method": "CASH"}, format="json")

    reissued = auth_client.get(statement_url(reservation))

    assert reissued.status_code == 200
    assert reissued.data == paid.data


def test_checkin_response_carries_an_open_account(auth_client, attendant):
    reservation = t7_reservation()

    with freeze_time(local(MARCH_7, 15, 0)):
        response = auth_client.post(checkin_url(reservation), {}, format="json")

    assert response.status_code == 200
    assert response.data["account"]["status"] == "OPEN"
    assert response.data["account"]["total_amount"] is None
    assert response.data["account"]["payment"] is None

    with freeze_time(local(MARCH_9, 12, 1)):
        auth_client.post(checkout_url(reservation), format="json")
    with freeze_time(local(MARCH_9, 12, 30)):
        auth_client.post(pay_url(reservation), {"payment_method": "PIX"}, format="json")

    detail = auth_client.get(detail_url(reservation))
    assert detail.data["account"]["status"] == "PAID"
    assert detail.data["account"]["payment"] == {
        "paid_at": "2025-03-09T12:30:00-03:00",
        "method": "PIX",
        "received_by": {"id": attendant.pk, "username": attendant.username},
    }


def test_pay_twice_returns_409(auth_client):
    reservation = _checked_out_t7(auth_client)
    with freeze_time(local(MARCH_9, 12, 30)):
        auth_client.post(pay_url(reservation), {"payment_method": "PIX"}, format="json")

    response = auth_client.post(pay_url(reservation), {"payment_method": "CARD"}, format="json")

    assert response.status_code == 409
    assert response.data["code"] == "INVALID_STATUS"
    assert response.data["extra"]["paid_at"] == "2025-03-09T12:30:00-03:00"


def test_pay_before_checkout_returns_409(auth_client):
    reservation = ReservationFactory(checked_in=True)

    response = auth_client.post(pay_url(reservation), {"payment_method": "PIX"}, format="json")

    assert response.status_code == 409
    assert response.data["code"] == "INVALID_STATUS"


def test_pay_rejects_an_unknown_payment_method(auth_client):
    reservation = _checked_out_t7(auth_client)

    response = auth_client.post(pay_url(reservation), {"payment_method": "BITCOIN"}, format="json")

    assert response.status_code == 400
    assert "payment_method" in response.data["extra"]


def test_list_reservations_filters_by_paid(auth_client):
    paid_one = _checked_out_t7(auth_client)
    with freeze_time(local(MARCH_9, 12, 30)):
        auth_client.post(pay_url(paid_one), {"payment_method": "PIX"}, format="json")
    open_one = ReservationFactory(checked_out=True, checkin_date=MARCH_7, checkout_date=MARCH_9)

    def ids(params) -> list[int]:
        rows = auth_client.get("/api/reservations/", params).data["results"]
        return sorted(row["id"] for row in rows)

    assert ids({"paid": "true"}) == [paid_one.pk]
    assert ids({"paid": "false"}) == [open_one.pk]
    assert ids({}) == sorted([paid_one.pk, open_one.pk])


def test_list_reservations_rejects_an_invalid_status_filter(auth_client):
    response = auth_client.get("/api/reservations/", {"status": "INEXISTENTE"})

    assert response.status_code == 400
    assert response.data["code"] == "VALIDATION_ERROR"
    assert "status" in response.data["extra"]


def test_list_reservations_rejects_a_non_numeric_guest_filter(auth_client):
    response = auth_client.get("/api/reservations/", {"guest": "abc"})

    assert response.status_code == 400
    assert "guest" in response.data["extra"]


def test_reservation_list_does_not_grow_queries_with_rows(auth_client, django_assert_num_queries):
    """N+1 na listagem: 7 relacoes por linha vira 140 idas ao banco em 20 linhas.

    O numero exato importa menos que a INVARIANCIA: a mesma contagem com 1 e
    com 3 reservas prova que `select_related` esta fazendo o trabalho.
    """
    ReservationFactory(checked_out=True, checkin_date=MARCH_7, checkout_date=MARCH_9)
    with django_assert_num_queries(3) as captured:
        auth_client.get("/api/reservations/")

    for _ in range(2):
        ReservationFactory(checked_out=True, checkin_date=MARCH_7, checkout_date=MARCH_9)

    with django_assert_num_queries(len(captured.captured_queries)):
        response = auth_client.get("/api/reservations/")

    assert response.data["count"] == 3


def test_create_reservation_with_companions_persists_m2m(auth_client):
    guest, eva = GuestFactory(), GuestFactory()
    room = RoomFactory(capacity=3)
    today = timezone.localdate()

    response = auth_client.post(
        "/api/reservations/",
        {
            "guest_id": guest.pk,
            "room_id": room.pk,
            "companion_ids": [eva.pk],
            "checkin_date": str(today),
            "checkout_date": str(today + timedelta(days=2)),
        },
        format="json",
    )

    assert response.status_code == 201
    assert response.data["companions"] == [{"id": eva.pk, "full_name": eva.full_name}]
    assert response.data["guest_id"] == guest.pk


def test_create_reservation_without_companions_returns_empty_list(auth_client):
    today = timezone.localdate()

    response = auth_client.post(
        "/api/reservations/",
        {
            "guest_id": GuestFactory().pk,
            "room_id": RoomFactory().pk,
            "checkin_date": str(today),
            "checkout_date": str(today + timedelta(days=2)),
        },
        format="json",
    )

    assert response.status_code == 201
    assert response.data["companions"] == []


@pytest.mark.parametrize(
    "case",
    ["duplicate", "holder", "over_capacity"],
)
def test_create_reservation_rejects_a_bad_party_400(auth_client, case):
    """As tres sao regras de AGREGADO: o serializer so sabe que cada id existe."""
    guest, eva, davi = GuestFactory(), GuestFactory(), GuestFactory()
    room = RoomFactory(capacity=2)
    today = timezone.localdate()
    companions = {
        "duplicate": [eva.pk, eva.pk],
        "holder": [guest.pk],
        "over_capacity": [eva.pk, davi.pk],
    }[case]

    response = auth_client.post(
        "/api/reservations/",
        {
            "guest_id": guest.pk,
            "room_id": room.pk,
            "companion_ids": companions,
            "checkin_date": str(today),
            "checkout_date": str(today + timedelta(days=2)),
        },
        format="json",
    )

    assert response.status_code == 400
    assert response.data["code"] == "VALIDATION_ERROR"
    assert "companion_ids" in response.data["extra"]


def test_create_reservation_rejects_an_unknown_companion(auth_client):
    today = timezone.localdate()

    response = auth_client.post(
        "/api/reservations/",
        {
            "guest_id": GuestFactory().pk,
            "room_id": RoomFactory(capacity=3).pk,
            "companion_ids": [999999],
            "checkin_date": str(today),
            "checkout_date": str(today + timedelta(days=2)),
        },
        format="json",
    )

    assert response.status_code == 400
    assert "companion_ids" in response.data["extra"]


def test_add_companions_to_pending_reservation(auth_client):
    reservation = ReservationFactory(room=RoomFactory(capacity=3))
    eva = GuestFactory()

    response = auth_client.post(
        companions_url(reservation),
        {"companion_ids": [eva.pk]},
        format="json",
    )

    assert response.status_code == 200
    assert response.data["companions"] == [{"id": eva.pk, "full_name": eva.full_name}]
    assert set(reservation.companions.values_list("pk", flat=True)) == {eva.pk}


def test_add_companions_keeps_the_ones_already_there(auth_client):
    eva, davi = GuestFactory(), GuestFactory()
    reservation = ReservationFactory(room=RoomFactory(capacity=4))
    reservation.companions.add(eva)

    response = auth_client.post(
        companions_url(reservation),
        {"companion_ids": [davi.pk]},
        format="json",
    )

    assert response.status_code == 200
    names = {row["full_name"] for row in response.data["companions"]}
    assert names == {eva.full_name, davi.full_name}


def test_add_companions_rejects_checked_in(auth_client):
    reservation = t7_reservation()
    eva = GuestFactory()

    with freeze_time(local(MARCH_7, 15, 0)):
        auth_client.post(checkin_url(reservation), {}, format="json")
    response = auth_client.post(
        companions_url(reservation),
        {"companion_ids": [eva.pk]},
        format="json",
    )

    assert response.status_code == 409
    assert response.data["code"] == "INVALID_STATUS"


def test_add_companions_rejects_an_unknown_guest(auth_client):
    reservation = ReservationFactory()

    response = auth_client.post(
        companions_url(reservation),
        {"companion_ids": [999999]},
        format="json",
    )

    assert response.status_code == 400
    assert "companion_ids" in response.data["extra"]
