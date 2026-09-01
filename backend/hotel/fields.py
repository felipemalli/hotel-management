"""Campo de modelo com cifra em repouso (SPEC 2.1)."""

from __future__ import annotations

from django.db import models

from hotel.crypto import fernet


class EncryptedCharField(models.TextField):
    """Texto cifrado com Fernet (AES-128-CBC + HMAC) na coluna.

    `TextField` porque o ciphertext base64 e bem maior que o valor claro.
    Fernet e nao-deterministico de proposito: duas cifras do mesmo valor
    diferem, logo esta coluna nao serve a busca -- quem busca e a coluna
    paralela `*_hash` (blind index, SPEC 2.1/D5).
    """

    def get_prep_value(self, value: str | None) -> str | None:
        if value is None:
            return None
        return fernet().encrypt(str(value).encode()).decode()

    def from_db_value(self, value: str | None, expression, connection) -> str | None:
        if value is None:
            return None
        return fernet().decrypt(value.encode()).decode()
