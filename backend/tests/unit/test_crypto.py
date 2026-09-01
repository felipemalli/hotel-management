"""
Normalizacao por tipo, blind index e mascaramento (SPEC 2.1-2.2).

Puro: usa apenas `settings.HASH_PEPPER`/`FIELD_ENCRYPTION_KEY`, sem banco.
"""

import pytest
from cryptography.fernet import Fernet, InvalidToken

from hotel.crypto import (
    blind_index,
    fernet,
    mask_pii,
    normalize_document,
    normalize_phone,
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
    """D9: documento e alfanumerico maiusculo -- passaporte nao perde as letras."""
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
    """D9: telefone e digitos -- so a mascara de formatacao varia."""
    assert normalize_phone(raw) == expected


def test_blind_index_is_stable_across_formatting():
    formats = ["123.456.789-01", "12345678901", "123 456 789/01"]
    hashes = {blind_index(normalize_document(value)) for value in formats}
    assert len(hashes) == 1
    assert len(hashes.pop()) == 64


def test_blind_index_separates_passports_that_share_digits():
    """Normalizar por digitos daria o mesmo hash e um DUPLICATE_DOCUMENT falso (SPEC 0.5/D9)."""
    assert blind_index(normalize_document("AB123456")) != blind_index(
        normalize_document("CD123456")
    )


def test_blind_index_does_not_leak_the_value():
    assert "12345678901" not in blind_index(normalize_document("123.456.789-01"))


@pytest.mark.parametrize(
    "raw, expected",
    [
        ("123.456.789-01", "•••.•••.•89-01"),
        ("(21) 98888-7777", "(••) •••••-7777"),
        ("AB123456", "••••3456"),
        ("1234", "1234"),
        ("123", "123"),
    ],
)
def test_mask_pii_keeps_separators_and_last_four_alphanumerics(raw, expected):
    """Regra unica da SPEC 2.2, identica a tabela de valores expostos."""
    assert mask_pii(raw) == expected


def test_fernet_roundtrip_and_non_determinism():
    ciphertext = fernet().encrypt(b"123.456.789-01").decode()
    other = fernet().encrypt(b"123.456.789-01").decode()
    assert ciphertext != other, "Fernet e nao-deterministico: a coluna nao serve a busca"
    assert fernet().decrypt(ciphertext.encode()).decode() == "123.456.789-01"


def test_fernet_requires_the_configured_key(settings):
    settings.FIELD_ENCRYPTION_KEY = Fernet.generate_key().decode()
    ciphertext = fernet().encrypt(b"segredo")
    settings.FIELD_ENCRYPTION_KEY = Fernet.generate_key().decode()
    with pytest.raises(InvalidToken):
        fernet().decrypt(ciphertext)
