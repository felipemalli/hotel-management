from datetime import UTC, date, datetime, time
from decimal import Decimal

import pytest
from django.db import IntegrityError, transaction

from hotel.models import PricingPolicy, ReservationStatus
from hotel.selectors import policy_in_force
from hotel.services import pricing
from hotel.services import reservations as service
from hotel.services.catalog import create_policy, rate_table_of
from tests.factories import PricingPolicyFactory, ReservationFactory, UserFactory

pytestmark = pytest.mark.django_db

SAO_PAULO = pytest.importorskip("zoneinfo").ZoneInfo("America/Sao_Paulo")

MARCH_7 = date(2025, 3, 7)  # sexta
MARCH_9 = date(2025, 3, 9)  # domingo


def local(day: date, hour: int, minute: int = 0, second: int = 0) -> datetime:
    return datetime.combine(day, time(hour, minute, second), tzinfo=SAO_PAULO)


@pytest.fixture
def actor():
    return UserFactory(username="admin-da-politica", admin=True)


def test_default_policy_row_matches_default_rates(default_policy):
    """A linha da data migration e `DEFAULT_RATES` sao o MESMO briefing.

    A migration escreve literais de proposito (registro historico nao importa
    constante de codigo), e e este teste que impede as duas fontes de
    divergirem. Sem ele, mudar `DEFAULT_RATES` deixaria o banco com a tarifa
    antiga e nenhum teste falharia.
    """
    rates = rate_table_of(default_policy)

    assert rates == pricing.DEFAULT_RATES
    assert default_policy.created_by is None  # ninguem publicou: e o bootstrap
    assert default_policy.effective_from == datetime(2000, 1, 1, tzinfo=UTC)


def test_bootstrap_policy_covers_dates_in_the_past(default_policy):
    """A sentinela em 2000 e o que faz o seed e os testes de 2025 funcionarem.

    Com `effective_from` no instante do `migrate`, `policy_in_force` de
    qualquer data anterior devolveria nada -- e o seed, que faz check-in
    "ontem", abortaria dentro da cadeia de subida do compose.
    """
    assert policy_in_force(local(MARCH_7, 15)) == default_policy


def test_policy_in_force_without_bootstrap_fails_loudly():
    """Banco sem bootstrap e bug de operacao, nao erro de dominio.

    Um codigo de envelope aqui fingiria que o cliente resolve mudando a
    requisicao. O traceback e a resposta honesta.
    """
    PricingPolicy.objects.all().delete()

    with pytest.raises(RuntimeError, match="migrate"):
        policy_in_force(local(MARCH_7, 15))


def test_policy_in_force_picks_latest_by_effective_from_then_id(default_policy):
    older = PricingPolicyFactory(effective_from=local(MARCH_7, 8))
    same_instant = PricingPolicyFactory(effective_from=local(MARCH_7, 10))
    latest = PricingPolicy.objects.create(
        weekday_rate=Decimal("130.00"),
        weekend_rate=Decimal("190.00"),
        weekday_park=Decimal("15.00"),
        weekend_park=Decimal("20.00"),
        late_fee_factor=Decimal("0.5"),
        checkin_opens=time(14, 0),
        checkout_limit=time(12, 0),
        effective_from=same_instant.effective_from,
    )

    assert policy_in_force(local(MARCH_7, 9)) == older
    assert policy_in_force(local(MARCH_7, 11)) == latest
    assert policy_in_force(local(MARCH_7, 7)) == default_policy


def test_create_policy_records_actor_and_server_side_effective_from(actor):
    now = local(MARCH_7, 9, 30)

    policy = create_policy(
        actor=actor,
        now=now,
        weekday_rate=Decimal("130.00"),
        weekend_rate=Decimal("200.00"),
        weekday_park=Decimal("18.00"),
        weekend_park=Decimal("25.00"),
        late_fee_factor=Decimal("0.75"),
        checkin_opens=time(15, 0),
        checkout_limit=time(11, 0),
        note="alta temporada",
    )

    assert policy.effective_from == now
    assert policy.created_by_id == actor.pk
    assert policy.note == "alta temporada"


def test_create_policy_rejects_checkout_after_checkin(actor):
    """O quarto tem de ser desocupado antes de ser reocupado.

    Invertido, a mesma diaria pertenceria a duas estadias. A CHECK do banco e a
    autoridade; o servico existe para dar a mensagem por campo.
    """
    with pytest.raises(service.DomainValidationError) as excinfo:
        create_policy(
            actor=actor,
            now=local(MARCH_7, 9),
            weekday_rate=Decimal("120.00"),
            weekend_rate=Decimal("180.00"),
            weekday_park=Decimal("15.00"),
            weekend_park=Decimal("20.00"),
            late_fee_factor=Decimal("0.5"),
            checkin_opens=time(11, 0),
            checkout_limit=time(14, 0),
        )

    assert "checkout_limit" in excinfo.value.extra


