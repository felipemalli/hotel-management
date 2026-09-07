from datetime import timedelta

import pytest
from django.conf import settings
from django.contrib.auth.models import AnonymousUser
from django.test import override_settings
from rest_framework.test import APIRequestFactory
from rest_framework_simplejwt.tokens import RefreshToken

from accounts.permissions import IsHotelAdmin
from accounts.views import LoginRateThrottle, RefreshRateThrottle
from tests.factories import DEFAULT_PASSWORD, UserFactory

pytestmark = pytest.mark.django_db

REFRESH_COOKIE = settings.REFRESH_COOKIE_NAME


def sign_in(client, user):
    response = client.post(
        "/api/auth/token/",
        {"username": user.username, "password": DEFAULT_PASSWORD},
        format="json",
    )
    assert response.status_code == 200
    return response


PROTECTED_PATHS = [
    "/api/auth/me/",
    "/api/guests/",
    "/api/guests/in-hotel/",
    "/api/guests/pending-checkin/",
    "/api/reservations/",
]

OPEN_PATHS = ["/api/health/", "/api/schema/", "/api/docs/"]


# `Secure` segue COOKIE_SECURE, que o compose desliga para a demo em http; o que se
# prova aqui e o formato de producao, independente do ambiente em que a suite roda.
@override_settings(REFRESH_COOKIE_SECURE=True)
def test_login_returns_access_and_sets_refresh_cookie(api_client, attendant):
    response = sign_in(api_client, attendant)

    assert set(response.data) == {"access"}
    assert response.data["access"]

    cookie = response.cookies[REFRESH_COOKIE]
    assert cookie.value
    assert cookie["httponly"] is True
    assert cookie["secure"] is True
    assert cookie["samesite"] == "Strict"
    assert cookie["path"] == "/api/auth/"
    assert int(cookie["max-age"]) == 12 * 3600

    # O double-submit precisa que o JS leia este: HttpOnly aqui quebraria o header.
    assert response.cookies["csrftoken"]["httponly"] == ""


@override_settings(REFRESH_COOKIE_SECURE=False)
def test_refresh_cookie_drops_secure_when_the_demo_runs_over_http(api_client, attendant):
    """Safari e IPs de rede descartam cookie `Secure` sobre http: a demo precisa desligar."""
    response = sign_in(api_client, attendant)

    assert response.cookies[REFRESH_COOKIE]["secure"] == ""


def test_endpoints_require_auth(api_client):
    """Sem token nao ha app -- e o erro sai no envelope unico de erros."""
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


def test_refresh_reads_the_cookie_and_does_not_extend_the_session(api_client, attendant):
    """O cookie nasce no login e nao muda: renovar devolve um access, nao uma sessao nova."""
    sign_in(api_client, attendant)
    issued = api_client.cookies[REFRESH_COOKIE].value

    response = api_client.post("/api/auth/token/refresh/", {}, format="json")

    assert response.status_code == 200
    assert set(response.data) == {"access"}
    assert REFRESH_COOKIE not in response.cookies
    assert api_client.cookies[REFRESH_COOKIE].value == issued


def test_refresh_stops_at_the_session_deadline(api_client, attendant):
    """O `exp` do refresh, fixado no login, e o teto absoluto: vencido, so o login reabre."""
    token = RefreshToken.for_user(attendant)
    token.set_exp(lifetime=timedelta(seconds=-1))
    api_client.cookies[REFRESH_COOKIE] = str(token)

    response = api_client.post("/api/auth/token/refresh/", {}, format="json")

    assert response.status_code == 401
    assert response.data["code"] == "NOT_AUTHENTICATED"


def test_refresh_without_cookie_is_unauthenticated(api_client):
    response = api_client.post("/api/auth/token/refresh/", {}, format="json")

    assert response.status_code == 401
    assert response.data["code"] == "NOT_AUTHENTICATED"


def test_a_refused_refresh_clears_the_cookie(api_client, attendant):
    api_client.cookies[REFRESH_COOKIE] = "nao-e-um-jwt"

    response = api_client.post("/api/auth/token/refresh/", {}, format="json")

    assert response.status_code == 401
    assert response.cookies[REFRESH_COOKIE].value == ""


