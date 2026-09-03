"""
Fluxo completo de reserva na borda HTTP (SPEC 4.4, 1.5).

Nomes normativos da matriz SPEC 6.3 (RF2, RF6, RF7, RN4, RN5, RN6).

`freezegun` entra **so aqui**, na borda: a view le `timezone.now()` e injeta o
resultado nos services (SPEC 0.3), logo congelar o relogio do processo e o
jeito honesto de testar 13:59 x 14:00 e a multa de 12:01 ponta a ponta.
Calendario de referencia: marco/2025 (SPEC 3.3).
"""

from datetime import date, timedelta
from decimal import Decimal

import pytest
from django.utils import timezone
from freezegun import freeze_time

from hotel.models import Reservation, ReservationStatus
from tests.api.conftest import local
from tests.factories import GuestFactory, ReservationFactory

pytestmark = pytest.mark.django_db

MARCH_7 = date(2025, 3, 7)  # sexta
MARCH_9 = date(2025, 3, 9)  # domingo

# Extrato do caso T7 da SPEC 3.3: sex 07/03 15:00 -> dom 09/03 12:01, com vaga.
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
    """Reserva agendada do caso T7, ainda PENDING."""
    return ReservationFactory(checkin_date=MARCH_7, checkout_date=MARCH_9, has_vehicle=True)


def checkin_url(reservation: Reservation) -> str:
    return f"/api/reservations/{reservation.pk}/check-in/"


def checkout_url(reservation: Reservation) -> str:
    return f"/api/reservations/{reservation.pk}/checkout/"


def cancel_url(reservation: Reservation) -> str:
    return f"/api/reservations/{reservation.pk}/cancel/"


def detail_url(reservation: Reservation) -> str:
    return f"/api/reservations/{reservation.pk}/"


def statement_url(reservation: Reservation) -> str:
    return f"/api/reservations/{reservation.pk}/statement/"


# -- criacao ------------------------------------------------------------------


