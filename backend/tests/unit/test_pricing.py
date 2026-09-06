from dataclasses import replace
from datetime import datetime, time
from decimal import Decimal

import pytest

from hotel.billing import engine as pricing

D = Decimal


def dt(day: int, hour: int, minute: int = 0, second: int = 0) -> datetime:
    """Datetime em marco/2025, o calendario de referencia da SPEC 3.3."""
    return datetime(2025, 3, day, hour, minute, second)


# id, check-in, checkout, vaga, linhas (dia, tarifa, vaga), diarias, vagas, base multa, multa, total
TRUTH_TABLE = [
    pytest.param(
        dt(3, 15),
        dt(5, 11),
        False,
        [(3, "segunda-feira", D("120.00"), D("0.00")), (4, "terça-feira", D("120.00"), D("0.00"))],
        D("240.00"),
        D("0.00"),
        None,
        D("0.00"),
        D("240.00"),
        id="T1",
    ),
    pytest.param(
        dt(8, 14),
        dt(10, 10),
        True,
        [(8, "sábado", D("180.00"), D("20.00")), (9, "domingo", D("180.00"), D("20.00"))],
        D("360.00"),
        D("40.00"),
        None,
        D("0.00"),
        D("400.00"),
        id="T2",
    ),
    pytest.param(
        dt(7, 16),
        dt(10, 11, 30),
        True,
        [
            (7, "sexta-feira", D("120.00"), D("15.00")),
            (8, "sábado", D("180.00"), D("20.00")),
            (9, "domingo", D("180.00"), D("20.00")),
        ],
        D("480.00"),
        D("55.00"),
        None,
        D("0.00"),
        D("535.00"),
        id="T3",
    ),
    pytest.param(
        dt(4, 14),
        dt(6, 11, 59),
        False,
        [(4, "terça-feira", D("120.00"), D("0.00")), (5, "quarta-feira", D("120.00"), D("0.00"))],
        D("240.00"),
        D("0.00"),
        None,
        D("0.00"),
        D("240.00"),
        id="T4",
    ),
    pytest.param(
        dt(4, 14),
        dt(6, 12, 1),
        False,
        [(4, "terça-feira", D("120.00"), D("0.00")), (5, "quarta-feira", D("120.00"), D("0.00"))],
        D("240.00"),
        D("0.00"),
        D("120.00"),
        D("60.00"),
        D("300.00"),
        id="T5",
    ),
    pytest.param(
        dt(7, 15),
        dt(9, 11, 59),
        False,
        [(7, "sexta-feira", D("120.00"), D("0.00")), (8, "sábado", D("180.00"), D("0.00"))],
        D("300.00"),
        D("0.00"),
        None,
        D("0.00"),
        D("300.00"),
        id="T6",
    ),
    pytest.param(
        dt(7, 15),
        dt(9, 12, 1),
        True,
        [(7, "sexta-feira", D("120.00"), D("15.00")), (8, "sábado", D("180.00"), D("20.00"))],
        D("300.00"),
        D("35.00"),
        D("180.00"),
        D("90.00"),
        D("425.00"),
        id="T7",
    ),
    pytest.param(
        dt(5, 18),
        dt(7, 12, 0, 0),
        False,
        [(5, "quarta-feira", D("120.00"), D("0.00")), (6, "quinta-feira", D("120.00"), D("0.00"))],
        D("240.00"),
        D("0.00"),
        None,
        D("0.00"),
        D("240.00"),
        id="T8",
    ),
    pytest.param(
        dt(3, 14),
        dt(3, 18),
        True,
        [(3, "segunda-feira", D("120.00"), D("15.00"))],
        D("120.00"),
        D("15.00"),
        D("120.00"),
        D("60.00"),
        D("195.00"),
        id="T9",
    ),
]


def bill_of(checkin, checkout, has_vehicle, rates=pricing.DEFAULT_RATES) -> pricing.Bill:
    """A tabela-verdade e escrita em datetimes locais; o motor so aceita date/time."""
    return pricing.calculate_bill(
        checkin_day=checkin.date(),
        checkout_day=checkout.date(),
        checkout_time=checkout.time(),
        has_vehicle=has_vehicle,
        rates=rates,
    )


