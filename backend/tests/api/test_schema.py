import pytest

pytestmark = pytest.mark.django_db

EXPECTED_PATHS = [
    "/api/auth/token/",
    "/api/auth/token/refresh/",
    "/api/auth/me/",
    "/api/health/",
    "/api/guests/",
    "/api/guests/{id}/",
    "/api/guests/in-hotel/",
    "/api/guests/pending-checkin/",
    "/api/reservations/",
    "/api/reservations/{id}/check-in/",
    "/api/reservations/{id}/checkout/",
    "/api/reservations/{id}/cancel/",
    "/api/reservations/{id}/pay/",
    "/api/pricing-policies/",
    "/api/pricing-policies/current/",
    "/api/rooms/",
    "/api/rooms/{id}/",
    "/api/rooms/available/",
]

CUSTOM_ACTIONS = [
    "/api/reservations/{id}/check-in/",
    "/api/reservations/{id}/checkout/",
    "/api/reservations/{id}/cancel/",
    "/api/reservations/{id}/pay/",
]


@pytest.fixture
def schema(api_client) -> dict:
    response = api_client.get("/api/schema/", {"format": "json"})
    assert response.status_code == 200
    return response.data


def test_schema_covers_every_endpoint_of_the_contract(schema):
    missing = [path for path in EXPECTED_PATHS if path not in schema["paths"]]
    assert missing == []


def test_custom_actions_are_documented(schema):
    """SPEC 4.4: cada action custom traz summary, request/response e erro 409."""
    for path in CUSTOM_ACTIONS:
        operation = schema["paths"][path]["post"]
        assert operation["summary"], path
        assert operation["description"], path
        assert "200" in operation["responses"], path
        assert "409" in operation["responses"], path


def test_docs_page_renders(api_client):
    response = api_client.get("/api/docs/")

    assert response.status_code == 200
    assert b"swagger" in response.content.lower()


def test_docs_page_is_csp_exempt_while_api_is_not(api_client):
    """SPEC 2.4: o bootstrap inline do Swagger exige isencao pontual (V2)."""
    docs = api_client.get("/api/docs/")
    api = api_client.get("/api/health/")

    assert "Content-Security-Policy" not in docs.headers
    directives = {
        part.strip() for part in api.headers["Content-Security-Policy"].split(";") if part.strip()
    }
    assert directives == {
        "default-src 'self'",
        "img-src 'self' data:",
        "frame-ancestors 'none'",
    }


def test_security_headers_are_present(api_client):
    """SPEC 2.4: nosniff, referrer-policy e clickjacking."""
    headers = api_client.get("/api/health/").headers

    assert headers["X-Content-Type-Options"] == "nosniff"
    assert headers["Referrer-Policy"] == "same-origin"
    assert headers["X-Frame-Options"] == "DENY"
