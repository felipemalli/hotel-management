"""
Hospedes na borda HTTP (SPEC 4.3, 2.2). Nomes normativos da matriz SPEC 6.3
(RF1, RF3, RF4, RF5).
"""

from datetime import timedelta

import pytest
from django.utils import timezone

from hotel.crypto import blind_index, normalize_document, normalize_phone
from hotel.models import Guest, ReservationStatus
from tests.factories import GuestFactory, ReservationFactory

pytestmark = pytest.mark.django_db

ANA = {
    "full_name": "Ana Souza",
    "document": "123.456.789-01",
    "phone": "(21) 98888-7777",
}
ANA_MASKED_DOCUMENT = "•••.•••.•89-01"
ANA_MASKED_PHONE = "(••) •••••-7777"


def test_create_guest_persists_and_masks(auth_client):
    """RF1: os 3 campos minimos persistem e a resposta ja sai mascarada (SPEC 4.3)."""
    response = auth_client.post("/api/guests/", ANA, format="json")

    assert response.status_code == 201
    assert response.data["full_name"] == "Ana Souza"
    assert response.data["document"] == ANA_MASKED_DOCUMENT
    assert response.data["phone"] == ANA_MASKED_PHONE
    assert set(response.data) == {"id", "full_name", "document", "phone", "created_at"}

    guest = Guest.objects.get(pk=response.data["id"])
    # O valor claro sobrevive com a mascara de formatacao original (SPEC 1.2)...
    assert guest.document == ANA["document"]
    assert guest.phone == ANA["phone"]
    # ...e os blind indexes ficam sincronizados (SPEC 2.1).
    assert guest.document_hash == blind_index(normalize_document(ANA["document"]))
    assert guest.phone_hash == blind_index(normalize_phone(ANA["phone"]))


def test_list_masks_pii_but_detail_returns_full_value(auth_client):
    """SPEC 2.2: listagem sempre mascarada; detalhe por id devolve o valor pleno."""
    guest = GuestFactory(full_name="Ana Souza", document="123.456.789-01", phone="(21) 98888-7777")

    listed = auth_client.get("/api/guests/").data
    assert listed["count"] == 1
    assert listed["results"][0]["document"] == ANA_MASKED_DOCUMENT
    assert listed["results"][0]["phone"] == ANA_MASKED_PHONE

    detail = auth_client.get(f"/api/guests/{guest.pk}/").data
    assert detail["document"] == "123.456.789-01"
    assert detail["phone"] == "(21) 98888-7777"


def test_duplicate_document_returns_409(auth_client):
    """D12: `document_hash` unico -- o segundo cadastro e conflito, nao payload invalido."""
    assert auth_client.post("/api/guests/", ANA, format="json").status_code == 201

    # Outra formatacao do MESMO documento: a normalizacao de D9 iguala os dois.
    response = auth_client.post("/api/guests/", {**ANA, "document": "12345678901"}, format="json")

    assert response.status_code == 409
    assert response.data["code"] == "DUPLICATE_DOCUMENT"
    assert response.data["extra"] == {}
    assert Guest.objects.count() == 1


def test_duplicate_phone_is_allowed(auth_client):
    """D12: telefone NAO e unico -- familiares compartilham a linha."""
    GuestFactory(full_name="Ana Souza", document="11111111111", phone="(21) 98888-7777")

    response = auth_client.post(
        "/api/guests/",
        {"full_name": "Bruno Souza", "document": "22222222222", "phone": "(21) 98888-7777"},
        format="json",
    )

    assert response.status_code == 201


@pytest.mark.parametrize(
    ("payload", "field"),
    [
        ({"document": "1.2", "phone": "(21) 98888-7777"}, "document"),
        ({"document": "12345678901", "phone": "(21) 9"}, "phone"),
    ],
)
def test_create_guest_validation_uses_error_envelope(auth_client, payload, field):
    """SPEC 4.3: minimos de D9 aferidos APOS normalizar; erro no envelope da SPEC 4.1."""
    response = auth_client.post(
        "/api/guests/", {"full_name": "Ana Souza", **payload}, format="json"
    )

    assert response.status_code == 400
    assert response.data["code"] == "VALIDATION_ERROR"
    assert field in response.data["extra"]


def test_missing_minimum_fields_returns_validation_error(auth_client):
    """RF1: nome, documento e telefone sao obrigatorios."""
    response = auth_client.post("/api/guests/", {}, format="json")

    assert response.status_code == 400
    assert response.data["code"] == "VALIDATION_ERROR"
    assert set(response.data["extra"]) == {"full_name", "document", "phone"}


