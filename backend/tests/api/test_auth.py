import pytest
from django.contrib.auth.models import AnonymousUser
from rest_framework.test import APIRequestFactory

from accounts.permissions import IsHotelAdmin
from accounts.views import LoginRateThrottle
from tests.factories import DEFAULT_PASSWORD, UserFactory

pytestmark = pytest.mark.django_db

PROTECTED_PATHS = [
    "/api/auth/me/",
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


def test_login_is_rate_limited(api_client, attendant, monkeypatch):
    """Forca bruta no login encontra 429, nao 401 infinito.

    O endpoint e anonimo: sem limite de taxa nada barra tentativas de senha.
    O `Throttled` do DRF cai no fallback do handler e sai no envelope da
    SPEC 4.1 com `code: "THROTTLED"`.
    """
    # DRF captura THROTTLE_RATES no import da classe; settings.REST_FRAMEWORK nao basta.
    monkeypatch.setattr(LoginRateThrottle, "rate", "3/min", raising=False)

    codes = [
        api_client.post(
            "/api/auth/token/",
            {"username": attendant.username, "password": "senha-errada"},
            format="json",
        ).status_code
        for _ in range(4)
    ]

    assert codes[:3] == [401, 401, 401]
    assert codes[3] == 429

    blocked = api_client.post(
        "/api/auth/token/",
        {"username": attendant.username, "password": DEFAULT_PASSWORD},
        format="json",
    )
    assert blocked.status_code == 429
    assert blocked.data["code"] == "THROTTLED"


def test_login_throttle_ignores_a_spoofed_forwarded_for(api_client, attendant, monkeypatch):
    """O limite conta por REMOTE_ADDR, nao pelo header que o cliente escolhe.

    Com o default do DRF (`NUM_PROXIES = None`) o `get_ident` usa
    `X-Forwarded-For` quando ele vem. Como o gunicorn atende direto, bastava
    girar o header para ter tentativas ilimitadas -- medido: 14 senhas erradas
    com XFF rotativo, nenhum 429. Throttle contornavel e pior que nenhum,
    porque parece resolvido.
    """
    monkeypatch.setattr(LoginRateThrottle, "rate", "3/min", raising=False)

    codes = [
        api_client.post(
            "/api/auth/token/",
            {"username": attendant.username, "password": "senha-errada"},
            format="json",
            HTTP_X_FORWARDED_FOR=f"10.0.0.{attempt}",
        ).status_code
        for attempt in range(4)
    ]

    assert codes == [401, 401, 401, 429]


def test_me_returns_role(auth_client, attendant):
    """O access token carrega so `user_id`: o papel vem desta rota.

    Sem ela o frontend teria de descobrir o papel por tentativa e erro (bater
    numa rota de admin e ler o 403). Papel como claim no token seria pior:
    claim nao expira quando o papel muda, so quando o token expira.
    """
    response = auth_client.get("/api/auth/me/")

    assert response.status_code == 200
    assert response.data == {
        "id": attendant.pk,
        "username": attendant.username,
        "role": "ATTENDANT",
    }


def test_me_reports_the_admin_role(admin_client, hotel_admin):
    response = admin_client.get("/api/auth/me/")

    assert response.status_code == 200
    assert response.data["role"] == "ADMIN"


def test_me_requires_authentication(api_client):
    response = api_client.get("/api/auth/me/")

    assert response.status_code == 401
    assert response.data["code"] == "NOT_AUTHENTICATED"


@pytest.mark.parametrize(
    "traits, expected",
    [
        ({}, False),
        ({"admin": True}, True),
        ({"is_superuser": True}, True),
        ({"is_staff": True}, False),
    ],
    ids=["attendant", "role_admin", "superuser", "staff_only"],
)
def test_is_hotel_admin_accepts_role_or_superuser(traits, expected):
    """`role == ADMIN` OU superusuario -- e `is_staff` nao conta.

    O `or is_superuser` nao e cortesia: quem foi criado por `createsuperuser`
    para o /admin/ nasce com o papel default e receberia 403 nas proprias rotas
    administrativas da API. Ja `is_staff` sozinho e recusado de proposito: ele
    significa "entra no /admin/", e o Django admin nao e caminho de escrita
    deste dominio.
    """
    request = APIRequestFactory().get("/api/rooms/")
    request.user = UserFactory(username=f"papel-{'-'.join(traits) or 'nenhum'}", **traits)

    assert IsHotelAdmin().has_permission(request, None) is expected


def test_is_hotel_admin_refuses_the_anonymous_user():
    request = APIRequestFactory().get("/api/rooms/")
    request.user = AnonymousUser()

    assert IsHotelAdmin().has_permission(request, None) is False