@pytest.mark.parametrize(
    (
        "checkin, checkout, has_vehicle, expected_lines, expected_daily, "
        "expected_parking, expected_late_base, expected_late_fee, expected_total"
    ),
    TRUTH_TABLE,
)
def test_truth_table(
    checkin,
    checkout,
    has_vehicle,
    expected_lines,
    expected_daily,
    expected_parking,
    expected_late_base,
    expected_late_fee,
    expected_total,
):
    bill = bill_of(checkin, checkout, has_vehicle)

    assert [
        (line.date.day, line.weekday_label, line.daily_rate, line.parking_fee)
        for line in bill.lines
    ] == expected_lines
    assert bill.subtotal_daily == expected_daily
    assert bill.subtotal_parking == expected_parking
    assert bill.late_fee_applied is (expected_late_base is not None)
    assert bill.late_fee_base == expected_late_base
    assert bill.late_fee == expected_late_fee
    assert bill.total == expected_total


# Mesmas entradas da tabela; aqui prova-se o tipo.
STAY_INPUTS = [pytest.param(*case.values[:3], id=case.id) for case in TRUTH_TABLE]


@pytest.mark.parametrize("checkin, checkout, has_vehicle", STAY_INPUTS)
def test_truth_table_amounts_are_decimal_with_two_places(checkin, checkout, has_vehicle):
    bill = bill_of(checkin, checkout, has_vehicle)

    amounts = [bill.subtotal_daily, bill.subtotal_parking, bill.late_fee, bill.total]
    amounts += [line.daily_rate for line in bill.lines]
    amounts += [line.parking_fee for line in bill.lines]
    for amount in amounts:
        assert isinstance(amount, Decimal), "dinheiro e sempre Decimal (SPEC 0.3)"
        assert -amount.as_tuple().exponent == 2


@pytest.mark.parametrize(
    "now, expected",
    [
        (dt(3, 0, 0, 0), True),
        (dt(3, 13, 59, 59), True),
        (dt(3, 14, 0, 0), False),
        (dt(3, 14, 0, 1), False),
        (dt(3, 23, 59, 59), False),
    ],
)
def test_early_checkin_boundaries(now, expected):
    """14:00:00 em ponto ja permite o check-in; 13:59:59 alerta (SPEC 3.3/D4)."""
    assert pricing.early_checkin(now.time()) is expected


@pytest.mark.parametrize(
    "now, expected",
    [
        (dt(3, 0, 0, 0), False),
        (dt(3, 11, 59, 59), False),
        (dt(3, 12, 0, 0), False),
        (dt(3, 12, 0, 1), True),
        (dt(3, 23, 59, 59), True),
    ],
)
def test_late_checkout_boundaries(now, expected):
    """`ate as 12h00min` inclui o limite: 12:00:00 e isento (SPEC 3.3/T8/D3)."""
    assert pricing.late_checkout(now.time()) is expected


def test_stay_dates_is_semi_open_interval():
    """Uma diaria por data em [check-in, checkout) -- a data de saida nao entra (D1)."""
    assert [day.day for day in pricing.stay_dates(dt(3, 15).date(), dt(6, 11).date())] == [3, 4, 5]


def test_stay_dates_charges_one_daily_for_day_use():
    """Intervalo vazio (day-use) cobra a diaria do dia do check-in (D1)."""
    assert pricing.stay_dates(dt(3, 14).date(), dt(3, 18).date()) == [dt(3, 0).date()]


def test_parking_is_zero_without_vehicle():
    assert pricing.parking_fee(dt(8, 12).date(), has_vehicle=False) == Decimal("0.00")
    assert pricing.parking_fee(dt(8, 12).date(), has_vehicle=True) == Decimal("20.00")
    assert pricing.parking_fee(dt(3, 12).date(), has_vehicle=True) == Decimal("15.00")


def test_weekend_rates_follow_the_date_of_the_daily():
    assert pricing.daily_rate(dt(7, 12).date()) == Decimal("120.00")
    assert pricing.daily_rate(dt(8, 12).date()) == Decimal("180.00")
    assert pricing.daily_rate(dt(9, 12).date()) == Decimal("180.00")
    assert pricing.daily_rate(dt(10, 12).date()) == Decimal("120.00")


def test_quantize_money_rounds_half_up():
    assert pricing.quantize_money(Decimal("0.005")) == Decimal("0.01")
    assert pricing.quantize_money(Decimal("90.004")) == Decimal("90.00")


def test_bill_is_immutable():
    """Extrato congelado: ninguem ajusta um total depois de calculado."""
    bill = bill_of(dt(3, 15), dt(5, 11), False)
    with pytest.raises(AttributeError):
        bill.total = Decimal("0.00")


