from datetime import date, datetime, time
from decimal import Decimal
from zoneinfo import ZoneInfo

import pytest
from django.db import IntegrityError, transaction
from django.db.models import Sum

from core import errors
from hotel.billing import engine as pricing
from hotel.billing.models import AccountLine, LineKind
from hotel.guests import services as guests_service
from hotel.guests.models import GUEST_DOCUMENT_UNIQUE, Guest
from hotel.reservations import services as service
from hotel.reservations.errors import ReservationError
from hotel.reservations.models import Reservation, ReservationStatus
from hotel.reservations.statement import Statement
from tests.factories import (
    GuestFactory,
    PricingPolicyFactory,
    ReservationFactory,
    RoomFactory,
    UserFactory,
)

pytestmark = pytest.mark.django_db

SAO_PAULO = ZoneInfo("America/Sao_Paulo")
UTC = ZoneInfo("UTC")

# Calendario de referencia da SPEC 3.3: marco/2025.
MARCH_7 = date(2025, 3, 7)  # sexta
MARCH_9 = date(2025, 3, 9)  # domingo


def local(day: date, hour: int, minute: int = 0, second: int = 0) -> datetime:
    return datetime.combine(day, time(hour, minute, second), tzinfo=SAO_PAULO)


def t7_reservation() -> Reservation:
    """Reserva agendada do caso T7 (sex 07/03 -> dom 09/03, com vaga)."""
    return ReservationFactory(checkin_date=MARCH_7, checkout_date=MARCH_9, has_vehicle=True)


@pytest.fixture
def actor():
    return UserFactory(username="atendente-do-teste")


def test_create_reservation_starts_pending_without_money(actor):
    guest = GuestFactory()

    reservation = service.create_reservation(
        guest=guest,
        room=RoomFactory(),
        actor=actor,
        checkin_date=MARCH_7,
        checkout_date=MARCH_9,
        has_vehicle=True,
        today=MARCH_7,
    )

    assert reservation.pk is not None
    assert reservation.status == ReservationStatus.PENDING
    assert reservation.checked_in_at is None
    assert reservation.account is None


def test_create_reservation_accepts_today_as_checkin(actor):
    """D11 recusa o passado, nao o proprio dia: `>= hoje`."""
    reservation = service.create_reservation(
        guest=GuestFactory(),
        room=RoomFactory(),
        actor=actor,
        checkin_date=MARCH_7,
        checkout_date=MARCH_9,
        today=MARCH_7,
    )

    assert reservation.status == ReservationStatus.PENDING


def test_create_reservation_in_the_past_is_rejected(actor):
    """D11, sem HTTP e sem freezegun -- `today` e parametro (SPEC 0.3/3.4)."""
    with pytest.raises(service.DomainValidationError) as excinfo:
        service.create_reservation(
            guest=GuestFactory(),
            room=RoomFactory(),
            actor=actor,
            checkin_date=MARCH_7,
            checkout_date=MARCH_9,
            today=MARCH_9,  # "hoje" e depois do check-in agendado
        )

    assert excinfo.value.code == "VALIDATION_ERROR"
    assert excinfo.value.status_code == 400
    assert "checkin_date" in excinfo.value.extra
    assert not Reservation.objects.exists()


def test_create_reservation_requires_one_night(actor):
    """D13: agendamento de zero noites nao existe (day-use so como fato)."""
    with pytest.raises(service.DomainValidationError) as excinfo:
        service.create_reservation(
            guest=GuestFactory(),
            room=RoomFactory(),
            actor=actor,
            checkin_date=MARCH_7,
            checkout_date=MARCH_7,
            today=MARCH_7,
        )

    assert "checkout_date" in excinfo.value.extra
    assert not Reservation.objects.exists()


def test_create_guest_persists_normalized_pii():
    guest = guests_service.create_guest(
        full_name="Ana Souza",
        document="123.456.789-01",
        phone="+55 21 98888-7777",
        nationality="BR",
    )

    stored = Guest.objects.get(pk=guest.pk)
    assert stored.full_name == "Ana Souza"
    assert stored.document == "12345678901"
    assert stored.phone == "5521988887777"


