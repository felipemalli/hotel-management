from datetime import date, datetime, time
from decimal import Decimal
from zoneinfo import ZoneInfo

import pytest

from hotel.billing import engine as pricing
from hotel.billing import services as billing
from hotel.billing.models import Account, AccountLine, AccountStatus, LineKind, PaymentMethod
from hotel.reservations import services as service
from hotel.reservations.models import Reservation, ReservationStatus
from tests.factories import PricingPolicyFactory, ReservationFactory, UserFactory

pytestmark = pytest.mark.django_db

SAO_PAULO = ZoneInfo("America/Sao_Paulo")
MARCH_7 = date(2025, 3, 7)  # sexta
MARCH_8 = date(2025, 3, 8)  # sabado
MARCH_9 = date(2025, 3, 9)  # domingo


def local(day: date, hour: int, minute: int = 0, second: int = 0) -> datetime:
    return datetime.combine(day, time(hour, minute, second), tzinfo=SAO_PAULO)


@pytest.fixture
def actor():
    return UserFactory(username="atendente-do-caixa")


def t7_checked_in(actor) -> Reservation:
    reservation = ReservationFactory(checkin_date=MARCH_7, checkout_date=MARCH_9, has_vehicle=True)
    service.check_in(reservation, now=local(MARCH_7, 15), actor=actor)
    return reservation


def t7_checked_out(actor) -> Reservation:
    """Estadia T7 fechada de verdade, pelo servico (sex->dom, vaga, 12:01)."""
    reservation = t7_checked_in(actor)
    service.check_out(reservation, now=local(MARCH_9, 12, 1), actor=actor)
    return reservation


def lines_by_kind(reservation, kind) -> list[AccountLine]:
    return list(
        AccountLine.objects.filter(account=reservation.account, kind=kind).order_by("service_date")
    )


def test_check_in_opens_an_account_in_the_same_transaction(actor):
    reservation = ReservationFactory(checkin_date=MARCH_7, checkout_date=MARCH_9)

    with pytest.raises(service.EarlyCheckinError):
        service.check_in(reservation, now=local(MARCH_7, 9), actor=actor)

    assert Account.objects.count() == 0
    reservation.refresh_from_db()
    assert reservation.account is None


def test_checkout_persists_statement_lines_equal_to_bill(actor):
    reservation = t7_checked_in(actor)
    bill = pricing.calculate_bill(
        checkin_day=MARCH_7, checkout_day=MARCH_9, checkout_time=time(12, 1), has_vehicle=True
    )

    service.check_out(reservation, now=local(MARCH_9, 12, 1), actor=actor)

    dailies = lines_by_kind(reservation, LineKind.DAILY)
    parkings = lines_by_kind(reservation, LineKind.PARKING)
    assert [(line.service_date, line.amount) for line in dailies] == [
        (line.date, line.daily_rate) for line in bill.lines
    ]
    assert [(line.service_date, line.amount) for line in parkings] == [
        (line.date, line.parking_fee) for line in bill.lines
    ]
    (late_fee,) = lines_by_kind(reservation, LineKind.LATE_FEE)
    assert late_fee.unit_amount == Decimal("180.00")
    assert late_fee.quantity == Decimal("0.5")
    assert late_fee.amount == Decimal("90.00")


def test_preview_checkout_has_no_side_effects(actor):
    reservation = t7_checked_in(actor)

    statement = service.preview_checkout(reservation, now=local(MARCH_9, 12, 1))

    assert statement.total == Decimal("425.00")
    reservation.refresh_from_db()
    assert reservation.status == ReservationStatus.CHECKED_IN
    assert reservation.account.status == AccountStatus.OPEN
    assert AccountLine.objects.filter(account=reservation.account).count() == 0

    with pytest.raises(service.InvalidStatusError):
        service.preview_checkout(ReservationFactory(), now=local(MARCH_9, 12, 1))


def test_checkout_closes_the_account_in_the_same_transaction(actor, monkeypatch):
    reservation = t7_checked_in(actor)

    def explode(*args, **kwargs):
        raise RuntimeError("falha ao fechar a conta")

    monkeypatch.setattr(billing, "close_account", explode)

    with pytest.raises(RuntimeError):
        service.check_out(reservation, now=local(MARCH_9, 12, 1), actor=actor)

    reservation.refresh_from_db()
    assert reservation.status == ReservationStatus.CHECKED_IN
    assert AccountLine.objects.filter(account=reservation.account).count() == 0


def test_late_checkout_under_a_zero_fee_policy_still_closes(actor):
    PricingPolicyFactory(
        effective_from=local(MARCH_7, 8),
        late_fee_factor=Decimal("0"),
    )
    reservation = t7_checked_in(actor)

    statement = service.check_out(reservation, now=local(MARCH_9, 12, 1), actor=actor)

    assert statement.late_fee_applied is True
    assert statement.late_fee == Decimal("0.00")
    (late_fee,) = lines_by_kind(reservation, LineKind.LATE_FEE)
    assert late_fee.quantity == Decimal("0")
    assert late_fee.amount == Decimal("0.00")


