from datetime import timedelta
from decimal import Decimal

import pytest
from django.utils import timezone

from hotel.billing.models import PricingPolicy

pytestmark = pytest.mark.django_db

POLICY_URL = "/api/pricing-policies/"
CURRENT_URL = "/api/pricing-policies/current/"
QUOTE_URL = "/api/pricing-policies/quote/"

HIGH_SEASON = {
    "weekday_rate": "150.00",
    "weekend_rate": "220.00",
    "weekday_park": "18.00",
    "weekend_park": "25.00",
    "late_fee_factor": "0.7500",
    "checkin_opens": "15:00",
    "checkout_limit": "11:00",
    "note": "alta temporada",
}


def test_current_policy_returns_briefing_values(auth_client):
    """Sem nenhuma publicacao, o que vale e o briefing -- pelo banco."""
    response = auth_client.get(CURRENT_URL)

    assert response.status_code == 200
    assert response.data["weekday_rate"] == "120.00"
    assert response.data["weekend_rate"] == "180.00"
    assert response.data["weekday_park"] == "15.00"
    assert response.data["weekend_park"] == "20.00"
    assert response.data["late_fee_factor"] == "0.5000"
    assert response.data["checkin_opens"] == "14:00"
    assert response.data["checkout_limit"] == "12:00"
    assert response.data["created_by"] is None


def test_create_policy_forbidden_for_attendant_403(auth_client):
    """Publicar tarifa muda o dinheiro de toda estadia futura."""
    response = auth_client.post(POLICY_URL, HIGH_SEASON, format="json")

    assert response.status_code == 403
    assert response.data["code"] == "PERMISSION_DENIED"
    assert response.data["detail"]
    assert PricingPolicy.objects.count() == 1  # so o bootstrap


def test_admin_creates_policy_201(admin_client, hotel_admin):
    response = admin_client.post(POLICY_URL, HIGH_SEASON, format="json")

    assert response.status_code == 201
    assert response.data["weekday_rate"] == "150.00"
    assert response.data["checkin_opens"] == "15:00"
    assert response.data["created_by"] == {
        "id": hotel_admin.pk,
        "username": hotel_admin.username,
    }
    assert response.data["effective_from"]

    published = PricingPolicy.objects.get(pk=response.data["id"])
    assert published.late_fee_factor == Decimal("0.7500")


def test_client_cannot_choose_the_effective_from(admin_client):
    """Vigencia retroativa reescreveria o passado de reservas ja fechadas."""
    response = admin_client.post(
        POLICY_URL,
        {**HIGH_SEASON, "effective_from": "1999-01-01T00:00:00-03:00"},
        format="json",
    )

    assert response.status_code == 201
    published = PricingPolicy.objects.get(pk=response.data["id"])
    assert published.effective_from.year > 2000


def test_create_policy_rejects_seconds_in_times(admin_client):
    """Precisao de MINUTO: a regra de 12:00 nao tem sentido em segundo.

    Sem `input_formats`, o DRF aceitaria "12:00:30" e um checkout as 12:00:29
    ficaria isento por causa de um digito que ninguem digitou de proposito.
    """
    response = admin_client.post(
        POLICY_URL, {**HIGH_SEASON, "checkout_limit": "11:00:30"}, format="json"
    )

    assert response.status_code == 400
    assert "checkout_limit" in response.data["extra"]


def test_create_policy_rejects_checkout_after_checkin(admin_client):
    response = admin_client.post(
        POLICY_URL,
        {**HIGH_SEASON, "checkin_opens": "11:00", "checkout_limit": "14:00"},
        format="json",
    )

    assert response.status_code == 400
    assert "checkout_limit" in response.data["extra"]


def test_create_policy_rejects_negative_money(admin_client):
    response = admin_client.post(
        POLICY_URL, {**HIGH_SEASON, "weekday_rate": "-1.00"}, format="json"
    )

    assert response.status_code == 400
    assert "weekday_rate" in response.data["extra"]


def test_superuser_passes_is_hotel_admin(api_client):
    """Quem foi criado por `createsuperuser` nasce com o papel default.

    Sem o `or is_superuser` em `IsHotelAdmin`, receberia 403 nas proprias rotas
    administrativas -- um 403 que nenhuma tela explica e que so se resolve por
    SQL.
    """
    from tests.factories import UserFactory

    api_client.force_authenticate(user=UserFactory(username="root", is_superuser=True))

    response = api_client.post(POLICY_URL, HIGH_SEASON, format="json")

    assert response.status_code == 201


