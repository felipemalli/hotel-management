from __future__ import annotations

from rest_framework import exceptions, status
from rest_framework.authentication import SessionAuthentication
from rest_framework.request import Request


class CsrfFailed(exceptions.APIException):
    status_code = status.HTTP_403_FORBIDDEN
    error_code = "CSRF_FAILED"
    default_detail = "Requisição sem token CSRF válido."


def enforce_csrf(request: Request) -> None:
    try:
        SessionAuthentication().enforce_csrf(request)
    except exceptions.PermissionDenied as error:
        reason = str(error.detail).removeprefix("CSRF Failed: ")
        raise CsrfFailed(f"Requisição sem token CSRF válido: {reason}") from error


__all__ = ["CsrfFailed", "enforce_csrf"]