def test_policy_checkout_after_checkin_violates_constraint():
    with pytest.raises(IntegrityError), transaction.atomic():
        PricingPolicy.objects.create(
            weekday_rate=Decimal("120.00"),
            weekend_rate=Decimal("180.00"),
            weekday_park=Decimal("15.00"),
            weekend_park=Decimal("20.00"),
            late_fee_factor=Decimal("0.5"),
            checkin_opens=time(11, 0),
            checkout_limit=time(14, 0),
            effective_from=local(MARCH_7, 9),
        )


@pytest.mark.parametrize(
    "field",
    ["weekday_rate", "weekend_rate", "weekday_park", "weekend_park", "late_fee_factor"],
)
def test_policy_money_must_be_non_negative(field):
    values = {
        "weekday_rate": Decimal("120.00"),
        "weekend_rate": Decimal("180.00"),
        "weekday_park": Decimal("15.00"),
        "weekend_park": Decimal("20.00"),
        "late_fee_factor": Decimal("0.5"),
        "checkin_opens": time(14, 0),
        "checkout_limit": time(12, 0),
        "effective_from": local(MARCH_7, 9),
    }
    values[field] = Decimal("-1.00")

    with pytest.raises(IntegrityError), transaction.atomic():
        PricingPolicy.objects.create(**values)


def test_reservation_checked_in_without_policy_violates_constraint():
    """`resv_active_has_policy`: reserva no hotel sem politica nao existe.

    Sem a constraint, uma escrita que esquecesse a amarracao deixaria a linha
    com `policy_id NULL`, e o checkout estouraria com `AttributeError` -- 500
    numa operacao de balcao legitima.
    """
    reservation = ReservationFactory(checkin_date=MARCH_7, checkout_date=MARCH_9)
    reservation.status = ReservationStatus.CHECKED_IN
    reservation.checked_in_at = local(MARCH_7, 15)

    with pytest.raises(IntegrityError), transaction.atomic():
        reservation.save(update_fields=["status", "checked_in_at"])


def test_checkin_binds_policy_in_force_at_now(actor, default_policy):
    reservation = ReservationFactory(checkin_date=MARCH_7, checkout_date=MARCH_9)

    service.check_in(reservation, now=local(MARCH_7, 15), actor=actor)

    reservation.refresh_from_db()
    assert reservation.policy_id == default_policy.pk


def test_checkout_limit_and_factor_come_from_bound_policy_not_current(actor):
    """D15, o caso concreto: politica A na entrada, B publicada durante a estadia.

    A amarrada tem limite 12:00 e fator 0.5; a nova tem 13:00 e 0.25. A saida
    as 12:30 e ATRASO sob A. Ler o limite da vigente no checkout faria diaria e
    multa virem de politicas diferentes dentro do mesmo extrato.
    """
    reservation = ReservationFactory(checkin_date=MARCH_7, checkout_date=MARCH_9, has_vehicle=True)
    service.check_in(reservation, now=local(MARCH_7, 15), actor=actor)

    PricingPolicyFactory(
        effective_from=local(date(2025, 3, 8), 10),
        checkout_limit=time(13, 0),
        late_fee_factor=Decimal("0.25"),
        weekday_rate=Decimal("999.00"),
        weekend_rate=Decimal("999.00"),
    )

    bill = service.check_out(reservation, now=local(MARCH_9, 12, 30), actor=actor)

    assert bill.subtotal_daily == Decimal("300.00")
    assert bill.subtotal_parking == Decimal("35.00")
    assert bill.late_fee_applied is True
    assert bill.late_fee == Decimal("90.00")
    assert bill.total == Decimal("425.00")


def test_early_checkin_message_follows_the_policy(actor):
    """A mensagem para de mentir quando o horario muda.

    O literal "14:00" estava no `default_detail` e era asseverado byte a byte
    na borda HTTP: com uma politica de 15:00, o sistema recusaria o check-in as
    14:30 dizendo "permitido a partir das 14:00".
    """
    PricingPolicyFactory(effective_from=local(MARCH_7, 8), checkin_opens=time(15, 0))
    reservation = ReservationFactory(checkin_date=MARCH_7, checkout_date=MARCH_9)

    with pytest.raises(service.EarlyCheckinError) as excinfo:
        service.check_in(reservation, now=local(MARCH_7, 14, 30), actor=actor)

    assert excinfo.value.detail == "Check-in permitido a partir das 15:00."
    assert excinfo.value.extra == {"server_time": "14:30", "opens_at": "15:00"}


def test_checkin_opens_comes_from_the_policy_in_force_not_the_bound_one(actor):
    """O unico valor que NAO pode vir da amarrada: ela e criada aqui (D15)."""
    PricingPolicyFactory(effective_from=local(MARCH_7, 8), checkin_opens=time(13, 0))
    reservation = ReservationFactory(checkin_date=MARCH_7, checkout_date=MARCH_9)

    # 13:30 seria cedo na default (14:00) e nao e na vigente.
    returned = service.check_in(reservation, now=local(MARCH_7, 13, 30), actor=actor)

    assert returned.status == ReservationStatus.CHECKED_IN
