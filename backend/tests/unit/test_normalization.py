import pytest

from hotel.guests.normalization import (
    ISO_3166_ALPHA2,
    normalize_country,
    normalize_document,
    normalize_phone,
    to_e164_digits,
)


@pytest.mark.parametrize(
    "raw, expected",
    [
        ("123.456.789-01", "12345678901"),
        ("123 456 789 01", "12345678901"),
        ("ab123456", "AB123456"),
        ("ab-123.456", "AB123456"),
        ("MG 12.345.678", "MG12345678"),
    ],
)
def test_normalize_document_keeps_uppercase_alphanumerics(raw, expected):
    assert normalize_document(raw) == expected


@pytest.mark.parametrize(
    "raw, expected",
    [
        ("(21) 98888-7777", "21988887777"),
        ("21 98888 7777", "21988887777"),
        ("+55 (21) 98888-7777", "5521988887777"),
    ],
)
def test_normalize_phone_keeps_digits_only(raw, expected):
    assert normalize_phone(raw) == expected


@pytest.mark.parametrize(
    "raw, expected",
    [
        ("+55 (21) 98888-7777", "5521988887777"),
        ("+55 21 98888 7777", "5521988887777"),
        ("+1 212 555 0199", "12125550199"),
        ("+44 20 7946 0958", "442079460958"),
        ("  +55 21 98888-7777  ", "5521988887777"),
    ],
)
def test_to_e164_digits_accepts_international_numbers(raw, expected):
    """A saida e digito puro: o `+` nao persiste, so garante a entrada."""
    assert to_e164_digits(raw) == expected


@pytest.mark.parametrize(
    "raw",
    [
        "(21) 98888-7777",  # sem DDI nenhum
        "11933334444",  # celular de SP: seria lido como +1 193... (EUA)
        "31988887777",  # seria lido como Holanda
        "41988887777",  # seria lido como Suica
        "+99 12345678",  # DDI que nao existe
        "+55 21 9",  # curto demais para o plano brasileiro
        "",
        "   ",
    ],
)
def test_to_e164_digits_rejects_missing_plus_or_invalid_number(raw):
    """Os tres do meio sao a razao de exigir `+` e usar `is_valid_number`.

    Sem o `+`, `phonenumbers` chuta um pais e acerta o errado em silencio:
    `11933334444` (Sao Paulo) passa como numero dos EUA, `31...` como Holanda,
    `41...` como Suica. `is_possible_number` -- que so mede comprimento --
    aceitaria os tres. O numero entraria no banco com DDI errado e nunca mais
    voltaria ao dono.
    """
    with pytest.raises(ValueError):
        to_e164_digits(raw)


def test_normalize_phone_still_accepts_fragments_for_search():
    """A funcao de BUSCA continua total: fragmento nao e telefone valido.

    Se `to_e164_digits` tivesse substituido `normalize_phone`, `?search=98888`
    levantaria erro em vez de achar a Ana -- a busca morreria junto com a validacao.
    """
    assert normalize_phone("98888") == "98888"
    assert normalize_phone("(21) 98888") == "2198888"


@pytest.mark.parametrize("code", ["BR", "AR", "PT", "US", "JP", "ZA"])
def test_nationality_accepts_iso_alpha2(code):
    assert code in ISO_3166_ALPHA2


@pytest.mark.parametrize("code", ["ZZ", "XX", "BRA", "b", "", "QQ"])
def test_nationality_must_be_iso_alpha2(code):
    """`ZZ` e user-assigned, nao pais: a lista e a dos codigos atribuidos."""
    assert code not in ISO_3166_ALPHA2


def test_iso_list_has_the_249_assigned_codes():
    """Numero fixo de proposito: um `split()` mal editado calaria a lista.

    Uma entrada perdida por um espaco a menos faria um pais legitimo virar
    `400 nationality` -- falha que so aparece com um hospede daquele pais no
    balcao.
    """
    assert len(ISO_3166_ALPHA2) == 249
    assert all(len(code) == 2 and code.isupper() for code in ISO_3166_ALPHA2)


@pytest.mark.parametrize(
    "raw, expected",
    [("br", "BR"), (" ar ", "AR"), ("Pt", "PT")],
)
def test_normalize_country_upcases_and_trims(raw, expected):
    assert normalize_country(raw) == expected
