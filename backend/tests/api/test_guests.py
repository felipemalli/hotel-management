from datetime import timedelta

import pytest
from django.utils import timezone

from hotel.models import Guest, ReservationStatus
from tests.factories import GuestFactory, ReservationFactory, RoomFactory

pytestmark = pytest.mark.django_db

ANA = {
    "full_name": "Ana Souza",
    "document": "123.456.789-01",
    "phone": "+55 21 98888-7777",
    "nationality": "BR",
}
ANA_STORED_DOCUMENT = "12345678901"
ANA_STORED_PHONE = "5521988887777"


def test_create_guest_persists_normalized_pii(auth_client):
    """RF1: os 3 campos minimos persistem normalizados (SPEC 4.3, D9)."""
    response = auth_client.post("/api/guests/", ANA, format="json")

    assert response.status_code == 201
    assert response.data["full_name"] == "Ana Souza"
    assert response.data["document"] == ANA_STORED_DOCUMENT
    assert response.data["phone"] == ANA_STORED_PHONE
    assert set(response.data) == {
        "id",
        "full_name",
        "document",
        "phone",
        "nationality",
        "created_at",
    }

    guest = Guest.objects.get(pk=response.data["id"])
    assert guest.document == ANA_STORED_DOCUMENT
    assert guest.phone == ANA_STORED_PHONE


def test_list_and_detail_return_the_stored_value(auth_client):
    """SPEC 2.1: listagem e detalhe devolvem o valor gravado (normalizado)."""
    guest = GuestFactory(
        full_name="Ana Souza", document="123.456.789-01", phone="+55 21 98888-7777"
    )

    listed = auth_client.get("/api/guests/").data
    assert listed["count"] == 1
    assert listed["results"][0]["document"] == ANA_STORED_DOCUMENT
    assert listed["results"][0]["phone"] == ANA_STORED_PHONE

    detail = auth_client.get(f"/api/guests/{guest.pk}/").data
    assert detail["document"] == ANA_STORED_DOCUMENT
    assert detail["phone"] == ANA_STORED_PHONE


def test_duplicate_document_returns_409(auth_client):
    """D12: `document` unico -- o segundo cadastro e conflito, nao payload invalido."""
    assert auth_client.post("/api/guests/", ANA, format="json").status_code == 201

    response = auth_client.post("/api/guests/", {**ANA, "document": "12345678901"}, format="json")

    assert response.status_code == 409
    assert response.data["code"] == "DUPLICATE_DOCUMENT"
    assert response.data["extra"] == {}
    assert Guest.objects.count() == 1


def test_duplicate_phone_is_allowed(auth_client):
    """D12: telefone NAO e unico -- familiares compartilham a linha."""
    GuestFactory(full_name="Ana Souza", document="11111111111", phone="+55 21 98888-7777")

    response = auth_client.post(
        "/api/guests/",
        {
            "full_name": "Bruno Souza",
            "document": "22222222222",
            "phone": "+55 21 98888-7777",
            "nationality": "BR",
        },
        format="json",
    )

    assert response.status_code == 201


@pytest.mark.parametrize(
    ("payload", "field"),
    [
        ({"document": "1.2", "phone": "+55 21 98888-7777"}, "document"),
        # Recusa do servico (is_valid_number), nao contagem de digitos no serializer.
        ({"document": "12345678901", "phone": "+55 21 9"}, "phone"),
    ],
)
def test_create_guest_validation_uses_error_envelope(auth_client, payload, field):
    """SPEC 4.3: minimos de D9 aferidos APOS normalizar; erro no envelope da SPEC 4.1."""
    response = auth_client.post(
        "/api/guests/",
        {"full_name": "Ana Souza", "nationality": "BR", **payload},
        format="json",
    )

    assert response.status_code == 400
    assert response.data["code"] == "VALIDATION_ERROR"
    assert field in response.data["extra"]


def test_missing_minimum_fields_returns_validation_error(auth_client):
    """RF1: nome, documento e telefone sao obrigatorios."""
    response = auth_client.post("/api/guests/", {}, format="json")

    assert response.status_code == 400
    assert response.data["code"] == "VALIDATION_ERROR"
    assert set(response.data["extra"]) == {"full_name", "document", "phone", "nationality"}


def test_search_by_name_fragment_and_pii_fragment(auth_client):
    """RF3: nome, documento e telefone por fragmento (D5)."""
    GuestFactory(full_name="Ana Souza", document="123.456.789-01", phone="+55 21 98888-7777")
    GuestFactory(full_name="Bruno Lima", document="98765432100", phone="+55 11 97777-6666")

    def names(term: str) -> list[str]:
        results = auth_client.get("/api/guests/", {"search": term}).data["results"]
        return [item["full_name"] for item in results]

    assert names("sou") == ["Ana Souza"]
    assert names("12345678901") == ["Ana Souza"]  # documento sem mascara
    assert names("+55 21 98888-7777") == ["Ana Souza"]  # telefone com mascara
    assert names("789") == ["Ana Souza"]  # fragmento de documento acha (D5)


def test_guest_not_found_returns_envelope(auth_client):
    response = auth_client.get("/api/guests/999999/")

    assert response.status_code == 404
    assert response.data["code"] == "NOT_FOUND"


