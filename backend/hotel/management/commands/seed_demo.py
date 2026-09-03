"""
Seed de demonstracao (SPEC 8.2/A).

Regras que este comando respeita e que valem revisao:

* Datas relativas (R4): nenhum literal de data. Tudo deriva de
  `timezone.localdate()`, logo o cenario e valido em qualquer dia de execucao.
* Nunca escreve no ORM direto: criacao E transicoes passam pelos services
  com relogio injetado (SPEC 0.3), os mesmos que a API usa. Isto e o que faz
  do seed uma prova do dominio e nao um atalho em volta dele.
* Idempotente: `get_or_create` por `document` (ja normalizado); reexecucao
  nao duplica hospede nem re-transiciona reserva.
* Nao registra PII em log (SPEC 2.1): imprime nome e status, nunca documento
  ou telefone.
"""

from __future__ import annotations

from datetime import date, datetime, time, timedelta

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from accounts.models import Role
from hotel.models import Guest, Reservation, ReservationStatus
from hotel.normalization import normalize_document
from hotel.services import guests as guest_services
from hotel.services import reservations as reservation_services

ATTENDANT_USERNAME = "atendente"
ATTENDANT_PASSWORD = "atendente123"
ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = "admin123"

SUNDAY = 6


def local_dt(day: date, at: time) -> datetime:
    """Datetime ciente no fuso local do projeto (America/Sao_Paulo)."""
    return timezone.make_aware(datetime.combine(day, at), timezone.get_current_timezone())


def last_past_sunday(today: date) -> date:
    """Domingo mais recente estritamente anterior a `today`."""
    offset = (today.weekday() - SUNDAY) % 7
    return today - timedelta(days=offset or 7)