def test_create_reservation_persists_pending(auth_client):
    """RF2: reserva nasce PENDING com todos os campos financeiros `null` (SPEC 4.4)."""
    guest = GuestFactory()
    today = timezone.localdate()

    response = auth_client.post(
        "/api/reservations/",
        {
            "guest_id": guest.pk,
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
    for money in ("total_daily", "total_parking", "late_fee", "total_amount"):
        assert response.data[money] is None, money

    stored = Reservation.objects.get(pk=response.data["id"])
    assert stored.guest_id == guest.pk
    assert stored.status == ReservationStatus.PENDING


def test_create_reservation_in_the_past_returns_400(auth_client):
    """D11: reserva e compromisso futuro."""
    guest = GuestFactory()
    today = timezone.localdate()

    response = auth_client.post(
        "/api/reservations/",
        {
            "guest_id": guest.pk,
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
    """D13: agendamento exige no minimo 1 noite -- day-use so existe como fato."""
    guest = GuestFactory()
    today = timezone.localdate()

    response = auth_client.post(
        "/api/reservations/",
        {
            "guest_id": guest.pk,
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
            "checkin_date": str(today),
            "checkout_date": str(today + timedelta(days=1)),
        },
        format="json",
    )

    assert response.status_code == 400
    assert response.data["code"] == "VALIDATION_ERROR"
    assert "guest_id" in response.data["extra"]


# -- check-in -----------------------------------------------------------------


def test_checkin_after_14_succeeds(auth_client):
    """RF6: 14:00:00 em ponto NAO e cedo (SPEC 3.3, fronteiras de check-in)."""
    reservation = t7_reservation()

    with freeze_time(local(MARCH_7, 14, 0, 0)):
        response = auth_client.post(checkin_url(reservation), {}, format="json")

    assert response.status_code == 200
    assert response.data["status"] == ReservationStatus.CHECKED_IN
    assert response.data["checked_in_at"] == "2025-03-07T14:00:00-03:00"
    reservation.refresh_from_db()
    assert reservation.status == ReservationStatus.CHECKED_IN


def test_checkin_before_14_returns_409_and_override(auth_client):
    """RN4/D4: alerta com override -- 409 primeiro, `allow_early: true` depois."""
    reservation = t7_reservation()

    with freeze_time(local(MARCH_7, 13, 59, 59)):
        blocked = auth_client.post(checkin_url(reservation), {"allow_early": False}, format="json")

        assert blocked.status_code == 409
        assert blocked.data == {
            "code": "EARLY_CHECKIN",
            "detail": "Check-in permitido a partir das 14:00.",
            # `opens_at` e o horario da politica vigente, para o cliente
            # montar a mensagem sem parsear `detail` (RESUMO 7). Com a politica
            # do briefing o `detail` sai byte a byte igual ao de antes.
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
    """SPEC 1.5: `CHECKED_IN -> CHECKED_IN` nao existe."""
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


# -- checkout -----------------------------------------------------------------


def test_checkout_freezes_totals(auth_client):
    """RF7: os totais do caso T7 ficam congelados na linha (SPEC 1.3, 4.4)."""
    reservation = t7_reservation()

    with freeze_time(local(MARCH_7, 15, 0)):
        auth_client.post(checkin_url(reservation), {}, format="json")
    with freeze_time(local(MARCH_9, 12, 1)):
        response = auth_client.post(checkout_url(reservation), format="json")

    assert response.status_code == 200
    stored = Reservation.objects.get(pk=reservation.pk)
    assert stored.status == ReservationStatus.CHECKED_OUT
    assert stored.total_daily == Decimal("300.00")
    assert stored.total_parking == Decimal("35.00")
    assert stored.late_fee == Decimal("90.00")
    assert stored.total_amount == Decimal("425.00")
    assert stored.checked_out_at is not None


def test_checkout_statement_matches_T7(auth_client):
    """RN5/RN6: o extrato inteiro e, campo a campo, o caso T7 da SPEC 3.3."""
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
        "late_fee": {"applied": True, "base_rate": "180.00", "amount": "90.00"},
        "total": "425.00",
        # Conta fechada e em aberto: `null` e nao um dict de campos nulos, que
        # diria "houve pagamento, sem dados". O cliente ramifica por `payment
        # === null` (RESUMO 7).
        "payment": None,
    }


def test_statement_reissues_the_exact_checkout_receipt(auth_client):
    """2a via: mesmo recibo do checkout, recomputado dos fatos (SPEC 1.3).

    E o teste que protege a hipotese da SPEC 1.3 na pratica: se um dia a
    tarifa mudar por baixo, este assert e o que acusa a divergencia entre o
    extrato reemitido e o que o hospede pagou.
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
    # Datas fixas no calendario da SPEC 3.3: o trait `checked_out` usa `hoje`
    # por default, e o total mudaria conforme o dia da semana em que a suite
    # rodasse (sex 120 + sab 180 = 300,00 aqui, sem vaga e sem multa).
    reservation = ReservationFactory(
        checked_out=True, checkin_date=MARCH_7, checkout_date=MARCH_9
    )

    response = auth_client.get(detail_url(reservation))

    assert response.status_code == 200
    assert response.data["id"] == reservation.pk
    assert response.data["status"] == ReservationStatus.CHECKED_OUT
    assert response.data["total_amount"] == "300.00"


def test_checkout_at_noon_has_no_late_fee(auth_client):
    """D3/T8: 12:00:00 em ponto e isento -- `late_fee.applied` sai `false`."""
    reservation = ReservationFactory(checkin_date=MARCH_7, checkout_date=MARCH_9)

    with freeze_time(local(MARCH_7, 15, 0)):
        auth_client.post(checkin_url(reservation), {}, format="json")
    with freeze_time(local(MARCH_9, 12, 0, 0)):
        response = auth_client.post(checkout_url(reservation), format="json")

    assert response.status_code == 200
    assert response.data["late_fee"] == {
        "applied": False,
        "base_rate": None,
        "amount": "0.00",
    }
    assert response.data["total"] == "300.00"


def test_double_checkout_returns_invalid_status(auth_client):
    """SPEC 4.4: duplo checkout e conflito -- o dinheiro nao recalcula."""
    reservation = t7_reservation()

    with freeze_time(local(MARCH_7, 15, 0)):
        auth_client.post(checkin_url(reservation), {}, format="json")
    with freeze_time(local(MARCH_9, 12, 1)):
        assert auth_client.post(checkout_url(reservation), format="json").status_code == 200
        response = auth_client.post(checkout_url(reservation), format="json")

    assert response.status_code == 409
    assert response.data["code"] == "INVALID_STATUS"
    assert Reservation.objects.get(pk=reservation.pk).total_amount == Decimal("425.00")


def test_checkout_without_checkin_returns_invalid_status(auth_client):
    reservation = t7_reservation()

    with freeze_time(local(MARCH_9, 12, 1)):
        response = auth_client.post(checkout_url(reservation), format="json")

    assert response.status_code == 409
    assert response.data["code"] == "INVALID_STATUS"


# -- cancelamento -------------------------------------------------------------


def test_cancel_pending_reservation(auth_client):
    """D8: `PENDING -> CANCELLED` e a unica transicao de cancelamento."""
    reservation = t7_reservation()

    response = auth_client.post(cancel_url(reservation), format="json")

    assert response.status_code == 200
    assert response.data["status"] == ReservationStatus.CANCELLED
    assert Reservation.objects.get(pk=reservation.pk).status == ReservationStatus.CANCELLED


def test_cancel_checked_in_returns_invalid_status(auth_client):
    """D8: hospede no hotel nao cancela -- exigiria politica de estorno inexistente."""
    reservation = t7_reservation()

    with freeze_time(local(MARCH_7, 15, 0)):
        auth_client.post(checkin_url(reservation), {}, format="json")
    response = auth_client.post(cancel_url(reservation), format="json")

    assert response.status_code == 409
    assert response.data["code"] == "INVALID_STATUS"


# -- listagem -----------------------------------------------------------------


def test_list_reservations_filters_by_status_and_guest(auth_client):
    """SPEC 4.2: `?status=` e `?guest=`."""
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


@pytest.mark.parametrize(
    ("params", "field"),
    [({"status": "SLEEPING"}, "status"), ({"guest": "abc"}, "guest")],
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

    A constraint `resv_one_active_per_guest` (SPEC 1.5) e entre linhas; sem
    checagem no service ela chegava ao handler como IntegrityError, que a SPEC
    4.1 nao classifica. O caminho e alcancavel pela UI: duas reservas PENDING
    do mesmo hospede, check-in nas duas.
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


# -- pagamento (D18) ----------------------------------------------------------


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
    # O extrato inteiro continua sendo T7: pagar nao mexe em dinheiro.
    assert response.data["total"] == "425.00"
    assert response.data["lines"] == T7_LINES
    assert response.data["payment"] == {
        "paid_at": "2025-03-09T12:30:00-03:00",
        "method": "PIX",
        "paid_by": {"id": attendant.pk, "username": attendant.username},
    }


def test_statement_reissued_after_payment_shows_it(auth_client):
    reservation = _checked_out_t7(auth_client)
    with freeze_time(local(MARCH_9, 12, 30)):
        paid = auth_client.post(pay_url(reservation), {"payment_method": "CASH"}, format="json")

    reissued = auth_client.get(statement_url(reservation))

    assert reissued.status_code == 200
    assert reissued.data == paid.data


def test_pay_twice_returns_409(auth_client):
    reservation = _checked_out_t7(auth_client)
    with freeze_time(local(MARCH_9, 12, 30)):
        auth_client.post(pay_url(reservation), {"payment_method": "PIX"}, format="json")

    response = auth_client.post(pay_url(reservation), {"payment_method": "CARD"}, format="json")

    assert response.status_code == 409
    # `INVALID_STATUS`, nao um `ALREADY_PAID`: pagar de novo e operacao ilegal
    # para o estado atual do recurso -- o mesmo significado de D8.
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
    """N+1 na listagem: 6 relacoes por linha vira 120 idas ao banco em 20 linhas.

    O numero exato importa menos que a INVARIANCIA: a mesma contagem com 1 e
    com 3 reservas prova que `select_related` esta fazendo o trabalho.
    """
    ReservationFactory(checked_out=True, checkin_date=MARCH_7, checkout_date=MARCH_9)
    with django_assert_num_queries(2) as captured:
        auth_client.get("/api/reservations/")

    for _ in range(2):
        ReservationFactory(checked_out=True, checkin_date=MARCH_7, checkout_date=MARCH_9)

    # Mesma contagem com o triplo de linhas: `select_related` esta cobrindo as
    # 6 relacoes que o serializer le.
    with django_assert_num_queries(len(captured.captured_queries)):
        response = auth_client.get("/api/reservations/")

    assert response.data["count"] == 3
