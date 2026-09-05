from __future__ import annotations

from django.conf import settings
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework_simplejwt.settings import api_settings


def read_refresh_cookie(request: Request) -> str | None:
    return request.COOKIES.get(settings.REFRESH_COOKIE_NAME) or None


def set_refresh_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        settings.REFRESH_COOKIE_NAME,
        token,
        max_age=int(api_settings.REFRESH_TOKEN_LIFETIME.total_seconds()),
        httponly=True,
        secure=settings.REFRESH_COOKIE_SECURE,
        samesite="Strict",
        path=settings.REFRESH_COOKIE_PATH,
    )


def delete_refresh_cookie(response: Response) -> None:
    # O path faz parte da identidade do cookie: sem repeti-lo o delete nao casa nada.
    response.delete_cookie(settings.REFRESH_COOKIE_NAME, path=settings.REFRESH_COOKIE_PATH)


__all__ = ["delete_refresh_cookie", "read_refresh_cookie", "set_refresh_cookie"]