def test_create_guest_rejects_duplicate_document_in_any_format():
    """D12 + D9: mesma identidade civil, mascara diferente, mesma coluna."""
    guests_service.create_guest(
        full_name="Ana Souza",
        document="123.456.789-01",
        phone="+55 21 98888-7777",
        nationality="BR",
    )

    with pytest.raises(guests_service.DuplicateDocumentError) as excinfo:
        guests_service.create_guest(
            full_name="Outra Pessoa",
            document="12345678901",
            phone="+55 21 97777-6666",
            nationality="BR",
        )

    assert excinfo.value.code == "DUPLICATE_DOCUMENT"
    assert excinfo.value.status_code == 409
    assert Guest.objects.count() == 1


def test_create_guest_translates_the_constraint_when_the_read_guard_loses_the_race(
    monkeypatch,
):
    """A constraint unica e a autoridade final de D12, e sai como 409.

    Neutralizar a guarda de leitura reproduz exatamente a corrida: dois
    cadastros do mesmo documento passam pelo `exists()` juntos e so o banco
    decide. O `IntegrityError` tem de virar `DuplicateDocumentError`, nunca
    escapar cru (que no handler da SPEC 4.1 seria um 500 com corpo HTML).
    """
    existing = GuestFactory()
    monkeypatch.setattr(guests_service, "_assert_document_available", lambda document: None)

    with pytest.raises(guests_service.DuplicateDocumentError):
        guests_service.create_guest(
            full_name="Homonimo",
            document=existing.document,
            phone="+55 21 90000-0000",
            nationality="BR",
        )

    assert Guest.objects.count() == 1


def test_create_guest_leaves_an_outer_transaction_usable_after_the_race(monkeypatch):
    """A traducao usa savepoint, entao a `atomic` do chamador sobrevive.

    Sem o savepoint interno, a violacao da constraint marcaria a transacao
    inteira como quebrada e o INSERT seguinte morreria com
    `TransactionManagementError` -- o que aconteceria num importador que trata
    o duplicado e segue para a proxima linha do arquivo.
    """
    existing = GuestFactory()
    monkeypatch.setattr(guests_service, "_assert_document_available", lambda document: None)

    with transaction.atomic():
        with pytest.raises(guests_service.DuplicateDocumentError):
            guests_service.create_guest(
                full_name="Homonimo",
                document=existing.document,
                phone="+55 21 90000-0000",
                nationality="BR",
            )
        survivor = guests_service.create_guest(
            full_name="Proximo da Fila",
            document="98765432100",
            phone="+55 21 91111-2222",
            nationality="BR",
        )

    assert Guest.objects.filter(pk=survivor.pk).exists()


def test_constraint_name_is_extracted_from_integrity_error():
    """`constraint_name()` le o campo estruturado do driver, nao a mensagem.

    A mensagem do `IntegrityError` varia com locale e versao do PostgreSQL, e
    era por substring dela que a traducao de D12 decidia ("document" aparecia
    tanto na unicidade quanto no nome de qualquer outra constraint da coluna).
    O psycopg guarda o nome em `diag.constraint_name`, e e nesse nome que o
    dominio pode se apoiar.
    """
    existing = GuestFactory()

    with pytest.raises(IntegrityError) as excinfo, transaction.atomic():
        Guest.objects.create(
            full_name="Homonimo",
            document=existing.document,
            phone="+55 21 90000-0000",
            nationality="BR",
        )

    assert errors.constraint_name(excinfo.value) == GUEST_DOCUMENT_UNIQUE


