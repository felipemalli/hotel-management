"""
Autenticacao JWT (SPEC 2.3, 4.2). Nomes normativos da matriz SPEC 6.3 (RF8).
"""

import pytest

from tests.factories import DEFAULT_PASSWORD

pytestmark = pytest.mark.django_db

PROTECTED_PATHS = [
    "/api/guests/",
    "/api/guests/in-hotel/",
    "/api/guests/pending-checkin/",
    "/api/reservations/",
]

OPEN_PATHS = ["/api/health/", "/api/schema/", "/api/docs/"]


def test_login_returns_access_refresh(api_client, attendant):
    """RF8: login devolve o par de tokens da SPEC 4.2."""
    response = api_client.post(
        "/api/auth/token/",
        {"username": attendant.username, "password": DEFAULT_PASSWORD},
        format="json",
    )

    assert response.status_code == 200
    assert set(response.data) == {"access", "refresh"}
    assert response.data["access"]


def test_endpoints_require_auth(api_client):
    """RF8: sem token nao ha app -- e o erro sai no envelope da SPEC 4.1."""
    for path in PROTECTED_PATHS:
        response = api_client.get(path)

        assert response.status_code == 401, path
        assert response.data["code"] == "NOT_AUTHENTICATED", path
        assert response.data["detail"]
        assert response.data["extra"] == {}


def test_access_token_authorizes_protected_endpoint(api_client, attendant):
    """O access token emitido pelo login abre a porta de verdade (nao so o mock)."""
    tokens = api_client.post(
        "/api/auth/token/",
        {"username": attendant.username, "password": DEFAULT_PASSWORD},
        format="json",
    ).data

    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {tokens['access']}")
    response = api_client.get("/api/guests/")

    assert response.status_code == 200


def test_refresh_returns_new_access(api_client, attendant):
    """`ROTATE_REFRESH_TOKENS = False` (SPEC 2.3): refresh devolve so o access."""
    tokens = api_client.post(
        "/api/auth/token/",
        {"username": attendant.username, "password": DEFAULT_PASSWORD},
        format="json",
    ).data

    response = api_client.post(
        "/api/auth/token/refresh/", {"refresh": tokens["refresh"]}, format="json"
    )

    assert response.status_code == 200
    assert "access" in response.data
    assert "refresh" not in response.data


def test_invalid_credentials_use_error_envelope(api_client, attendant):
    """Credencial errada tambem passa pelo envelope unico (SPEC 4.1)."""
    response = api_client.post(
        "/api/auth/token/",
        {"username": attendant.username, "password": "senha-errada"},
        format="json",
    )

    assert response.status_code == 401
    assert response.data["code"] == "NOT_AUTHENTICATED"


def test_open_paths_need_no_token(api_client):
    """As excecoes AllowAny da SPEC 2.3 seguem abertas apos ligar a permissao global."""
    for path in OPEN_PATHS:
        assert api_client.get(path).status_code == 200, path
