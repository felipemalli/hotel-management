from __future__ import annotations

import re

import phonenumbers

DOCUMENT_MIN_LENGTH = 4
PHONE_MIN_LENGTH = 8
DOCUMENT_MAX_LENGTH = 40
PHONE_MAX_LENGTH = 30


def normalize_document(value: str) -> str:
    """Alfanumerico maiusculo. Passaportes AB123456 e CD123456 sao documentos distintos."""
    return re.sub(r"[^A-Z0-9]", "", value.upper())


def normalize_phone(value: str) -> str:
    return re.sub(r"\D", "", value)


def to_e164_digits(raw: str) -> str:
    """Telefone internacional -> digitos E.164 sem o `+`.

    Exige `+` na entrada: sem ele, phonenumbers interpreta os digitos como de
    algum pais e acerta o pais errado em silencio (`119...` vira EUA).
    is_valid_number, nao is_possible_number (este so olha comprimento).
    """
    if not raw.strip().startswith("+"):
        raise ValueError("telefone precisa comecar com + e o codigo do pais")

    try:
        parsed = phonenumbers.parse(raw, None)
    except phonenumbers.NumberParseException as exc:
        raise ValueError("telefone ilegivel") from exc

    if not phonenumbers.is_valid_number(parsed):
        raise ValueError("telefone invalido para o codigo do pais informado")

    formatted = phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.E164)
    return formatted.lstrip("+")


def normalize_country(value: str) -> str:
    return value.strip().upper()


# ISO 3166-1 alpha-2. Literal, nao django-countries: so precisamos recusar ZZ.
ISO_3166_ALPHA2 = frozenset(
    """
    AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ
    BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ
    CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ
    DE DJ DK DM DO DZ
    EC EE EG EH ER ES ET
    FI FJ FK FM FO FR
    GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY
    HK HM HN HR HT HU
    ID IE IL IM IN IO IQ IR IS IT
    JE JM JO JP
    KE KG KH KI KM KN KP KR KW KY KZ
    LA LB LC LI LK LR LS LT LU LV LY
    MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ
    NA NC NE NF NG NI NL NO NP NR NU NZ
    OM
    PA PE PF PG PH PK PL PM PN PR PS PT PW PY
    QA
    RE RO RS RU RW
    SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ
    TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ
    UA UG UM US UY UZ
    VA VC VE VG VI VN VU
    WF WS
    YE YT
    ZA ZM ZW
    """.split()
)
