"""
Normalizacao de documento, telefone e nacionalidade (SPEC 2.1, D9).

A coluna guarda o valor JA normalizado: a mascara digitada nao persiste.
Guest.save() e a autoridade -- qualquer caminho de escrita (API, seed, shell)
passa por aqui.

Duas familias de funcao, com propositos diferentes e por isso separadas:

* `normalize_*` sao **totais**: recebem qualquer texto e devolvem a forma
  canonica, sem recusar nada. Servem a escrita E a busca -- e por isso que
  `?search=(21) 98888` acha o valor gravado sem mascara.
* `to_e164_digits` **valida**: recusa entrada que nao seja um telefone
  internacional plausivel. Nao pode ser usada na busca (o usuario digita
  fragmento, nao numero completo), e por isso `normalize_phone` continua
  existindo, intocada.
"""

from __future__ import annotations

import re

import phonenumbers

DOCUMENT_MIN_LENGTH = 4  # alfanumericos, apos normalizacao (D9)
PHONE_MIN_LENGTH = 8  # digitos, apos normalizacao (D9)
# Maximos generosos, contando mascara: nenhum documento ou telefone real
# chega perto. Servem para recusar entrada absurda antes de gravar.
DOCUMENT_MAX_LENGTH = 40
PHONE_MAX_LENGTH = 30


def normalize_document(value: str) -> str:
    """CPF, RG, passaporte: alfanumerico maiusculo (D9).

    Passaportes `AB123456` e `CD123456` sao documentos distintos, logo
    normalizar por digitos produziria o mesmo valor e um
    `409 DUPLICATE_DOCUMENT` indevido (SPEC 0.5/D9).
    """
    return re.sub(r"[^A-Z0-9]", "", value.upper())


def normalize_phone(value: str) -> str:
    """Telefone: apenas digitos (D9) -- so a mascara de formatacao varia."""
    return re.sub(r"\D", "", value)


def to_e164_digits(raw: str) -> str:
    """Telefone internacional -> digitos E.164 SEM o `+` (D9).

    Exige o `+` explicito na entrada, e nao por preciosismo de formato: sem
    ele, `phonenumbers` interpreta os digitos como se fossem de algum pais e
    acerta o pais errado em silencio. `11933334444` (celular de Sao Paulo)
    passa como `+1 193...` dos EUA; `31...` vira Holanda; `41...`, Suica. O
    numero entra no banco com DDI errado e nunca mais volta ao dono.

    Pela mesma razao a checagem e `is_valid_number` e nao `is_possible_number`:
    a segunda so olha o comprimento, e e ela que aceitaria os casos acima.

    O `+` nao persiste: a coluna guarda so digitos, como D9 manda, e a busca
    por fragmento (`normalize_phone`) continua casando. A garantia de que o DDI
    esta la e da ENTRADA -- o banco nao distingue.
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
    """Nacionalidade: ISO 3166-1 alpha-2 em maiusculas."""
    return value.strip().upper()


# ISO 3166-1 alpha-2 oficialmente atribuidos. Um frozenset literal em vez de
# `django-countries`/`pycountry`: o que o sistema precisa e recusar `ZZ`, nao
# traduzir nomes de pais para 40 idiomas nem servir um `<select>` -- isso e
# trabalho do frontend, que ja tem a lista. Uma dependencia a mais para 249
# strings estaveis nao se paga.
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
