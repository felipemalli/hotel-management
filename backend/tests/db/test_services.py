"""
Servicos de reserva: transicoes, relogio injetado e congelamento de totais
(SPEC 1.5, 3.2, 4.4). Precisa de PG (select_for_update).
"""

from datetime import date, datetime, time
from decimal import Decimal
from zoneinfo import ZoneInfo

import pytest

from hotel.models import Reservation, ReservationStatus
from hotel.services import reservations as service
from tests.factories import ReservationFactory

pytestmark = pytest.mark.django_db

SAO_PAULO = ZoneInfo("America/Sao_Paulo")
UTC = ZoneInfo("UTC")

# Calendario de referencia da SPEC 3.3: marco/2025.
MARCH_7 = date(2025, 3, 7)  # sexta
MARCH_9 = date(2025, 3, 9)  # domingo


def local(day: date, hour: int, minute: int = 0, second: int = 0) -> datetime:
    return datetime.combine(day, time(hour, minute, second), tzinfo=SAO_PAULO)


def t7_reservation() -> Reservation:
    """Reserva agendada do caso T7 (sex 07/03 -> dom 09/03, com vaga)."""
    return ReservationFactory(checkin_date=MARCH_7, checkout_date=MARCH_9, has_vehicle=True)


# -- check-in ----------------------------------------------------------------


def test_check_in_at_14_sets_status_and_timestamp():
    reservation = t7_reservation()
    now = local(MARCH_7, 14, 0, 0)

    returned = service.check_in(reservation, now=now, allow_early=False)

    assert returned is reservation
    assert reservation.status == ReservationStatus.CHECKED_IN
    assert reservation.checked_in_at == now
    stored = Reservation.objects.get(pk=reservation.pk)
    assert stored.status == ReservationStatus.CHECKED_IN
    assert stored.checked_in_at == now


def test_check_in_before_14_raises_early_checkin_with_server_time():
    reservation = t7_reservation()

    with pytest.raises(service.EarlyCheckinError) as exc:
        service.check_in(reservation, now=local(MARCH_7, 13, 59, 59), allow_early=False)

    assert exc.value.code == "EARLY_CHECKIN"
    assert exc.value.detail == "Check-in permitido a partir das 14:00."
    assert exc.value.extra == {"server_time": "13:59"}
    assert Reservation.objects.get(pk=reservation.pk).status == ReservationStatus.PENDING


def test_check_in_before_14_with_override_succeeds():
    """D4: o briefing pede alerta, nao bloqueio."""
    reservation = t7_reservation()
    now = local(MARCH_7, 13, 59, 59)

    service.check_in(reservation, now=now, allow_early=True)

    assert reservation.status == ReservationStatus.CHECKED_IN
    assert reservation.checked_in_at == now


def test_check_in_rule_is_evaluated_in_local_time():
    """SPEC 0.3: 16:30 UTC e 13:30 em Sao Paulo -- e cedo, mesmo parecendo tarde."""
    reservation = t7_reservation()
    now_utc = datetime(2025, 3, 7, 16, 30, tzinfo=UTC)

    with pytest.raises(service.EarlyCheckinError) as exc:
        service.check_in(reservation, now=now_utc, allow_early=False)

    assert exc.value.extra == {"server_time": "13:30"}


@pytest.mark.parametrize(
    "trait",
    ["checked_in", "checked_out", "cancelled"],
)
def test_check_in_rejects_non_pending(trait):
    reservation = _reservation_in_state(trait)

    with pytest.raises(service.InvalidStatusError) as exc:
        service.check_in(reservation, now=local(MARCH_9, 15), allow_early=True)

    assert exc.value.code == "INVALID_STATUS"


# -- checkout ----------------------------------------------------------------


def test_check_out_freezes_totals_matching_T7():
    """Caso T7 da SPEC 3.3 ponta a ponta, pelos fatos reais (D6)."""
    reservation = t7_reservation()
    service.check_in(reservation, now=local(MARCH_7, 15), allow_early=False)

    bill = service.check_out(reservation, now=local(MARCH_9, 12, 1))

    assert bill.subtotal_daily == Decimal("300.00")
    assert bill.subtotal_parking == Decimal("35.00")
    assert bill.late_fee_applied is True
    assert bill.late_fee_base == Decimal("180.00")
    assert bill.late_fee == Decimal("90.00")
    assert bill.total == Decimal("425.00")

    stored = Reservation.objects.get(pk=reservation.pk)
    assert stored.status == ReservationStatus.CHECKED_OUT
    assert stored.checked_out_at == local(MARCH_9, 12, 1)
    assert stored.total_daily == Decimal("300.00")
    assert stored.total_parking == Decimal("35.00")
    assert stored.late_fee == Decimal("90.00")
    assert stored.total_amount == Decimal("425.00")


