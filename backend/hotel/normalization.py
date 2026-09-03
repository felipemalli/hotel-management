"""
Normalizacao de documento e telefone (SPEC 2.1, D9).

A coluna guarda o valor JA normalizado: a mascara digitada nao persiste.
Guest.save() e a autoridade -- qualquer caminho de escrita (API, seed, shell)
passa por aqui.
"""

from __future__ import annotations

import re

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