def test_duplicate_document_translation_uses_named_constraint(monkeypatch):
    """Violacao de OUTRA constraint na mesma escrita sobe crua, nao vira 409.

    Com a traducao por substring, qualquer `IntegrityError` cuja mensagem
    mencionasse a palavra "document" saia como `DUPLICATE_DOCUMENT` -- inclusive
    um erro que nada tem a ver com D12. Renomear a chave do mapa prova que a
    decisao e pelo nome: sem entrada correspondente, o erro atravessa intacto
    e o bug aparece em vez de virar um 409 mentiroso.
    """
    existing = GuestFactory()
    monkeypatch.setattr(guests_service, "_assert_document_available", lambda document: None)
    monkeypatch.setattr(guests_service, "GUEST_DOCUMENT_UNIQUE", "outra_constraint_qualquer")

    with pytest.raises(IntegrityError), transaction.atomic():
        guests_service.create_guest(
            full_name="Homonimo",
            document=existing.document,
            phone="+55 21 90000-0000",
            nationality="BR",
        )


def test_create_guest_requires_a_country_code(actor):
    """A regra mora no SERVICO, entao vale para o seed e o shell tambem (D9).

    Se ela vivesse no serializer, `manage.py shell` e qualquer importador
    gravariam telefone sem DDI numa coluna que promete E.164 -- e o valor
    passaria a busca e a unicidade sem levantar nada.
    """
    with pytest.raises(service.DomainValidationError) as excinfo:
        guests_service.create_guest(
            full_name="Sem DDI",
            document="55544433322",
            phone="(21) 98888-7777",
            nationality="BR",
        )

    assert excinfo.value.code == "VALIDATION_ERROR"
    assert excinfo.value.status_code == 400
    assert "phone" in excinfo.value.extra
    assert not Guest.objects.exists()


def test_create_guest_stores_foreign_phone_as_e164_digits(actor):
    guest = guests_service.create_guest(
        full_name="Mary Poppins",
        document="P1234567",
        phone="+44 20 7946 0958",
        nationality="GB",
    )

    stored = Guest.objects.get(pk=guest.pk)
    assert stored.phone == "442079460958"
    assert stored.nationality == "GB"


def test_create_guest_rejects_unknown_nationality(actor):
    with pytest.raises(service.DomainValidationError) as excinfo:
        guests_service.create_guest(
            full_name="Pais Inexistente",
            document="99988877766",
            phone="+55 21 98888-7777",
            nationality="ZZ",
        )

    assert "nationality" in excinfo.value.extra
    assert not Guest.objects.exists()


def test_create_guest_upcases_the_nationality(actor):
    guest = guests_service.create_guest(
        full_name="Minusculo",
        document="12312312312",
        phone="+55 21 98888-7777",
        nationality="br",
    )

    assert Guest.objects.get(pk=guest.pk).nationality == "BR"


def test_transitions_record_actor_and_timestamp(actor):
    """Cada transicao grava QUEM a fez e QUANDO -- as colunas sao o historico.

    A maquina de estados e linear e cada transicao ocorre no maximo uma vez,
    entao a coluna com o seu `*_at` ao lado responde "quem fez este checkout?"
    sem uma tabela de eventos. Este teste e o que impede a resposta de voltar a
    ser "ninguem sabe".
    """
    reservation = service.create_reservation(
        guest=GuestFactory(),
        room=RoomFactory(),
        actor=actor,
        checkin_date=MARCH_7,
        checkout_date=MARCH_9,
        has_vehicle=True,
        today=MARCH_7,
    )
    assert reservation.created_by_id == actor.pk

    service.check_in(reservation, now=local(MARCH_7, 15), actor=actor)
    service.check_out(reservation, now=local(MARCH_9, 12, 1), actor=actor)

    stored = Reservation.objects.get(pk=reservation.pk)
    assert stored.checked_in_by_id == actor.pk
    assert stored.checked_out_by_id == actor.pk
    assert stored.checked_in_at is not None
    assert stored.checked_out_at is not None
    assert stored.cancelled_by_id is None
    assert stored.cancelled_at is None


def test_cancel_records_actor_and_timestamp(actor):
    reservation = t7_reservation()

    service.cancel(reservation, now=local(MARCH_7, 10), actor=actor)

    stored = Reservation.objects.get(pk=reservation.pk)
    assert stored.status == ReservationStatus.CANCELLED
    assert stored.cancelled_by_id == actor.pk
    assert stored.cancelled_at == local(MARCH_7, 10)