def test_check_out_charges_real_stay_not_scheduled_dates():
    """D6: agendado sex->dom, saida real na segunda -> a diaria de domingo entra."""
    reservation = t7_reservation()
    service.check_in(reservation, now=local(MARCH_7, 15), allow_early=False)

    bill = service.check_out(reservation, now=local(date(2025, 3, 10), 11, 0))

    assert [line.date.day for line in bill.lines] == [7, 8, 9]
    assert bill.total == Decimal("535.00")  # caso T3


def test_check_out_exactly_at_noon_is_exempt():
    """T8/D3: `ate as 12h00min` inclui o limite."""
    reservation = ReservationFactory(
        checkin_date=date(2025, 3, 5), checkout_date=date(2025, 3, 7), has_vehicle=False
    )
    service.check_in(reservation, now=local(date(2025, 3, 5), 18), allow_early=False)

    bill = service.check_out(reservation, now=local(date(2025, 3, 7), 12, 0, 0))

    assert bill.late_fee_applied is False
    assert bill.total == Decimal("240.00")


def test_check_out_twice_is_rejected():
    reservation = t7_reservation()
    service.check_in(reservation, now=local(MARCH_7, 15), allow_early=False)
    service.check_out(reservation, now=local(MARCH_9, 11))

    with pytest.raises(service.InvalidStatusError):
        service.check_out(reservation, now=local(MARCH_9, 11, 30))


@pytest.mark.parametrize("trait", ["pending", "cancelled"])
def test_check_out_requires_checked_in(trait):
    reservation = _reservation_in_state(trait)

    with pytest.raises(service.InvalidStatusError):
        service.check_out(reservation, now=local(MARCH_9, 11))


def test_check_out_without_checkin_timestamp_is_rejected():
    """Defesa contra linha inconsistente: CHECKED_IN sem `checked_in_at`."""
    reservation = ReservationFactory(checked_in=True)
    Reservation.objects.filter(pk=reservation.pk).update(checked_in_at=None)

    with pytest.raises(service.InvalidStatusError):
        service.check_out(reservation, now=local(MARCH_9, 11))


# -- cancelamento e extrato --------------------------------------------------


def test_cancel_pending_reservation():
    reservation = ReservationFactory()

    service.cancel(reservation)

    assert reservation.status == ReservationStatus.CANCELLED
    assert Reservation.objects.get(pk=reservation.pk).status == ReservationStatus.CANCELLED


@pytest.mark.parametrize("trait", ["checked_in", "checked_out", "cancelled"])
def test_cancel_rejects_anything_but_pending(trait):
    """D8: nenhum outro estado cancela -- dinheiro monotonico."""
    reservation = _reservation_in_state(trait)

    with pytest.raises(service.InvalidStatusError):
        service.cancel(reservation)


def test_statement_recomputes_the_frozen_bill():
    """SPEC 1.3: o extrato linha a linha e recomputavel, sem JSON no banco."""
    reservation = t7_reservation()
    service.check_in(reservation, now=local(MARCH_7, 15), allow_early=False)
    frozen = service.check_out(reservation, now=local(MARCH_9, 12, 1))

    recomputed = service.statement(Reservation.objects.get(pk=reservation.pk))

    assert recomputed == frozen


def test_statement_requires_checkout():
    with pytest.raises(service.InvalidStatusError):
        service.statement(ReservationFactory(checked_in=True))


def test_domain_error_carries_the_envelope_defaults():
    """SPEC 4.1: cada erro de dominio sabe o proprio `code`."""
    error = service.ReservationError()

    assert error.code == "INVALID_STATUS"
    assert error.detail
    assert error.extra == {}


def _reservation_in_state(trait: str) -> Reservation:
    if trait == "pending":
        return ReservationFactory()
    if trait == "cancelled":
        reservation = ReservationFactory()
        reservation.status = ReservationStatus.CANCELLED
        reservation.save(update_fields=["status"])
        return reservation
    return ReservationFactory(**{trait: True})


