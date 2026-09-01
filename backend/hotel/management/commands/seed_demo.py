"""
Seed de demonstracao (SPEC 8.2/A).

Regras que este comando respeita e que valem revisao:

* Datas relativas (R4): nenhum literal de data. Tudo deriva de
  `timezone.localdate()`, logo o cenario e valido em qualquer dia de execucao.
* Nunca escreve `status` direto: as transicoes passam pelos services com
  relogio injetado (SPEC 0.3), os mesmos que a API usa.
* Idempotente: `get_or_create` por `document_hash`; reexecucao nao duplica
  hospede nem re-transiciona reserva.
* Nao registra PII em log (SPEC 2.2): imprime nome e status, nunca documento
  ou telefone.
"""

from __future__ import annotations

from datetime import date, datetime, time, timedelta

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from hotel.crypto import blind_index, normalize_document
from hotel.models import Guest, Reservation, ReservationStatus
from hotel.services import reservations as reservation_services

ATTENDANT_USERNAME = "atendente"
ATTENDANT_PASSWORD = "atendente123"

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

        self._ensure_attendant()

        # 1. Ana Souza - reserva PENDING de hoje: povoa a aba "pendentes".
        ana = self._ensure_guest("Ana Souza", "123.456.789-01", "(21) 98888-7777")
        self._ensure_reservation(
            ana, checkin=today, checkout=today + timedelta(days=2), has_vehicle=True
        )

        # 2. Bruno Lima - check-in feito ontem: povoa a aba "no hotel".
        bruno = self._ensure_guest("Bruno Lima", "987.654.321-00", "(11) 97777-6666")
        yesterday = today - timedelta(days=1)
        bruno_reservation = self._ensure_reservation(
            bruno, checkin=yesterday, checkout=today + timedelta(days=1), has_vehicle=False
        )
        if bruno_reservation.status == ReservationStatus.PENDING:
            reservation_services.check_in(
                bruno_reservation,
                now=local_dt(yesterday, time(15, 0)),
                allow_early=False,
            )
            self.stdout.write("  check-in aplicado: Bruno Lima")

        # 3. Carla Nunes - estadia sexta->domingo estritamente passada, com vaga
        #    e saida 12:01: extrato pronto com diaria de fim de semana (180,00)
        #    e multa de checkout tardio (90,00).
        carla = self._ensure_guest("Carla Nunes", "AB123456", "(31) 96666-5555")
        sunday = last_past_sunday(today)
        friday = sunday - timedelta(days=2)
        carla_reservation = self._ensure_reservation(
            carla, checkin=friday, checkout=sunday, has_vehicle=True
        )
        if carla_reservation.status == ReservationStatus.PENDING:
            reservation_services.check_in(
                carla_reservation, now=local_dt(friday, time(15, 0)), allow_early=False
            )
            bill = reservation_services.check_out(
                carla_reservation, now=local_dt(sunday, time(12, 1))
            )
            self.stdout.write(
                f"  estadia encerrada: Carla Nunes - total R$ {bill.total} "
                f"(multa R$ {bill.late_fee})"
            )

        # 4. Davi Rocha - sem reserva: demonstra a busca por nome.
        self._ensure_guest("Davi Rocha", "321.654.987-00", "(41) 95555-4444")

        self.stdout.write(self.style.SUCCESS("Seed de demonstracao aplicado."))
        self.stdout.write(
            f"Atendente: {ATTENDANT_USERNAME} / {ATTENDANT_PASSWORD} "
            f"| hospedes: {Guest.objects.count()} | reservas: {Reservation.objects.count()}"
        )

    # -- auxiliares ----------------------------------------------------------

    def _ensure_attendant(self) -> None:
        user_model = get_user_model()
        attendant, created = user_model.objects.get_or_create(
            username=ATTENDANT_USERNAME,
            defaults={"is_staff": True, "is_superuser": True},
        )
        if created:
            attendant.set_password(ATTENDANT_PASSWORD)
            attendant.save(update_fields=["password"])
            self.stdout.write(f"  atendente criado: {ATTENDANT_USERNAME}")

    def _ensure_guest(self, full_name: str, document: str, phone: str) -> Guest:
        guest, created = Guest.objects.get_or_create(
            document_hash=blind_index(normalize_document(document)),
            defaults={"full_name": full_name, "document": document, "phone": phone},
        )
        if created:
            self.stdout.write(f"  hospede criado: {full_name}")
        return guest

    def _ensure_reservation(
        self, guest: Guest, *, checkin: date, checkout: date, has_vehicle: bool
    ) -> Reservation:
        reservation, created = Reservation.objects.get_or_create(
            guest=guest,
            checkin_date=checkin,
            checkout_date=checkout,
            defaults={"has_vehicle": has_vehicle},
        )
        if created:
            self.stdout.write(f"  reserva criada: {guest.full_name} {checkin} -> {checkout}")
        return reservation
