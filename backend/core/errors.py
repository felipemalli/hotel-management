from __future__ import annotations

from collections.abc import Callable, Iterator, Mapping
from contextlib import contextmanager
from typing import Any

from django.db import IntegrityError, transaction

VALIDATION_DETAIL = "Dados inválidos."


class DomainError(Exception):
    code = "ERROR"
    status_code = 409
    default_detail = "Operação inválida."

    def __init__(self, detail: str | None = None, extra: dict[str, Any] | None = None) -> None:
        self.detail = detail or self.default_detail
        self.extra = extra or {}
        super().__init__(self.detail)


class DomainValidationError(DomainError):
    """Entrada recusada — 400 no mesmo formato por campo do ValidationError do DRF."""

    code = "VALIDATION_ERROR"
    status_code = 400
    default_detail = VALIDATION_DETAIL

    def __init__(self, field: str, message: str) -> None:
        super().__init__(detail=None, extra={field: [message]})


def constraint_name(exc: IntegrityError) -> str | None:
    """Nome estruturado da constraint (psycopg diag), nao substring da mensagem."""
    diag = getattr(getattr(exc, "__cause__", None), "diag", None)
    return getattr(diag, "constraint_name", None)


@contextmanager
def translate_integrity_error(
    errors: Mapping[str, Callable[[], DomainError]],
) -> Iterator[None]:
    """Traduz violacao de constraint em erro de dominio, por nome.

    O atomic interno e o savepoint: sem ele o IntegrityError aborta a transacao
    do chamador e o 409 seguinte vira 500. Nome desconhecido sobe intacto.
    """
    try:
        with transaction.atomic():
            yield
    except IntegrityError as exc:
        factory = errors.get(constraint_name(exc) or "")
        if factory is None:
            raise
        raise factory() from exc
