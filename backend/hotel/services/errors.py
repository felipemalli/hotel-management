"""Shim de compatibilidade: os helpers vivem em `core.errors`."""

from __future__ import annotations

from core.errors import (
    VALIDATION_DETAIL,
    DomainError,
    DomainValidationError,
    constraint_name,
    translate_integrity_error,
)

__all__ = [
    "VALIDATION_DETAIL",
    "DomainError",
    "DomainValidationError",
    "constraint_name",
    "translate_integrity_error",
]
