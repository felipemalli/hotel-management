from __future__ import annotations

from typing import Any

from django.core.exceptions import PermissionDenied as DjangoPermissionDenied
from django.http import Http404
from rest_framework import exceptions
from rest_framework.response import Response
from rest_framework.settings import api_settings
from rest_framework.views import exception_handler as drf_exception_handler

from hotel.services.errors import VALIDATION_DETAIL, DomainError

GENERIC_DETAIL = "Não foi possível processar a requisição."


class ApiError(exceptions.APIException):
    """APIException com `error_code` proprio.

    Nao se chama `code`: APIException.__init__ ja recebe um `code` (o slug do
    ErrorDetail do DRF). Sao dois conceitos.
    """

    error_code = "ERROR"
    extra: dict[str, Any] = {}


def envelope(code: str, detail: str, extra: dict[str, Any] | None = None) -> dict[str, Any]:
    return {"code": code, "detail": detail, "extra": extra or {}}


def api_exception_handler(exc: Exception, context: dict) -> Response | None:
    if isinstance(exc, DomainError):
        return Response(
            envelope(exc.code, exc.detail, extra=exc.extra),
            status=exc.status_code,
        )

    exc = _as_api_exception(exc)
    response = drf_exception_handler(exc, context)
    if response is None:
        return None

    code, extra = _classify(exc)
    response.data = envelope(code, _detail_of(exc, response), extra)
    return response


def _as_api_exception(exc: Exception) -> Exception:
    # O handler do DRF converte so na variavel local dele; sem isto,
    # PermissionDenied do Django sai como ERROR num HTTP 403.
    if isinstance(exc, Http404):
        return exceptions.NotFound(*exc.args)
    if isinstance(exc, DjangoPermissionDenied):
        return exceptions.PermissionDenied(*exc.args)
    return exc


def _classify(exc: Exception) -> tuple[str, dict[str, Any]]:
    if isinstance(exc, exceptions.ValidationError):
        return "VALIDATION_ERROR", _field_errors(exc.detail)
    error_code = getattr(exc, "error_code", None)
    if error_code:
        return str(error_code), dict(getattr(exc, "extra", None) or {})
    if isinstance(exc, exceptions.NotAuthenticated | exceptions.AuthenticationFailed):
        return "NOT_AUTHENTICATED", {}
    return str(getattr(exc, "default_code", "error")).upper(), {}


def _detail_of(exc: Exception, response: Response) -> str:
    if isinstance(exc, exceptions.ValidationError):
        return VALIDATION_DETAIL
    data = response.data
    if isinstance(data, dict) and "detail" in data:
        return str(data["detail"])
    if isinstance(data, list) and data:
        return str(data[0])
    return GENERIC_DETAIL


def _field_errors(detail: Any) -> dict[str, Any]:
    if isinstance(detail, dict):
        return {
            str(field): value if isinstance(value, list | dict) else [value]
            for field, value in detail.items()
        }
    if isinstance(detail, list):
        return {api_settings.NON_FIELD_ERRORS_KEY: detail}
    return {api_settings.NON_FIELD_ERRORS_KEY: [detail]}
