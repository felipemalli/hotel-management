"""
Criptografia de PII, blind index e mascaramento (SPEC 2.1-2.2).

Cifrar `document`/`phone` e permitir `LIKE '%...%'` sobre eles sao objetivos
incompativeis sem searchable encryption (D5). O desenho aqui e o trade-off
registrado na SPEC:

* confidencialidade: valor real cifrado com Fernet (`fields.EncryptedCharField`);
* buscabilidade exata: coluna paralela `*_hash` com HMAC-SHA256 do valor
  normalizado -- normalizacao POR TIPO (D9), nunca uma unica regra;
* busca parcial: apenas `full_name`, que nao e cifrado.
"""

from __future__ import annotations

import hmac
import re
from functools import lru_cache
from hashlib import sha256

from cryptography.fernet import Fernet, MultiFernet
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured

MASK_CHAR = "•"  # bullet: mesmo caractere da tabela SPEC 2.2
VISIBLE_TAIL = 4

DOCUMENT_MIN_LENGTH = 4  # alfanumericos, apos normalizacao (D9)
PHONE_MIN_LENGTH = 8  # digitos, apos normalizacao (D9)
# Maximos generosos, contando mascara: nenhum documento ou telefone real
# chega perto. Servem para recusar entrada absurda antes de cifrar.
DOCUMENT_MAX_LENGTH = 40
PHONE_MAX_LENGTH = 30


def normalize_document(value: str) -> str:
    """CPF, RG, passaporte: alfanumerico maiusculo (D9).

    Passaportes `AB123456` e `CD123456` sao documentos distintos, logo
    normalizar por digitos produziria o mesmo blind index e um
    `409 DUPLICATE_DOCUMENT` indevido (SPEC 0.5/D9).
    """
    return re.sub(r"[^A-Z0-9]", "", value.upper())


def normalize_phone(value: str) -> str:
    """Telefone: apenas digitos (D9) -- so a mascara de formatacao varia."""
    return re.sub(r"\D", "", value)


def blind_index(normalized: str) -> str:
    """HMAC-SHA256 do valor JA normalizado, com pepper de `settings.HASH_PEPPER`."""
    return hmac.new(_pepper(), normalized.encode(), sha256).hexdigest()


def mask_pii(value: str) -> str:
    """Preserva separadores e mascara os alfanumericos, exceto os 4 ultimos.

    Regra unica da SPEC 2.2: `123.456.789-01` -> `...89-01`,
    `(21) 98888-7777` -> `(..) .....-7777`, `AB123456` -> `....3456`.
    """
    total = sum(1 for char in value if char.isalnum())
    remaining = total - VISIBLE_TAIL
    masked: list[str] = []
    for char in value:
        if char.isalnum() and remaining > 0:
            masked.append(MASK_CHAR)
            remaining -= 1
        else:
            masked.append(char)
    return "".join(masked)


def fernet() -> MultiFernet:
    """Cifrador da chave corrente, tolerante a chaves antigas (SPEC 2.1).

    `FIELD_ENCRYPTION_KEY` aceita uma lista separada por virgula: a PRIMEIRA
    chave cifra, as demais apenas decifram. Sem isso, girar a chave depois de
    um incidente tornaria todo `Guest` ilegivel de uma vez -- `InvalidToken`
    em cada leitura, que o handler da SPEC 4.1 nao classifica e viraria 500 em
    todo endpoint de hospede. Com a lista, a rotacao e: publicar `nova,antiga`,
    rodar `manage.py rotate_pii`, remover a antiga.
    """
    raw = getattr(settings, "FIELD_ENCRYPTION_KEY", "") or ""
    keys = tuple(part.strip() for part in raw.split(",") if part.strip())
    if not keys:
        raise ImproperlyConfigured(
            "FIELD_ENCRYPTION_KEY ausente: PII nao pode ser cifrada em repouso (SPEC 2.1)."
        )
    return _fernet_for(keys)


def _pepper() -> bytes:
    pepper = getattr(settings, "HASH_PEPPER", "") or ""
    if not pepper:
        raise ImproperlyConfigured(
            "HASH_PEPPER ausente: o blind index seria previsivel (SPEC 2.1)."
        )
    return pepper.encode()


@lru_cache(maxsize=4)
def _fernet_for(keys: tuple[str, ...]) -> MultiFernet:
    # MultiFernet cifra com a primeira e tenta decifrar na ordem dada.
    return MultiFernet([Fernet(key.encode()) for key in keys])