def test_rate_table_is_a_parameter_not_a_global():
    """SPEC 3.1: a tarifa entra por argumento, e o passado permanece reconstituivel.

    O caso T1 (seg 03 15:00 -> qua 05 11:00, sem vaga) vale 240,00 com as
    tarifas do briefing. Com uma tabela futura de 140,00 a diaria, a MESMA
    estadia vale 280,00 -- e o motor devolve um ou outro conforme a tabela que
    recebe, em vez de reescrever o historico quando um valor global mudar.
    """
    future_rates = pricing.RateTable(
        weekday_rate=D("140.00"),
        weekend_rate=D("200.00"),
        weekday_park=D("18.00"),
        weekend_park=D("25.00"),
        late_fee_factor=D("0.5"),
    )

    with_default = bill_of(dt(3, 15), dt(5, 11), False)
    with_future = bill_of(dt(3, 15), dt(5, 11), False, rates=future_rates)

    assert with_default.total == D("240.00")  # tabela SPEC 3.3, caso T1
    assert with_future.total == D("280.00")


def test_rate_table_reaches_parking_and_late_fee():
    """A tabela custom vale para vaga e multa, nao so para a diaria.

    Sex 07 15:00 -> dom 09 12:01 com vaga e o caso T7 (425,00 no default).
    Com a tabela futura: diarias 140 + 200 = 340, vagas 18 + 25 = 43, multa
    50% x 200 (domingo, dia da saida -- D3) = 100. Total 483,00.
    """
    future_rates = pricing.RateTable(
        weekday_rate=D("140.00"),
        weekend_rate=D("200.00"),
        weekday_park=D("18.00"),
        weekend_park=D("25.00"),
        late_fee_factor=D("0.5"),
    )

    bill = bill_of(dt(7, 15), dt(9, 12, 1), True, rates=future_rates)

    assert bill.subtotal_daily == D("340.00")
    assert bill.subtotal_parking == D("43.00")
    assert bill.late_fee_base == D("200.00")
    assert bill.late_fee == D("100.00")
    assert bill.total == D("483.00")


def test_default_rates_carry_briefing_times():
    """Os horarios do briefing sao campos com default, nao constantes soltas."""
    assert pricing.DEFAULT_RATES.checkin_opens == time(14, 0)
    assert pricing.DEFAULT_RATES.checkout_limit == time(12, 0)


def test_rate_table_times_are_parameters():
    """Trocar o horario troca a decisao, sem tocar no modulo.

    Enquanto 14h/12h eram constantes de modulo, "configurar o horario" exigiria
    monkeypatch -- e a regra passaria a depender de estado global. Como campo
    com default, a politica de 15:00 e apenas outro argumento, e as 9 tuplas da
    tabela SPEC 3.3 seguem construidas posicionalmente sem mudar um byte.
    """
    late_shift = replace(pricing.DEFAULT_RATES, checkin_opens=time(15, 0))

    assert pricing.early_checkin(dt(3, 14, 30).time(), late_shift) is True
    assert pricing.early_checkin(dt(3, 14, 30).time()) is False
    assert pricing.early_checkin(dt(3, 15, 0).time(), late_shift) is False


def test_checkout_limit_is_a_parameter_and_the_exact_minute_is_exempt():
    generous = replace(pricing.DEFAULT_RATES, checkout_limit=time(13, 0))

    assert pricing.late_checkout(dt(3, 12, 30).time()) is True
    assert pricing.late_checkout(dt(3, 12, 30).time(), generous) is False
    # O limite em ponto continua isento, seja ele qual for.
    assert pricing.late_checkout(dt(3, 13, 0, 0).time(), generous) is False
    assert pricing.late_checkout(dt(3, 13, 0, 1).time(), generous) is True


def test_calculate_bill_uses_the_checkout_limit_from_the_rates():
    """A multa segue o limite da politica, nao a constante do modulo (D15).

    Sem repassar `rates` a `late_checkout`, uma politica com limite as 13:00
    ainda multaria a saida as 12:30: os valores viriam da politica e a decisao
    de multar, do modulo -- incoerencia silenciosa dentro do mesmo extrato.
    """
    generous = replace(pricing.DEFAULT_RATES, checkout_limit=time(13, 0))

    bill = bill_of(dt(3, 15), dt(5, 12, 30), False, rates=generous)

    assert bill.late_fee_applied is False
    assert bill.late_fee == D("0.00")
    assert bill.total == D("240.00")