def test_extra_line_posted_during_the_stay_enters_the_checkout_total(actor):
    """Prova da expansao: o livro aceita lancamento avulso sem tocar em reservations."""
    reservation = t7_checked_in(actor)
    billing.post_line(
        reservation.account,
        kind=LineKind.EXTRA,
        service_date=MARCH_8,
        description="Frigobar",
        quantity=Decimal("2"),
        unit_amount=Decimal("12.50"),
        posted_by=actor,
        now=local(MARCH_8, 21),
    )

    preview = service.preview_checkout(reservation, now=local(MARCH_9, 12, 1))
    assert preview.total == Decimal("450.00")

    statement = service.check_out(reservation, now=local(MARCH_9, 12, 1), actor=actor)

    assert statement.total == Decimal("450.00")
    assert statement.subtotal_extras == Decimal("25.00")
    assert statement.extras[0].description == "Frigobar"
    assert statement.subtotal_daily == Decimal("300.00")
    assert statement.subtotal_parking == Decimal("35.00")
    assert statement.late_fee == Decimal("90.00")
    assert reservation.account.total_amount == Decimal("450.00")
    assert service.statement(Reservation.objects.get(pk=reservation.pk)) == statement


def test_statement_hydrates_without_recomputing(actor, monkeypatch):
    """Prova direta: com o motor sabotado, a 2a via continua correta.

    Se `statement()` ainda recomputasse, este teste explodiria. E a diferenca
    entre um recibo que e um FATO e um recibo que e uma funcao.
    """
    reservation = t7_checked_out(actor)

    def explode(**kwargs):
        raise AssertionError("statement() nao pode recomputar o extrato")

    monkeypatch.setattr(pricing, "calculate_bill", explode)

    statement = service.statement(Reservation.objects.get(pk=reservation.pk))

    assert statement.total == Decimal("425.00")
    assert statement.late_fee == Decimal("90.00")
    assert statement.late_fee_applied is True
    assert [line.weekday_label for line in statement.lines] == ["sexta-feira", "sábado"]


def test_statement_survives_policy_change(actor):
    """Tarifa nova publicada depois do checkout nao mexe no recibo emitido."""
    reservation = t7_checked_out(actor)
    PricingPolicyFactory(
        effective_from=local(date(2025, 3, 10), 9),
        weekday_rate=Decimal("999.00"),
        weekend_rate=Decimal("999.00"),
        late_fee_factor=Decimal("0.99"),
    )

    statement = service.statement(Reservation.objects.get(pk=reservation.pk))

    assert statement.total == Decimal("425.00")
    assert [line.daily_rate for line in statement.lines] == [Decimal("120.00"), Decimal("180.00")]


def test_statement_without_lines_returns_invalid_status(actor):
    """Reserva encerrada sem linhas: 409 explicito, nunca recibo de zero diarias."""
    reservation = t7_checked_out(actor)
    AccountLine.objects.filter(account=reservation.account).delete()

    with pytest.raises(service.InvalidStatusError):
        service.statement(Reservation.objects.get(pk=reservation.pk))


def test_mark_paid_sets_actor_method_and_timestamp(actor):
    reservation = t7_checked_out(actor)
    cashier = UserFactory(username="quem-recebeu")
    paid_at = local(MARCH_9, 12, 30)

    returned = service.mark_paid(
        reservation, now=paid_at, actor=cashier, payment_method=PaymentMethod.PIX
    )

    stored = Reservation.objects.get(pk=reservation.pk)
    assert stored.account.status == AccountStatus.PAID
    assert stored.account.payment.paid_at == paid_at
    assert stored.account.payment.method == PaymentMethod.PIX
    assert stored.account.payment.received_by_id == cashier.pk
    assert stored.account.payment.amount == Decimal("425.00")
    assert returned.account.status == AccountStatus.PAID
    assert stored.status == ReservationStatus.CHECKED_OUT


def test_mark_paid_twice_is_rejected(actor):
    reservation = t7_checked_out(actor)
    first = local(MARCH_9, 12, 30)
    service.mark_paid(reservation, now=first, actor=actor, payment_method=PaymentMethod.CASH)

    with pytest.raises(billing.AccountAlreadyPaidError) as excinfo:
        service.mark_paid(
            reservation, now=local(MARCH_9, 13), actor=actor, payment_method=PaymentMethod.CARD
        )

    assert excinfo.value.code == "INVALID_STATUS"
    assert excinfo.value.extra["paid_at"] == first.isoformat()
    stored = Reservation.objects.get(pk=reservation.pk)
    assert stored.account.payment.method == PaymentMethod.CASH  # a primeira forma vence


@pytest.mark.parametrize("trait", ["checked_in", None], ids=["checked_in", "pending"])
def test_pay_before_checkout_is_rejected(actor, trait):
    reservation = ReservationFactory(**({trait: True} if trait else {}))

    with pytest.raises(service.InvalidStatusError):
        service.mark_paid(
            reservation, now=local(MARCH_9, 12), actor=actor, payment_method=PaymentMethod.PIX
        )


def test_register_payment_requires_closed_account(actor):
    """So se paga o que foi fechado: conta aberta nao aceita recebimento."""
    reservation = ReservationFactory(checked_in=True)

    with pytest.raises(billing.AccountNotClosedError):
        billing.register_payment(
            reservation.account, method=PaymentMethod.PIX, now=local(MARCH_9, 12, 30), actor=actor
        )


def test_statement_carries_the_payment_after_it_is_registered(actor):
    from hotel.reservations.serializers import build_statement

    reservation = t7_checked_out(actor)
    assert build_statement(reservation, service.statement(reservation))["payment"] is None

    service.mark_paid(
        reservation, now=local(MARCH_9, 12, 30), actor=actor, payment_method=PaymentMethod.PIX
    )

    payload = build_statement(reservation, service.statement(reservation))
    assert payload["payment"].method == PaymentMethod.PIX
    assert payload["payment"].received_by == actor