def test_refresh_requires_the_csrf_header(csrf_client, attendant):
    login = sign_in(csrf_client, attendant)
    csrftoken = login.cookies["csrftoken"].value

    recusado = csrf_client.post("/api/auth/token/refresh/", {}, format="json")

    assert recusado.status_code == 403
    assert recusado.data["code"] == "CSRF_FAILED"

    aceito = csrf_client.post(
        "/api/auth/token/refresh/", {}, format="json", HTTP_X_CSRFTOKEN=csrftoken
    )

    assert aceito.status_code == 200


def test_the_proxy_origin_is_trusted_and_a_foreign_one_is_not(csrf_client, attendant):
    """O proxy do Vite repassa o Origin, e o test client so o manda se pedirem."""
    login = sign_in(csrf_client, attendant)
    csrftoken = login.cookies["csrftoken"].value

    def refresh(origin):
        return csrf_client.post(
            "/api/auth/token/refresh/",
            {},
            format="json",
            HTTP_X_CSRFTOKEN=csrftoken,
            HTTP_ORIGIN=origin,
        )

    assert refresh("http://localhost:5173").status_code == 200
    assert refresh("http://evil.example.com").status_code == 403


def test_refresh_has_its_own_rate_budget(api_client, attendant, monkeypatch):
    monkeypatch.setattr(LoginRateThrottle, "rate", "1/min", raising=False)
    monkeypatch.setattr(RefreshRateThrottle, "rate", "3/min", raising=False)

    sign_in(api_client, attendant)

    codes = [
        api_client.post("/api/auth/token/refresh/", {}, format="json").status_code for _ in range(4)
    ]

    assert codes == [200, 200, 200, 429]


def test_logout_revokes_the_refresh_and_clears_the_cookie(api_client, attendant):
    sign_in(api_client, attendant)
    revoked = api_client.cookies[REFRESH_COOKIE].value

    response = api_client.post("/api/auth/logout/")

    assert response.status_code == 204
    assert response.cookies[REFRESH_COOKIE].value == ""

    api_client.cookies[REFRESH_COOKIE] = revoked
    assert api_client.post("/api/auth/token/refresh/", {}, format="json").status_code == 401


def test_logout_is_idempotent_and_needs_no_valid_access(api_client, attendant):
    assert api_client.post("/api/auth/logout/").status_code == 204

    sign_in(api_client, attendant)
    assert api_client.post("/api/auth/logout/").status_code == 204
    assert api_client.post("/api/auth/logout/").status_code == 204

    api_client.cookies[REFRESH_COOKIE] = "nao-e-um-jwt"
    assert api_client.post("/api/auth/logout/").status_code == 204


def test_logout_requires_the_csrf_header(csrf_client, attendant):
    sign_in(csrf_client, attendant)

    response = csrf_client.post("/api/auth/logout/")

    assert response.status_code == 403
    assert response.data["code"] == "CSRF_FAILED"


def test_invalid_credentials_use_error_envelope(api_client, attendant):
    """Credencial errada tambem passa pelo envelope unico."""
    response = api_client.post(
        "/api/auth/token/",
        {"username": attendant.username, "password": "senha-errada"},
        format="json",
    )

    assert response.status_code == 401
    assert response.data["code"] == "NOT_AUTHENTICATED"


def test_open_paths_need_no_token(api_client):
    """As excecoes AllowAny seguem abertas apos ligar a permissao global."""
    for path in OPEN_PATHS:
        assert api_client.get(path).status_code == 200, path


def test_login_is_rate_limited(api_client, attendant, monkeypatch):
    """Forca bruta no login encontra 429, nao 401 infinito.

    O endpoint e anonimo: sem limite de taxa nada barra tentativas de senha.
    O `Throttled` do DRF cai no fallback do handler e sai no envelope unico
    com `code: "THROTTLED"`.
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
    nasce com o papel default e receberia 403 nas proprias rotas administrativas
    da API. Ja `is_staff` sozinho e recusado de proposito: sem o admin do Django
    instalado a flag nao significa nada aqui, e privilegio nao se concede por
    coluna sem semantica.
    """
    request = APIRequestFactory().get("/api/rooms/")
    request.user = UserFactory(username=f"papel-{'-'.join(traits) or 'nenhum'}", **traits)

    assert IsHotelAdmin().has_permission(request, None) is expected


def test_is_hotel_admin_refuses_the_anonymous_user():
    request = APIRequestFactory().get("/api/rooms/")
    request.user = AnonymousUser()

    assert IsHotelAdmin().has_permission(request, None) is False