def test_policy_history_is_newest_first(admin_client):
    admin_client.post(POLICY_URL, HIGH_SEASON, format="json")

    response = admin_client.get(POLICY_URL)

    assert response.status_code == 200
    rows = response.data["results"]
    assert len(rows) == 2
    assert rows[0]["note"] == "alta temporada"
    assert rows[1]["note"] == "tarifa do briefing (bootstrap)"


def test_policy_routes_require_authentication(api_client):
    for url in (POLICY_URL, CURRENT_URL, QUOTE_URL):
        response = api_client.get(url)

        assert response.status_code == 401, url
        assert response.data["code"] == "NOT_AUTHENTICATED", url


def test_policy_has_no_update_or_delete(admin_client, default_policy):
    """Append-only por AUSENCIA de caminho de escrita, nao por gatilho no banco.

    404 e nao 405: o viewset nao registra rota de detalhe nenhuma. Nao existe
    URL para editar politica, entao nao ha o que proteger -- corrigir um erro
    de digitacao e publicar outra linha, e a errada continua no historico.
    """
    detail = f"{POLICY_URL}{default_policy.pk}/"

    assert admin_client.patch(detail, {"weekday_rate": "1.00"}, format="json").status_code == 404
    assert admin_client.delete(detail).status_code == 404
    assert admin_client.get(detail).status_code == 404


def test_quote_endpoint_groups_weekday_and_weekend_with_parking(auth_client):
    today = timezone.localdate()
    checkin = today
    while checkin.weekday() != 4:  # sexta
        checkin += timedelta(days=1)
    checkout = checkin + timedelta(days=3)

    response = auth_client.get(
        QUOTE_URL,
        {
            "checkin_date": str(checkin),
            "checkout_date": str(checkout),
            "has_vehicle": True,
        },
    )

    assert response.status_code == 200
    assert response.data["nights"] == 3
    assert response.data["buckets"] == [
        {
            "kind": "weekday",
            "nights": 1,
            "daily_rate": "120.00",
            "parking_fee": "15.00",
            "subtotal_daily": "120.00",
            "subtotal_parking": "15.00",
        },
        {
            "kind": "weekend",
            "nights": 2,
            "daily_rate": "180.00",
            "parking_fee": "20.00",
            "subtotal_daily": "360.00",
            "subtotal_parking": "40.00",
        },
    ]
    assert response.data["subtotal_daily"] == "480.00"
    assert response.data["subtotal_parking"] == "55.00"
    assert response.data["total"] == "535.00"


def test_quote_endpoint_zeros_parking_when_there_is_no_vehicle(auth_client):
    today = timezone.localdate()
    checkout = today + timedelta(days=1)

    response = auth_client.get(
        QUOTE_URL,
        {"checkin_date": str(today), "checkout_date": str(checkout)},
    )

    assert response.status_code == 200
    assert response.data["nights"] == 1
    assert response.data["subtotal_parking"] == "0.00"
    assert len(response.data["buckets"]) == 1
    assert response.data["buckets"][0]["parking_fee"] == "0.00"


def test_quote_endpoint_uses_the_current_policy(admin_client):
    today = timezone.localdate()
    checkout = today + timedelta(days=1)

    published = admin_client.post(POLICY_URL, HIGH_SEASON, format="json")
    assert published.status_code == 201

    response = admin_client.get(
        QUOTE_URL,
        {
            "checkin_date": str(today),
            "checkout_date": str(checkout),
            "has_vehicle": True,
        },
    )

    assert response.status_code == 200
    bucket = response.data["buckets"][0]
    weekday = today.weekday() < 5
    assert bucket["daily_rate"] == ("150.00" if weekday else "220.00")
    assert bucket["parking_fee"] == ("18.00" if weekday else "25.00")


def test_quote_endpoint_rejects_an_inverted_interval(auth_client):
    today = timezone.localdate()

    response = auth_client.get(
        QUOTE_URL,
        {"checkin_date": str(today + timedelta(days=2)), "checkout_date": str(today)},
    )

    assert response.status_code == 400
    assert "checkout_date" in response.data["extra"]


def test_quote_endpoint_requires_the_dates(auth_client):
    response = auth_client.get(QUOTE_URL)

    assert response.status_code == 400
    assert set(response.data["extra"]) == {"checkin_date", "checkout_date"}