def test_in_hotel_endpoint_shape(auth_client):
    """RF4: aba "no hotel" -- valor gravado, com `active_reservation` unico (SPEC 4.3)."""
    today = timezone.localdate()
    inside = GuestFactory(
        full_name="Ana Souza", document="123.456.789-01", phone="+55 21 98888-7777"
    )
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
        "nationality",
        "created_at",
        "active_reservation",
    }
    assert row["document"] == ANA_STORED_DOCUMENT
    assert row["active_reservation"] == {
        "id": reservation.pk,
        "guest_id": reservation.guest_id,
        "room": {"id": reservation.room_id, "number": reservation.room.number},
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
    guest = GuestFactory(
        full_name="Ana Souza", document="123.456.789-01", phone="+55 21 98888-7777"
    )
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
    assert row["document"] == ANA_STORED_DOCUMENT
    assert [item["id"] for item in row["pending_reservations"]] == [overdue.pk, upcoming.pk]


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
    """Documento e telefone tem max_length; payload absurdo e recusado."""
    payload = {
        "full_name": "Fabio Lopes",
        "document": "999.888.777-66",
        "phone": "+55 11 91234-5678",
        field: value,
    }

    response = auth_client.post("/api/guests/", payload, format="json")

    assert response.status_code == 400
    assert response.data["code"] == "VALIDATION_ERROR"
    assert field in response.data["extra"]


@pytest.mark.parametrize(
    "phone",
    ["(21) 98888-7777", "11933334444", "21988887777"],
    ids=["masked_without_ddi", "sao_paulo_mobile", "digits_without_ddi"],
)
def test_create_guest_without_country_code_returns_400(auth_client, phone):
    """Os dois ultimos sao a razao da regra, nao capricho de formato.

    `11933334444` e um celular de Sao Paulo; sem o `+`, a biblioteca o leria
    como `+1 193...` (EUA) e gravaria um numero que nao existe. O 400 acontece
    ANTES de qualquer escrita.
    """
    response = auth_client.post(
        "/api/guests/",
        {**ANA, "document": "55544433322", "phone": phone},
        format="json",
    )

    assert response.status_code == 400
    assert response.data["code"] == "VALIDATION_ERROR"
    assert "phone" in response.data["extra"]
    assert not Guest.objects.filter(document="55544433322").exists()


def test_foreign_phone_is_accepted(auth_client):
    response = auth_client.post(
        "/api/guests/",
        {
            "full_name": "Mary Poppins",
            "document": "P1234567",
            "phone": "+44 20 7946 0958",
            "nationality": "GB",
        },
        format="json",
    )

    assert response.status_code == 201
    assert response.data["phone"] == "442079460958"
    assert response.data["nationality"] == "GB"


def test_create_guest_requires_nationality(auth_client):
    payload = {key: value for key, value in ANA.items() if key != "nationality"}

    response = auth_client.post("/api/guests/", payload, format="json")

    assert response.status_code == 400
    assert "nationality" in response.data["extra"]


@pytest.mark.parametrize("nationality", ["ZZ", "BRA", "b"], ids=["unassigned", "alpha3", "single"])
def test_create_guest_rejects_a_nationality_outside_iso_alpha2(auth_client, nationality):
    response = auth_client.post("/api/guests/", {**ANA, "nationality": nationality}, format="json")

    assert response.status_code == 400
    assert "nationality" in response.data["extra"]


def test_search_still_finds_a_fragment_of_the_stored_phone(auth_client):
    """RF3 sobrevive ao E.164: `98888` acha, mesmo com o DDI na coluna.

    Foi por isso que `normalize_phone` continuou existindo ao lado de
    `to_e164_digits`: a busca aceita fragmento, e fragmento nunca e telefone
    valido.
    """
    auth_client.post("/api/guests/", ANA, format="json")

    for term in ["98888", "5521988887777", "+55 21 98888-7777", "(21) 98888"]:
        results = auth_client.get("/api/guests/", {"search": term}).data["results"]

        assert [item["full_name"] for item in results] == ["Ana Souza"], term


def test_pending_checkin_lists_companions(auth_client):
    """Simetria com RF4: quem acompanha depois do check-in, espera antes dele."""
    holder = GuestFactory(full_name="Bruno Lima")
    eva = GuestFactory(full_name="Eva Lima")
    reservation = ReservationFactory(guest=holder, room=RoomFactory(capacity=2))
    reservation.companions.add(eva)

    response = auth_client.get("/api/guests/pending-checkin/")

    assert response.status_code == 200
    names = [row["full_name"] for row in response.data["results"]]
    assert names == ["Bruno Lima", "Eva Lima"]
    eva_row = next(row for row in response.data["results"] if row["full_name"] == "Eva Lima")
    assert eva_row["pending_reservations"][0]["guest_id"] == holder.pk


def test_in_hotel_lists_companions(auth_client):
    holder = GuestFactory(full_name="Bruno Lima")
    eva = GuestFactory(full_name="Eva Lima")
    reservation = ReservationFactory(guest=holder, room=RoomFactory(capacity=2), checked_in=True)
    reservation.companions.add(eva)

    response = auth_client.get("/api/guests/in-hotel/")

    assert response.data["count"] == 2
    assert [row["full_name"] for row in response.data["results"]] == ["Bruno Lima", "Eva Lima"]
