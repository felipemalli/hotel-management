"""Shim de compatibilidade: o envelope vive em `core.exceptions`."""

from __future__ import annotations

from core.exceptions import GENERIC_DETAIL, ApiError, api_exception_handler, envelope

__all__ = ["GENERIC_DETAIL", "ApiError", "api_exception_handler", "envelope"]