def test_sync_matches_refresh_from_db(actor):
    """`SYNCED_FIELDS` e lista manual: este teste e o alarme de quem esquecer.

    `_sync` poupa um SELECT copiando para a instancia do chamador o que a
    transicao escreveu. Uma coluna nova escrita por transicao e ausente da
    lista faz a view devolver o valor ANTIGO no corpo de um 200 -- resposta
    errada, sem erro nenhum. Comparar campo a campo com o que o banco tem
    fecha essa porta.
    """
    reservation = t7_reservation()
    service.check_in(reservation, now=local(MARCH_7, 15), actor=actor)
    service.check_out(reservation, now=local(MARCH_9, 12, 1), actor=actor)

    from_db = Reservation.objects.get(pk=reservation.pk)
    synced = {field: getattr(reservation, field) for field in service.SYNCED_FIELDS}
    expected = {field: getattr(from_db, field) for field in service.SYNCED_FIELDS}

    assert synced == expected
    # "account" e o objeto: copiar so o id deixaria a conta em cache aberta.
    assert reservation.account.status == from_db.account.status
    assert reservation.account.total_amount == from_db.account.total_amount
    written_by_transitions = {
        "status",
        "policy_id",
        "account",
        "checked_in_at",
        "checked_in_by_id",
        "checked_out_at",
        "checked_out_by_id",
        "cancelled_at",
        "cancelled_by_id",
    }
    assert set(service.SYNCED_FIELDS) == written_by_transitions


def test_checkin_window_before_opening_is_early():
    """A janela e a leitura que o 409 usa -- e que a Iris narra sem tentar o check-in."""
    window = service.checkin_window(now=local(MARCH_7, 13, 59, 59))

    assert window.is_early is True
    assert window.opens_at == time(14, 0)
    assert window.server_time == local(MARCH_7, 13, 59, 59)


def test_checkin_window_at_opening_is_not_early():
    window = service.checkin_window(now=local(MARCH_7, 14, 0, 0))

    assert window.is_early is False
    assert window.opens_at == time(14, 0)


def test_checkin_window_reads_local_time_from_a_utc_timestamp():
    """16:30 UTC sao 13:30 em Sao Paulo: e cedo, mesmo parecendo tarde."""
    window = service.checkin_window(now=datetime(2025, 3, 7, 16, 30, tzinfo=UTC))

    assert window.is_early is True
    assert window.server_time.strftime("%H:%M") == "13:30"


def test_checkin_window_follows_the_policy_in_force():
    """D15: quem abre a porta e a politica vigente no ato, nao a constante do motor."""
    policy = PricingPolicyFactory(checkin_opens=time(15, 0), effective_from=local(MARCH_7, 0))

    window = service.checkin_window(now=local(MARCH_7, 14, 30))

    assert window.policy == policy
    assert window.opens_at == time(15, 0)
    assert window.is_early is True


def test_check_in_at_14_sets_status_and_timestamp(actor):
    reservation = t7_reservation()
    now = local(MARCH_7, 14, 0, 0)

    returned = service.check_in(reservation, now=now, allow_early=False, actor=actor)

    assert returned is reservation
    assert reservation.status == ReservationStatus.CHECKED_IN
    assert reservation.checked_in_at == now
    stored = Reservation.objects.get(pk=reservation.pk)
    assert stored.status == ReservationStatus.CHECKED_IN
    assert stored.checked_in_at == now


def test_check_in_before_14_raises_early_checkin_with_server_time(actor):
    reservation = t7_reservation()

    with pytest.raises(service.EarlyCheckinError) as exc:
        service.check_in(
            reservation, now=local(MARCH_7, 13, 59, 59), allow_early=False, actor=actor
        )

    assert exc.value.code == "EARLY_CHECKIN"
    assert exc.value.detail == "Check-in permitido a partir das 14:00."
    assert exc.value.extra == {"server_time": "13:59", "opens_at": "14:00"}
    assert Reservation.objects.get(pk=reservation.pk).status == ReservationStatus.PENDING


