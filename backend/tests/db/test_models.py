from datetime import timedelta

import pytest
from django.db import IntegrityError, connection, transaction

from hotel.guests.normalization import normalize_document, normalize_phone
from hotel.models import Guest, ReservationStatus
from tests.factories import GuestFactory, ReservationFactory, local_datetime

pytestmark = pytest.mark.django_db


def test_guest_save_normalizes_pii():
    guest = GuestFactory(document="123.456.789-01", phone="+55 21 98888-7777")

    assert guest.document == normalize_document("123.456.789-01")
    assert guest.phone == normalize_phone("+55 21 98888-7777")


def test_normalization_is_idempotent_across_formats():
    """Cadastrado com mascara, encontrado sem ela -- e vice-versa (D9)."""
    GuestFactory(document="123.456.789-01", phone="+55 21 98888-7777")

    assert Guest.objects.filter(document=normalize_document("12345678901")).exists()
    assert Guest.objects.filter(phone=normalize_phone("5521988887777")).exists()


def test_save_with_update_fields_also_normalizes():
    """Trocar o documento com mascara tem de gravar o valor normalizado."""
    guest = GuestFactory(document="111.111.111-11")

    guest.document = "222.222.222-22"
    guest.save(update_fields=["document"])

    stored = Guest.objects.get(pk=guest.pk)
    assert stored.document == "22222222222"

    guest.phone = "+55 31 91111-2222"
    guest.save(update_fields=["phone"])

    stored.refresh_from_db()
    assert stored.phone == "5531911112222"


def test_pii_is_plaintext_at_rest():
    """Leitura crua da coluna devolve o valor normalizado (SPEC 2.1)."""
    guest = GuestFactory(document="123.456.789-01", phone="+55 21 98888-7777")

    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT document, phone FROM hotel_guest WHERE id = %s",
            [guest.id],
        )
        stored_document, stored_phone = cursor.fetchone()

    assert stored_document == "12345678901"
    assert stored_phone == "5521988887777"


def test_document_is_unique_across_formats():
    """D12: o segundo cadastro do mesmo documento nao existe."""
    GuestFactory(document="123.456.789-01")

    with pytest.raises(IntegrityError), transaction.atomic():
        GuestFactory(document="12345678901")


def test_phone_is_not_unique():
    """Familiares compartilham telefone (D12)."""
    GuestFactory(document="111.111.111-11", phone="+55 21 98888-7777")
    GuestFactory(document="222.222.222-22", phone="+55 21 98888-7777")

    assert Guest.objects.filter(phone=normalize_phone("5521988887777")).count() == 2


def test_guest_requires_nationality():
    """NOT NULL no banco: a coluna nao aceita hospede sem nacionalidade."""
    with pytest.raises(IntegrityError), transaction.atomic():
        with connection.cursor() as cursor:
            cursor.execute(
                "INSERT INTO hotel_guest "
                "(full_name, document, phone, nationality, created_at, updated_at) "
                "VALUES (%s, %s, %s, NULL, NOW(), NOW())",
                ["Sem Pais", "77766655544", "5521988887777"],
            )


def test_guest_save_upcases_the_nationality():
    """`Guest.save()` e a autoridade da normalizacao, tambem aqui (D9)."""
    guest = GuestFactory(nationality="ar")

    assert Guest.objects.get(pk=guest.pk).nationality == "AR"


def test_checkout_date_must_be_after_checkin_date():
    """Constraint resv_checkout_after_checkin: agendamento minimo de 1 noite (D13)."""
    guest = GuestFactory()

    with pytest.raises(IntegrityError), transaction.atomic():
        ReservationFactory(
            guest=guest,
            checkin_date=guest.created_at.date(),
            checkout_date=guest.created_at.date(),
        )


def test_only_one_checked_in_reservation_per_guest():
    """Constraint resv_one_active_per_guest: a aba "no hotel" nunca duplica."""
    guest = GuestFactory()
    today = ReservationFactory(guest=guest, checked_in=True).checkin_date

    with pytest.raises(IntegrityError), transaction.atomic():
        ReservationFactory(
            guest=guest,
            checkin_date=today + timedelta(days=5),
            checkout_date=today + timedelta(days=7),
            checked_in=True,
        )


def test_checked_out_requires_timestamp_and_frozen_total():
    """Constraint resv_checked_out_complete: estado terminal sem extrato nao entra."""
    reservation = ReservationFactory(checked_in=True)
    reservation.status = ReservationStatus.CHECKED_OUT

    with pytest.raises(IntegrityError), transaction.atomic():
        reservation.save(update_fields=["status"])


def test_checked_out_trait_satisfies_the_constraint():
    reservation = ReservationFactory(checked_out=True, has_vehicle=True)

    assert reservation.status == ReservationStatus.CHECKED_OUT
    assert reservation.total_amount is not None
    assert reservation.checked_out_at is not None


def test_guest_with_reservations_is_protected_from_deletion():
    """on_delete=PROTECT: hospede com historico financeiro nao some (SPEC 1.3)."""
    reservation = ReservationFactory()

    with pytest.raises(IntegrityError), transaction.atomic():
        reservation.guest.delete()


def test_reservation_defaults_are_pending_and_unpriced():
    reservation = ReservationFactory()

    assert reservation.status == ReservationStatus.PENDING
    assert reservation.checked_in_at is None
    assert reservation.checked_out_at is None
    assert reservation.total_amount is None
    assert reservation.late_fee is None


@pytest.mark.parametrize(
    "column, index_name, pattern",
    [
        ("full_name", "guest_name_trgm_upper", "%ana%"),
        ("document", "guest_document_trgm_upper", "%789%"),
        ("phone", "guest_phone_trgm_upper", "%98888%"),
    ],
)
def test_icontains_uses_the_functional_trigram_index(column, index_name, pattern):
    """Regressao do spike V4/V5 (SPEC 1.4): o indice funcional casa o SQL do icontains."""
    GuestFactory(full_name="Ana Souza", document="123.456.789-01", phone="+55 21 98888-7777")
    GuestFactory(full_name="Mariana Costa", document="987.654.321-00", phone="+55 11 97777-6666")

    with connection.cursor() as cursor:
        # SET LOCAL: some com o rollback da transacao do teste.
        cursor.execute("SET LOCAL enable_seqscan = off")
        cursor.execute(
            f'EXPLAIN SELECT id FROM hotel_guest WHERE UPPER("{column}"::text) LIKE UPPER(%s)',
            [pattern],
        )
        plan = "\n".join(row[0] for row in cursor.fetchall())

    assert index_name in plan, plan


def test_str_is_readable():
    guest = GuestFactory(full_name="Ana Souza")
    reservation = ReservationFactory(guest=guest)

    assert str(guest) == "Ana Souza"
    assert str(reservation.checkin_date) in str(reservation)


def test_local_datetime_helper_is_aware():
    guest = GuestFactory()
    moment = local_datetime(guest.created_at.date(), guest.created_at.time())

    assert moment.utcoffset() is not None


def test_bulk_create_is_refused_instead_of_writing_a_broken_row():
    """`bulk_create` nao chama `save()`, e e o `save()` que normaliza.

    Antes o hospede nascia com a mascara digitada: invisivel para a busca
    por fragmento normalizado e para a unicidade de documento, sem erro nenhum.
    """
    with pytest.raises(NotImplementedError, match="document/phone"):
        Guest.objects.bulk_create(
            [Guest(full_name="Elena Prado", document="555.666.777-88", phone="+55 11 90000-1111")]
        )

    assert not Guest.objects.filter(full_name="Elena Prado").exists()