def test_search_by_name_fragment_and_exact_pii(auth_client):
    """RF3: nome por fragmento; documento e telefone por valor exato (D5)."""
    GuestFactory(full_name="Ana Souza", document="123.456.789-01", phone="(21) 98888-7777")
    GuestFactory(full_name="Bruno Lima", document="98765432100", phone="(11) 97777-6666")

    def names(term: str) -> list[str]:
        results = auth_client.get("/api/guests/", {"search": term}).data["results"]
        return [item["full_name"] for item in results]

    assert names("sou") == ["Ana Souza"]
    assert names("12345678901") == ["Ana Souza"]  # documento sem mascara
    assert names("(21) 98888-7777") == ["Ana Souza"]  # telefone com mascara
    assert names("789") == []  # fragmento de documento NAO acha (D5)


def test_guest_not_found_returns_envelope(auth_client):
    response = auth_client.get("/api/guests/999999/")

    assert response.status_code == 404
    assert response.data["code"] == "NOT_FOUND"


def test_in_hotel_endpoint_shape(auth_client):
    """RF4: aba "no hotel" -- mascarada, com `active_reservation` unico (SPEC 4.3)."""
    today = timezone.localdate()
    inside = GuestFactory(full_name="Ana Souza", document="123.456.789-01", phone="(21) 98888-7777")
    reservation = ReservationFactory(
        guest=inside,
        checkin_date=today - timedelta(days=1),
        checkout_date=today + timedelta(days=1),
        has_vehicle=True,
        checked_in=True,
    )
    GuestFactory(full_name="Davi Rocha")  # sem reserva: nao aparece
    ReservationFactory(guest=GuestFactory(full_name="Bruno Lima"))  # PENDING: nao aparece

    response = auth_client.get("/api/guests/in-hotel/")

    assert response.status_code == 200
    assert response.data["count"] == 1
    row = response.data["results"][0]
    assert set(row) == {
        "id",
        "full_name",
        "document",
        "phone",
        "created_at",
        "active_reservation",
    }
    assert row["document"] == ANA_MASKED_DOCUMENT
    assert row["active_reservation"] == {
        "id": reservation.pk,
        "checkin_date": str(reservation.checkin_date),
        "checkout_date": str(reservation.checkout_date),
        "has_vehicle": True,
        "checked_in_at": reservation.checked_in_at.astimezone(
            timezone.get_current_timezone()
        ).isoformat(),
    }


def test_pending_checkin_endpoint_shape(auth_client):
    """RF5: aba de pendentes e plural e inclui reserva vencida (D14)."""
    today = timezone.localdate()
    guest = GuestFactory(full_name="Ana Souza", document="123.456.789-01", phone="(21) 98888-7777")
    overdue = ReservationFactory(
        guest=guest, checkin_date=today - timedelta(days=3), checkout_date=today - timedelta(days=1)
    )
    upcoming = ReservationFactory(
        guest=guest, checkin_date=today + timedelta(days=5), checkout_date=today + timedelta(days=7)
    )
    ReservationFactory(guest=GuestFactory(full_name="Bruno Lima"), checked_in=True)

    response = auth_client.get("/api/guests/pending-checkin/")

    assert response.status_code == 200
    assert response.data["count"] == 1
    row = response.data["results"][0]
    assert row["document"] == ANA_MASKED_DOCUMENT
    assert [item["id"] for item in row["pending_reservations"]] == [overdue.pk, upcoming.pk]


def test_tabs_never_leak_unmasked_pii(auth_client):
    """SPEC 2.2: nenhuma listagem, em nenhuma aba, devolve PII em claro."""
    guest = GuestFactory(full_name="Ana Souza", document="123.456.789-01", phone="(21) 98888-7777")
    ReservationFactory(guest=guest, checked_in=True)

    for path in ("/api/guests/", "/api/guests/in-hotel/"):
        rows = auth_client.get(path).data["results"]
        assert rows, path
        for row in rows:
            assert "•" in row["document"], path
            assert row["document"] != "123.456.789-01", path
            assert row["phone"] != "(21) 98888-7777", path


def test_guest_status_reflects_reservation_states(auth_client):
    """Sanidade das abas: cancelada nao esta em nenhuma delas (D8)."""
    guest = GuestFactory(full_name="Ana Souza")
    ReservationFactory(guest=guest, status=ReservationStatus.CANCELLED)

    assert auth_client.get("/api/guests/in-hotel/").data["count"] == 0
    assert auth_client.get("/api/guests/pending-checkin/").data["count"] == 0


@pytest.mark.parametrize(
    "field, value",
    [
        ("document", "1" * 41),
        ("phone", "9" * 31),
    ],
)
def test_create_guest_rejects_oversized_pii(auth_client, field, value):
    """`EncryptedCharField` e TextField: sem `max_length` o payload era ilimitado.

    O minimo ja era validado (SPEC 4.3); o maximo faltava, e um documento de
    megabytes seria cifrado e gravado sem reclamacao.
    """
    payload = {
        "full_name": "Fabio Lopes",
        "document": "999.888.777-66",
        "phone": "(11) 91234-5678",
        field: value,
    }

    response = auth_client.post("/api/guests/", payload, format="json")

    assert response.status_code == 400
    assert response.data["code"] == "VALIDATION_ERROR"
    assert field in response.data["extra"]