def test_check_in_before_14_with_override_succeeds(actor):
    """D4: o briefing pede alerta, nao bloqueio."""
    reservation = t7_reservation()
    now = local(MARCH_7, 13, 59, 59)

    service.check_in(reservation, now=now, allow_early=True, actor=actor)

    assert reservation.status == ReservationStatus.CHECKED_IN
    assert reservation.checked_in_at == now


def test_check_in_rule_is_evaluated_in_local_time(actor):
    """SPEC 0.3: 16:30 UTC e 13:30 em Sao Paulo -- e cedo, mesmo parecendo tarde."""
    reservation = t7_reservation()
    now_utc = datetime(2025, 3, 7, 16, 30, tzinfo=UTC)

    with pytest.raises(service.EarlyCheckinError) as exc:
        service.check_in(reservation, now=now_utc, allow_early=False, actor=actor)

    assert exc.value.extra == {"server_time": "13:30", "opens_at": "14:00"}


@pytest.mark.parametrize(
    "trait",
    ["checked_in", "checked_out", "cancelled"],
)
def test_check_in_rejects_non_pending(trait, actor):
    reservation = _reservation_in_state(trait)

    with pytest.raises(service.InvalidStatusError) as exc:
        service.check_in(reservation, now=local(MARCH_9, 15), allow_early=True, actor=actor)

    assert exc.value.code == "INVALID_STATUS"


def test_check_out_freezes_totals_matching_T7(actor):
    """Caso T7 da SPEC 3.3 ponta a ponta, pelos fatos reais (D6)."""
    reservation = t7_reservation()
    service.check_in(reservation, now=local(MARCH_7, 15), allow_early=False, actor=actor)

    statement = service.check_out(reservation, now=local(MARCH_9, 12, 1), actor=actor)

    assert statement.subtotal_daily == Decimal("300.00")
    assert statement.subtotal_parking == Decimal("35.00")
    assert statement.late_fee_applied is True
    assert statement.late_fee_base == Decimal("180.00")
    assert statement.late_fee == Decimal("90.00")
    assert statement.total == Decimal("425.00")

    stored = Reservation.objects.get(pk=reservation.pk)
    assert stored.status == ReservationStatus.CHECKED_OUT
    assert stored.checked_out_at == local(MARCH_9, 12, 1)
    assert stored.account.total_amount == Decimal("425.00")
    totals = dict(
        AccountLine.objects.filter(account=stored.account)
        .values_list("kind")
        .annotate(total=Sum("amount"))
    )
    assert totals[LineKind.DAILY] == Decimal("300.00")
    assert totals[LineKind.PARKING] == Decimal("35.00")
    assert totals[LineKind.LATE_FEE] == Decimal("90.00")


def test_check_out_charges_real_stay_not_scheduled_dates(actor):
    """D6: agendado sex->dom, saida real na segunda -> a diaria de domingo entra."""
    reservation = t7_reservation()
    service.check_in(reservation, now=local(MARCH_7, 15), allow_early=False, actor=actor)

    bill = service.check_out(reservation, now=local(date(2025, 3, 10), 11, 0), actor=actor)

    assert [line.date.day for line in bill.lines] == [7, 8, 9]
    assert bill.total == Decimal("535.00")  # caso T3


def test_check_out_exactly_at_noon_is_exempt(actor):
    """T8/D3: `ate as 12h00min` inclui o limite."""
    reservation = ReservationFactory(
        checkin_date=date(2025, 3, 5), checkout_date=date(2025, 3, 7), has_vehicle=False
    )
    service.check_in(reservation, now=local(date(2025, 3, 5), 18), allow_early=False, actor=actor)

    bill = service.check_out(reservation, now=local(date(2025, 3, 7), 12, 0, 0), actor=actor)

    assert bill.late_fee_applied is False
    assert bill.total == Decimal("240.00")