def test_check_in_rejects_guest_with_an_active_stay():
    """Invariante entre linhas vira 409, nao IntegrityError.

    `resv_one_active_per_guest` (SPEC 1.5) e uma constraint ENTRE linhas. Sem
    checagem no service ela estourava como IntegrityError e o handler da SPEC
    4.1 devolvia HTTP 500 -- numa condicao de negocio legitima: hospede com
    duas reservas PENDING, check-in na segunda.
    """
    active = ReservationFactory(checkin_date=MARCH_7, checkout_date=MARCH_9)
    service.check_in(active, now=local(MARCH_7, 15))

    second = ReservationFactory(
        guest=active.guest,
        checkin_date=date(2025, 3, 10),
        checkout_date=date(2025, 3, 12),
    )

    with pytest.raises(service.InvalidStatusError) as exc:
        service.check_in(second, now=local(date(2025, 3, 10), 15))

    assert exc.value.code == "INVALID_STATUS"
    assert exc.value.extra["active_reservation_id"] == active.pk
    second.refresh_from_db()
    assert second.status == ReservationStatus.PENDING
    assert second.checked_in_at is None


def test_check_in_allowed_again_after_checkout():
    """A trava e a estadia ATIVA, nao o historico: apos o checkout, libera."""
    first = ReservationFactory(checkin_date=MARCH_7, checkout_date=MARCH_9)
    service.check_in(first, now=local(MARCH_7, 15))
    service.check_out(first, now=local(MARCH_9, 11))

    second = ReservationFactory(
        guest=first.guest,
        checkin_date=date(2025, 3, 10),
        checkout_date=date(2025, 3, 12),
    )
    service.check_in(second, now=local(date(2025, 3, 10), 15))

    second.refresh_from_db()
    assert second.status == ReservationStatus.CHECKED_IN


def test_check_out_converts_utc_to_local_before_counting_nights():
    """A conversao para hora local decide QUAIS diarias entram na conta.

    Sao Paulo e UTC-3, entao um check-in as 21:00 locais e 00:00 UTC do dia
    SEGUINTE. Este teste passa os timestamps em UTC de proposito, porque e o
    que a producao faz: a view injeta `timezone.now()` (UTC) e o banco devolve
    `checked_in_at` em UTC.

    Sexta 21:00 local -> domingo 11:00 local, em datas locais, sao as diarias
    de sexta (120,00) e sabado (180,00) = 300,00. Lidas em UTC seriam sabado a
    domingo, ou seja so sabado = 180,00. Sem o `timezone.localtime()` do
    servico, a diferenca de R$ 120,00 passava sem nenhum teste falhar.
    """
    checkin_utc = datetime(2025, 3, 8, 0, 0, tzinfo=UTC)  # sex 07/03 21:00 local
    checkout_utc = datetime(2025, 3, 9, 14, 0, tzinfo=UTC)  # dom 09/03 11:00 local

    reservation = ReservationFactory(checkin_date=MARCH_7, checkout_date=MARCH_9, has_vehicle=False)
    service.check_in(reservation, now=checkin_utc)
    bill = service.check_out(reservation, now=checkout_utc)

    assert [line.date for line in bill.lines] == [MARCH_7, date(2025, 3, 8)]
    assert bill.subtotal_daily == Decimal("300.00")
    assert bill.late_fee == Decimal("0.00")
    assert bill.total == Decimal("300.00")


def test_check_in_rule_reads_local_time_from_a_utc_timestamp():
    """23:00 locais liberam o check-in, embora sejam 02:00 UTC do dia seguinte.

    Complementa o teste de fronteira local: aqui a entrada e UTC, como na
    producao. Sem a conversao, `early_checkin` veria 02:00 e exigiria override
    num horario em que a regra das 14h ja esta satisfeita.
    """
    now_utc = datetime(2025, 3, 8, 2, 0, tzinfo=UTC)  # sex 07/03 23:00 local
    reservation = ReservationFactory(checkin_date=MARCH_7, checkout_date=MARCH_9)

    service.check_in(reservation, now=now_utc, allow_early=False)

    reservation.refresh_from_db()
    assert reservation.status == ReservationStatus.CHECKED_IN