class Command(BaseCommand):
    help = "Popula o banco com um cenario de demonstracao (idempotente)."

    @transaction.atomic
    def handle(self, *args, **options) -> None:
        today = timezone.localdate()

        attendant = self._ensure_attendant()
        self._ensure_admin()

        # 1. Ana Souza - reserva PENDING de hoje: povoa a aba "pendentes".
        ana = self._ensure_guest("Ana Souza", "123.456.789-01", "+55 21 98888-7777", "BR")
        self._ensure_reservation(
            ana,
            checkin=today,
            checkout=today + timedelta(days=2),
            has_vehicle=True,
            actor=attendant,
        )

        # 2. Bruno Lima - check-in feito ontem: povoa a aba "no hotel".
        bruno = self._ensure_guest("Bruno Lima", "987.654.321-00", "+55 11 97777-6666", "BR")
        yesterday = today - timedelta(days=1)
        bruno_reservation = self._ensure_reservation(
            bruno,
            checkin=yesterday,
            checkout=today + timedelta(days=1),
            has_vehicle=False,
            actor=attendant,
        )
        if bruno_reservation.status == ReservationStatus.PENDING:
            reservation_services.check_in(
                bruno_reservation,
                now=local_dt(yesterday, time(15, 0)),
                actor=attendant,
                allow_early=False,
            )
            self.stdout.write("  check-in aplicado: Bruno Lima")

        # 3. Carla Nunes - estadia sexta->domingo estritamente passada, com vaga
        #    e saida 12:01: extrato pronto com diaria de fim de semana (180,00)
        #    e multa de checkout tardio (90,00).
        carla = self._ensure_guest("Carla Nunes", "AB123456", "+55 31 96666-5555", "PT")
        sunday = last_past_sunday(today)
        friday = sunday - timedelta(days=2)
        carla_reservation = self._ensure_reservation(
            carla, checkin=friday, checkout=sunday, has_vehicle=True, actor=attendant
        )
        if carla_reservation.status == ReservationStatus.PENDING:
            reservation_services.check_in(
                carla_reservation,
                now=local_dt(friday, time(15, 0)),
                actor=attendant,
                allow_early=False,
            )
            bill = reservation_services.check_out(
                carla_reservation, now=local_dt(sunday, time(12, 1)), actor=attendant
            )
            # Deliberadamente NAO paga: a demo precisa de uma conta fechada e
            # em aberto para exercitar `POST /api/reservations/{id}/pay/`.
            self.stdout.write(
                f"  estadia encerrada (em aberto): Carla Nunes - total R$ {bill.total} "
                f"(multa R$ {bill.late_fee})"
            )

        # 4. Davi Rocha - sem reserva: demonstra a busca por nome.
        self._ensure_guest("Davi Rocha", "321.654.987-00", "+55 41 95555-4444", "BR")

        self.stdout.write(self.style.SUCCESS("Seed de demonstracao aplicado."))
        self.stdout.write(
            f"Atendente: {ATTENDANT_USERNAME} / {ATTENDANT_PASSWORD} "
            f"| Admin: {ADMIN_USERNAME} / {ADMIN_PASSWORD} "
            f"| hospedes: {Guest.objects.count()} | reservas: {Reservation.objects.count()}"
        )

    # -- auxiliares ----------------------------------------------------------

    def _ensure_attendant(self):
        user_model = get_user_model()
        # Usuario COMUM: a SPEC 1.1 diz que o atendente e um CustomUser comum,
        # sem papeis multiplos. Criar superusuario com senha conhecida a cada
        # subida do compose seria uma conta administrativa publica de fato.
        # Para acessar o /admin/, rode `manage.py createsuperuser`.
        attendant, created = user_model.objects.get_or_create(username=ATTENDANT_USERNAME)
        if created:
            attendant.set_password(ATTENDANT_PASSWORD)
            attendant.save(update_fields=["password"])
            self.stdout.write(f"  atendente criado: {ATTENDANT_USERNAME}")
        elif attendant.is_staff or attendant.is_superuser:
            # Fora do `if created` de proposito: `get_or_create` nao mexe em
            # linha existente, entao sem isto todo banco que subiu o compose
            # antes desta correcao guardaria para sempre um superusuario com
            # senha publica -- e o /admin/ nao passa pelo throttle do DRF.
            user_model.objects.filter(pk=attendant.pk).update(is_staff=False, is_superuser=False)
            self.stdout.write("  atendente rebaixado para usuario comum (SPEC 1.1)")
            attendant.refresh_from_db()
        return attendant

    def _ensure_admin(self) -> None:
        """Credencial de demonstracao do papel ADMIN.

        `is_staff=False` de proposito: o papel e do produto, e `is_staff`
        significa "entra no /admin/". Um admin do hotel com acesso ao Django
        admin poderia gravar no dominio por fora dos services, que e justo o
        que este projeto recusa (nao existe `hotel/admin.py`).
        """
        user_model = get_user_model()
        admin, created = user_model.objects.get_or_create(
            username=ADMIN_USERNAME,
            defaults={"role": Role.ADMIN, "is_staff": False, "is_superuser": False},
        )
        if created:
            admin.set_password(ADMIN_PASSWORD)
            admin.save(update_fields=["password"])
            self.stdout.write(f"  admin criado: {ADMIN_USERNAME}")

    def _ensure_guest(
        self, full_name: str, document: str, phone: str, nationality: str
    ) -> Guest:
        """Cadastra pelo servico; a idempotencia e a leitura previa por documento.

        `get_or_create` gravava a linha direto no ORM, passando por cima de
        `services.guests.create_guest` -- justo a camada que o resto do sistema
        afirma ser o unico caminho de escrita. A consulta por documento
        normalizado (a mesma chave de D12) mantem a reexecucao inocua.
        """
        existing = Guest.objects.filter(document=normalize_document(document)).first()
        if existing is not None:
            return existing

        guest = guest_services.create_guest(
            full_name=full_name, document=document, phone=phone, nationality=nationality
        )
        self.stdout.write(f"  hospede criado: {full_name}")
        return guest

    def _ensure_reservation(
        self, guest: Guest, *, checkin: date, checkout: date, has_vehicle: bool, actor
    ) -> Reservation:
        """Uma reserva por hospede do seed, criada uma unica vez.

        A chave da idempotencia e o HOSPEDE, nao a data. Chavear por
        `(guest, checkin_date, checkout_date)` parecia idempotente e nao era:
        as datas do cenario derivam de `localdate()`, entao uma reexecucao no
        dia seguinte nao encontrava a reserva anterior, criava outra, e o
        `check_in` do Bruno batia na invariante de uma estadia ativa por
        hospede -- o comando abortava e a cadeia de subida do compose parava
        antes do gunicorn. `docker compose up` no dia seguinte, sem `-v`,
        deixava a API no chao.

        Deixar o cenario da execucao anterior de pe tambem e mais fiel: a
        reserva PENDING da Ana vence e continua listada, que e exatamente o que
        a D14 descreve.
        """
        existing = guest.reservations.order_by("id").first()
        if existing is not None:
            return existing

        reservation = reservation_services.create_reservation(
            guest=guest,
            checkin_date=checkin,
            checkout_date=checkout,
            has_vehicle=has_vehicle,
            actor=actor,
            # `today=checkin`, nao `localdate()`: as fichas de Bruno e Carla
            # sao estadias passadas, e D11 recusa agendamento no passado. O
            # relogio e parametro justamente para que o seed possa se situar no
            # instante em que cada reserva foi feita, em vez de contornar a
            # regra escrevendo no ORM.
            today=checkin,
        )
        self.stdout.write(f"  reserva criada: {guest.full_name} {checkin} -> {checkout}")
        return reservation