def test_check_out_twice_is_rejected(actor):
    reservation = t7_reservation()
    service.check_in(reservation, now=local(MARCH_7, 15), allow_early=False, actor=actor)
    service.check_out(reservation, now=local(MARCH_9, 11), actor=actor)

    with pytest.raises(service.InvalidStatusError):
        service.check_out(reservation, now=local(MARCH_9, 11, 30), actor=actor)


@pytest.mark.parametrize("trait", ["pending", "cancelled"])
def test_check_out_requires_checked_in(trait, actor):
    reservation = _reservation_in_state(trait)

    with pytest.raises(service.InvalidStatusError):
        service.check_out(reservation, now=local(MARCH_9, 11), actor=actor)


def test_check_out_without_checkin_timestamp_is_rejected(actor):
    """Defesa contra linha inconsistente: CHECKED_IN sem `checked_in_at`."""
    reservation = ReservationFactory(checked_in=True)
    Reservation.objects.filter(pk=reservation.pk).update(checked_in_at=None)

    with pytest.raises(service.InvalidStatusError):
        service.check_out(reservation, now=local(MARCH_9, 11), actor=actor)


def test_cancel_pending_reservation(actor):
    reservation = ReservationFactory()

    service.cancel(reservation, now=local(MARCH_7, 10), actor=actor)

    assert reservation.status == ReservationStatus.CANCELLED
    assert Reservation.objects.get(pk=reservation.pk).status == ReservationStatus.CANCELLED


@pytest.mark.parametrize("trait", ["checked_in", "checked_out", "cancelled"])
def test_cancel_rejects_anything_but_pending(trait, actor):
    """D8: nenhum outro estado cancela -- dinheiro monotonico."""
    reservation = _reservation_in_state(trait)

    with pytest.raises(service.InvalidStatusError):
        service.cancel(reservation, now=local(MARCH_7, 10), actor=actor)


def test_persisted_statement_matches_recomputation(actor):
    """O extrato HIDRATADO bate com o que o motor produziu no checkout.

    Nao e mais uma prova de que o extrato e recomputavel -- ele deixou de ser
    recomputado. E a prova de que persistir nao mudou nenhum numero: o extrato
    hidratado do livro e igual ao que o motor produziu, campo a campo.
    """
    reservation = t7_reservation()
    service.check_in(reservation, now=local(MARCH_7, 15), allow_early=False, actor=actor)
    frozen = service.check_out(reservation, now=local(MARCH_9, 12, 1), actor=actor)

    recomputed = service.statement(Reservation.objects.get(pk=reservation.pk))
    from_engine = Statement.from_bill(
        pricing.calculate_bill(
            checkin_day=MARCH_7,
            checkout_day=MARCH_9,
            checkout_time=time(12, 1),
            booked_checkin_day=MARCH_7,
            booked_checkout_day=MARCH_9,
            has_vehicle=True,
        )
    )

    assert recomputed == frozen == from_engine


def test_statement_requires_checkout():
    with pytest.raises(service.InvalidStatusError):
        service.statement(ReservationFactory(checked_in=True))


def test_domain_error_carries_the_envelope_defaults():
    """SPEC 4.1: cada erro de dominio sabe o proprio `code`."""
    error = ReservationError()

    assert error.code == "INVALID_STATUS"
    assert error.detail
    assert error.extra == {}


def _reservation_in_state(trait: str) -> Reservation:
    if trait == "pending":
        return ReservationFactory()
    if trait == "cancelled":
        reservation = ReservationFactory()
        reservation.status = ReservationStatus.CANCELLED
        reservation.save(update_fields=["status"])
        return reservation
    return ReservationFactory(**{trait: True})


