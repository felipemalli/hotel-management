from __future__ import annotations

from datetime import date, datetime, time, timedelta

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from accounts.models import Role
from hotel.guests import services as guest_services
from hotel.guests.models import Guest
from hotel.guests.normalization import normalize_document
from hotel.reservations import services as reservation_services
from hotel.reservations.models import Reservation, ReservationStatus
from hotel.rooms.models import Room

ATTENDANT_USERNAME = "atendente"
ATTENDANT_PASSWORD = "atendente123"
ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = "admin123"

SUNDAY = 6


def local_dt(day: date, at: time) -> datetime:
    return timezone.make_aware(datetime.combine(day, at), timezone.get_current_timezone())


def last_past_sunday(today: date) -> date:
    offset = (today.weekday() - SUNDAY) % 7
    return today - timedelta(days=offset or 7)


class Command(BaseCommand):
    help = "Popula o banco com um cenario de demonstracao (idempotente)."

    @transaction.atomic
    def handle(self, *args, **options) -> None:
        today = timezone.localdate()

        attendant = self._ensure_attendant()
        self._ensure_admin()
        rooms = self._ensure_rooms()

        ana = self._ensure_guest("Ana Souza", "123.456.789-01", "+55 21 98888-7777", "BR")
        self._ensure_reservation(
            ana,
            room=rooms["101"],
            checkin=today,
            checkout=today + timedelta(days=2),
            has_vehicle=True,
            actor=attendant,
        )

        bruno = self._ensure_guest("Bruno Lima", "987.654.321-00", "+55 11 97777-6666", "BR")
        eva = self._ensure_guest("Eva Lima", "555.444.333-22", "+54 11 5555-4444", "AR")
        yesterday = today - timedelta(days=1)
        bruno_reservation = self._ensure_reservation(
            bruno,
            companions=[eva],
            room=rooms["102"],
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

        carla = self._ensure_guest("Carla Nunes", "AB123456", "+55 31 96666-5555", "PT")
        sunday = last_past_sunday(today)
        friday = sunday - timedelta(days=2)
        carla_reservation = self._ensure_reservation(
            carla,
            room=rooms["103"],
            checkin=friday,
            checkout=sunday,
            has_vehicle=True,
            actor=attendant,
        )
        if carla_reservation.status == ReservationStatus.PENDING:
            reservation_services.check_in(
                carla_reservation,
                now=local_dt(friday, time(15, 0)),
                actor=attendant,
                allow_early=False,
            )
            statement = reservation_services.check_out(
                carla_reservation, now=local_dt(sunday, time(12, 1)), actor=attendant
            )
            self.stdout.write(
                f"  estadia encerrada (em aberto): Carla Nunes - total R$ {statement.total} "
                f"(multa R$ {statement.late_fee})"
            )

        self._ensure_guest("Davi Rocha", "321.654.987-00", "+55 41 95555-4444", "BR")

        self.stdout.write(self.style.SUCCESS("Seed de demonstracao aplicado."))
        self.stdout.write(
            f"Atendente: {ATTENDANT_USERNAME} / {ATTENDANT_PASSWORD} "
            f"| Admin: {ADMIN_USERNAME} / {ADMIN_PASSWORD} "
            f"| quartos: {Room.objects.count()} "
            f"| hospedes: {Guest.objects.count()} | reservas: {Reservation.objects.count()}"
        )

    def _ensure_attendant(self):
        user_model = get_user_model()
        attendant, created = user_model.objects.get_or_create(username=ATTENDANT_USERNAME)
        if created:
            attendant.set_password(ATTENDANT_PASSWORD)
            attendant.save(update_fields=["password"])
            self.stdout.write(f"  atendente criado: {ATTENDANT_USERNAME}")
        elif attendant.is_staff or attendant.is_superuser:
            # get_or_create nao mexe em linha existente: bancos antigos
            # guardariam para sempre um superusuario com senha publicada.
            user_model.objects.filter(pk=attendant.pk).update(is_staff=False, is_superuser=False)
            self.stdout.write("  atendente rebaixado para usuario comum (SPEC 1.1)")
            attendant.refresh_from_db()
        return attendant

    def _ensure_admin(self) -> None:
        user_model = get_user_model()
        admin, created = user_model.objects.get_or_create(
            username=ADMIN_USERNAME,
            defaults={"role": Role.ADMIN, "is_staff": False, "is_superuser": False},
        )
        if created:
            admin.set_password(ADMIN_PASSWORD)
            admin.save(update_fields=["password"])
            self.stdout.write(f"  admin criado: {ADMIN_USERNAME}")

    def _ensure_rooms(self) -> dict[str, Room]:
        rooms: dict[str, Room] = {}
        for number, capacity in (("101", 2), ("102", 2), ("103", 3), ("201", 4)):
            room, created = Room.objects.get_or_create(
                number=number, defaults={"capacity": capacity}
            )
            if created:
                self.stdout.write(f"  quarto criado: {number} ({capacity} pessoas)")
            rooms[number] = room
        return rooms

    def _ensure_guest(self, full_name: str, document: str, phone: str, nationality: str) -> Guest:
        existing = Guest.objects.filter(document=normalize_document(document)).first()
        if existing is not None:
            return existing

        guest = guest_services.create_guest(
            full_name=full_name, document=document, phone=phone, nationality=nationality
        )
        self.stdout.write(f"  hospede criado: {full_name}")
        return guest

    def _ensure_reservation(
        self,
        guest: Guest,
        *,
        room: Room,
        companions: list[Guest] | None = None,
        checkin: date,
        checkout: date,
        has_vehicle: bool,
        actor,
    ) -> Reservation:
        existing = guest.reservations.order_by("id").first()
        if existing is not None:
            return existing

        reservation = reservation_services.create_reservation(
            guest=guest,
            room=room,
            companions=companions or [],
            checkin_date=checkin,
            checkout_date=checkout,
            has_vehicle=has_vehicle,
            actor=actor,
            # today=checkin, nao localdate(): fichas de Bruno/Carla sao passadas
            # e D11 recusa agendamento no passado.
            today=checkin,
        )
        self.stdout.write(f"  reserva criada: {guest.full_name} {checkin} -> {checkout}")
        return reservation
