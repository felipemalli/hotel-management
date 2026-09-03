"""
Normalizacao por tipo (SPEC 2.1, D9).

Puro: sem banco, sem settings.
"""

import pytest

from hotel.normalization import normalize_document, normalize_phone


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