def test_check_in_rejects_guest_with_an_active_stay(actor):
    """Invariante entre linhas vira 409, nao IntegrityError.

    `resv_one_active_per_guest` (SPEC 1.5) e uma constraint ENTRE linhas. Sem
    checagem no service ela estourava como IntegrityError e o handler da SPEC
    4.1 devolvia HTTP 500 -- numa condicao de negocio legitima: hospede com
    duas reservas PENDING, check-in na segunda.
    """
    active = ReservationFactory(checkin_date=MARCH_7, checkout_date=MARCH_9)
    service.check_in(active, now=local(MARCH_7, 15), actor=actor)

    second = ReservationFactory(
        guest=active.guest,
        checkin_date=date(2025, 3, 10),
        checkout_date=date(2025, 3, 12),
    )

    with pytest.raises(service.InvalidStatusError) as exc:
        service.check_in(second, now=local(date(2025, 3, 10), 15), actor=actor)

    assert exc.value.code == "INVALID_STATUS"
    assert exc.value.extra["active_reservation_id"] == active.pk
    second.refresh_from_db()
    assert second.status == ReservationStatus.PENDING
    assert second.checked_in_at is None


def test_check_in_allowed_again_after_checkout(actor):
    """A trava e a estadia ATIVA, nao o historico: apos o checkout, libera."""
    first = ReservationFactory(checkin_date=MARCH_7, checkout_date=MARCH_9)
    service.check_in(first, now=local(MARCH_7, 15), actor=actor)
    service.check_out(first, now=local(MARCH_9, 11), actor=actor)

    second = ReservationFactory(
        guest=first.guest,
        checkin_date=date(2025, 3, 10),
        checkout_date=date(2025, 3, 12),
    )
    service.check_in(second, now=local(date(2025, 3, 10), 15), actor=actor)

    second.refresh_from_db()
    assert second.status == ReservationStatus.CHECKED_IN


def test_check_out_converts_utc_to_local_before_counting_nights(actor):
    """A conversao para hora local decide QUAIS diarias entram na conta.

    Sao Paulo e UTC-3, entao um check-in as 21:00 locais e 00:00 UTC do dia
    SEGUINTE. Este teste passa os timestamps em UTC de proposito, porque e o
    que a producao faz: a view injeta `timezone.now()` (UTC) e o banco devolve
    `checked_in_at` em UTC.

    Sexta 21:00 local -> domingo 11:00 local, em datas locais, sao as diarias
    de sexta (120,00) e sabado (180,00) = 300,00. Lidas em UTC seriam sabado a
    domingo, ou seja so sabado = 180,00. Sem o `timezone.localtime()` do
    servico, a diferenca de R$ 120,00 passava sem nenhum teste falhar.
    """
    checkin_utc = datetime(2025, 3, 8, 0, 0, tzinfo=UTC)  # sex 07/03 21:00 local
    checkout_utc = datetime(2025, 3, 9, 14, 0, tzinfo=UTC)  # dom 09/03 11:00 local

    reservation = ReservationFactory(checkin_date=MARCH_7, checkout_date=MARCH_9, has_vehicle=False)
    service.check_in(reservation, now=checkin_utc, actor=actor)
    bill = service.check_out(reservation, now=checkout_utc, actor=actor)

    assert [line.date for line in bill.lines] == [MARCH_7, date(2025, 3, 8)]
    assert bill.subtotal_daily == Decimal("300.00")
    assert bill.late_fee == Decimal("0.00")
    assert bill.total == Decimal("300.00")


def test_check_in_rule_reads_local_time_from_a_utc_timestamp(actor):
    """23:00 locais liberam o check-in, embora sejam 02:00 UTC do dia seguinte.

    Complementa o teste de fronteira local: aqui a entrada e UTC, como na
    producao. Sem a conversao, `early_checkin` veria 02:00 e exigiria override
    num horario em que a regra das 14h ja esta satisfeita.
    """
    now_utc = datetime(2025, 3, 8, 2, 0, tzinfo=UTC)  # sex 07/03 23:00 local
    reservation = ReservationFactory(checkin_date=MARCH_7, checkout_date=MARCH_9)

    service.check_in(reservation, now=now_utc, allow_early=False, actor=actor)

    reservation.refresh_from_db()
    assert reservation.status == ReservationStatus.CHECKED_IN
