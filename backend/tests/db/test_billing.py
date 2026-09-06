from datetime import date, datetime, time
from decimal import Decimal
from zoneinfo import ZoneInfo

import pytest
from django.db import IntegrityError, transaction

from hotel.billing import engine as pricing
from hotel.models import PaymentMethod, Reservation, ReservationStatus, StatementLine
from hotel.reservations import services as service
from tests.factories import PricingPolicyFactory, ReservationFactory, UserFactory

pytestmark = pytest.mark.django_db

SAO_PAULO = ZoneInfo("America/Sao_Paulo")
MARCH_7 = date(2025, 3, 7)  # sexta
MARCH_9 = date(2025, 3, 9)  # domingo


def local(day: date, hour: int, minute: int = 0, second: int = 0) -> datetime:
    return datetime.combine(day, time(hour, minute, second), tzinfo=SAO_PAULO)


@pytest.fixture
def actor():
    return UserFactory(username="atendente-do-caixa")


def t7_checked_out(actor) -> Reservation:
    """Estadia T7 fechada de verdade, pelo servico (sex->dom, vaga, 12:01)."""
    reservation = ReservationFactory(checkin_date=MARCH_7, checkout_date=MARCH_9, has_vehicle=True)
    service.check_in(reservation, now=local(MARCH_7, 15), actor=actor)
    service.check_out(reservation, now=local(MARCH_9, 12, 1), actor=actor)
    return reservation


def test_checkout_persists_statement_lines_equal_to_bill(actor):
    reservation = ReservationFactory(checkin_date=MARCH_7, checkout_date=MARCH_9, has_vehicle=True)
    service.check_in(reservation, now=local(MARCH_7, 15), actor=actor)

    bill = service.check_out(reservation, now=local(MARCH_9, 12, 1), actor=actor)

    lines = list(StatementLine.objects.filter(reservation=reservation).order_by("date"))
    assert [(line.date, line.daily_rate, line.parking_fee) for line in lines] == [
        (line.date, line.daily_rate, line.parking_fee) for line in bill.lines
    ]
    reservation.refresh_from_db()
    assert reservation.late_fee_base == Decimal("180.00")


def test_statement_hydrates_without_recomputing(actor, monkeypatch):
    """Prova direta: com o motor sabotado, a 2a via continua correta.

    Se `statement()` ainda recomputasse, este teste explodiria. E a diferenca
    entre um recibo que e um FATO e um recibo que e uma funcao.
    """
    reservation = t7_checked_out(actor)

    def explode(**kwargs):
        raise AssertionError("statement() nao pode recomputar o extrato")

    monkeypatch.setattr(pricing, "calculate_bill", explode)

    bill = service.statement(Reservation.objects.get(pk=reservation.pk))

    assert bill.total == Decimal("425.00")
    assert bill.late_fee == Decimal("90.00")
    assert bill.late_fee_applied is True
    assert [line.weekday_label for line in bill.lines] == ["sexta-feira", "sábado"]


def test_statement_survives_policy_change(actor):
    """Tarifa nova publicada depois do checkout nao mexe no recibo emitido."""
    reservation = t7_checked_out(actor)
    PricingPolicyFactory(
        effective_from=local(date(2025, 3, 10), 9),
        weekday_rate=Decimal("999.00"),
        weekend_rate=Decimal("999.00"),
        late_fee_factor=Decimal("0.99"),
    )

    bill = service.statement(Reservation.objects.get(pk=reservation.pk))

    assert bill.total == Decimal("425.00")
    assert [line.daily_rate for line in bill.lines] == [Decimal("120.00"), Decimal("180.00")]


def test_statement_without_lines_returns_invalid_status(actor):
    """Reserva encerrada sem linhas: 409 explicito, nunca recibo de zero diarias."""
    reservation = t7_checked_out(actor)
    StatementLine.objects.filter(reservation=reservation).delete()

    with pytest.raises(service.InvalidStatusError):
        service.statement(Reservation.objects.get(pk=reservation.pk))


def test_statement_lines_are_unique_per_date(actor):
    reservation = t7_checked_out(actor)
    existing = StatementLine.objects.filter(reservation=reservation).first()

    with pytest.raises(IntegrityError), transaction.atomic():
        StatementLine.objects.create(
            reservation=reservation,
            date=existing.date,
            daily_rate=Decimal("1.00"),
            parking_fee=Decimal("0.00"),
        )


def test_mark_paid_sets_actor_method_and_timestamp(actor):
    reservation = t7_checked_out(actor)
    cashier = UserFactory(username="quem-recebeu")
    paid_at = local(MARCH_9, 12, 30)

    returned = service.mark_paid(
        reservation, now=paid_at, actor=cashier, payment_method=PaymentMethod.PIX
    )

    stored = Reservation.objects.get(pk=reservation.pk)
    assert stored.paid_at == paid_at
    assert stored.payment_method == PaymentMethod.PIX
    assert stored.paid_by_id == cashier.pk
    assert returned.paid_at == paid_at
    assert stored.status == ReservationStatus.CHECKED_OUT


def test_mark_paid_twice_is_rejected(actor):
    reservation = t7_checked_out(actor)
    first = local(MARCH_9, 12, 30)
    service.mark_paid(reservation, now=first, actor=actor, payment_method=PaymentMethod.CASH)

    with pytest.raises(service.InvalidStatusError) as excinfo:
        service.mark_paid(
            reservation, now=local(MARCH_9, 13), actor=actor, payment_method=PaymentMethod.CARD
        )

    assert excinfo.value.code == "INVALID_STATUS"
    assert excinfo.value.extra["paid_at"] == first.isoformat()
    stored = Reservation.objects.get(pk=reservation.pk)
    assert stored.payment_method == PaymentMethod.CASH  # a primeira forma vence


@pytest.mark.parametrize("trait", ["checked_in", None], ids=["checked_in", "pending"])
def test_pay_before_checkout_is_rejected(actor, trait):
    reservation = ReservationFactory(**({trait: True} if trait else {}))

    with pytest.raises(service.InvalidStatusError):
        service.mark_paid(
            reservation, now=local(MARCH_9, 12), actor=actor, payment_method=PaymentMethod.PIX
        )


def test_payment_constraint_rejects_partial_columns(actor):
    """Meio pagamento gravado seria um recibo que nao se sustenta."""
    reservation = t7_checked_out(actor)
    reservation.paid_at = local(MARCH_9, 12, 30)

    with pytest.raises(IntegrityError), transaction.atomic():
        reservation.save(update_fields=["paid_at"])


def test_paid_requires_checked_out_constraint(actor):
    """So se paga o que foi fechado: sem checkout nao existe total."""
    reservation = ReservationFactory(checked_in=True)
    reservation.paid_at = local(MARCH_9, 12, 30)
    reservation.payment_method = PaymentMethod.PIX
    reservation.paid_by = actor

    with pytest.raises(IntegrityError), transaction.atomic():
        reservation.save(update_fields=["paid_at", "payment_method", "paid_by"])


def test_statement_carries_the_payment_after_it_is_registered(actor):
    from hotel.reservations.serializers import build_statement

    reservation = t7_checked_out(actor)
    assert build_statement(reservation, service.statement(reservation))["payment"] is None

    service.mark_paid(
        reservation, now=local(MARCH_9, 12, 30), actor=actor, payment_method=PaymentMethod.PIX
    )

    payload = build_statement(reservation, service.statement(reservation))
    assert payload["payment"]["method"] == PaymentMethod.PIX
    assert payload["payment"]["paid_by"] == actor
