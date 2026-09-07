from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from accounts.models import Role
from hotel.billing.models import AccountStatus, PaymentMethod
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

CHECKIN_AT = time(15, 0)  # depois de checkin_opens (14:00): check-in sem allow_early
ON_TIME_CHECKOUT = time(10, 30)
LATE_CHECKOUT = time(13, 10)  # depois de checkout_limit (12:00): gera multa
ONE_MINUTE_LATE = time(12, 1)


def local_dt(day: date, at: time) -> datetime:
    return timezone.make_aware(datetime.combine(day, at), timezone.get_current_timezone())


def last_past_sunday(today: date) -> date:
    offset = (today.weekday() - SUNDAY) % 7
    return today - timedelta(days=offset or 7)


@dataclass(frozen=True)
class Person:
    full_name: str
    document: str
    phone: str
    nationality: str


@dataclass(frozen=True)
class Stay:
    """Uma ficha do cenario: quem, onde, quando e ate que estado ela avanca."""

    guest: Person
    room: str
    checkin: date
    checkout: date
    stage: str
    has_vehicle: bool = False
    companions: tuple[Person, ...] = ()
    checkout_at: time = ON_TIME_CHECKOUT
    payment: str | None = None


ANA = Person("Ana Souza", "123.456.789-01", "+55 21 98888-7777", "BR")
BRUNO = Person("Bruno Lima", "987.654.321-00", "+55 11 97777-6666", "BR")
EVA = Person("Eva Lima", "555.444.333-22", "+54 11 5555-4444", "AR")
CARLA = Person("Carla Nunes", "AB123456", "+55 31 96666-5555", "PT")
DAVI = Person("Davi Rocha", "321.654.987-00", "+55 41 95555-4444", "BR")
SOFIA = Person("Sofia Marques", "111.222.333-44", "+55 51 98111-2233", "BR")
TIAGO = Person("Tiago Alves", "CD987654", "+351 912 345 678", "PT")
RICARDO = Person("Ricardo Mattos", "222.333.444-55", "+55 62 98222-3344", "BR")
PAULA = Person("Paula Antunes", "ES4455667", "+34 612 345 678", "ES")
NADIA = Person("Nadia Ferraz", "333.444.555-66", "+55 71 98333-4455", "BR")
LARISSA = Person("Larissa Ferraz", "444.555.666-77", "+55 71 98444-5566", "BR")
THEO = Person("Theo Ferraz", "555.666.777-88", "+55 71 98555-6677", "BR")
OTAVIO = Person("Otavio Bastos", "IT7788990", "+39 320 123 4567", "IT")
MARCOS = Person("Marcos Vieira", "666.777.888-99", "+55 85 98666-7788", "BR")
FERNANDA = Person("Fernanda Torres", "777.888.999-00", "+55 27 98777-8899", "BR")
GUSTAVO = Person("Gustavo Pinto", "888.999.000-11", "+55 48 98888-9900", "BR")
HELENA = Person("Helena Castro", "999.000.111-22", "+55 11 98999-0011", "BR")
BENTO = Person("Bento Castro", "000.111.222-33", "+55 11 98000-1122", "BR")
CLARA = Person("Clara Castro", "112.233.445-56", "+55 11 98112-2334", "BR")
IGOR = Person("Igor Salles", "US1122334", "+1 212 234 5678", "US")
JULIA = Person("Julia Prado", "FR5566778", "+33 6 12 34 56 78", "FR")
URSULA = Person("Ursula Klein", "DE9900112", "+49 30 12345678", "DE")
VITOR = Person("Vitor Almeida", "123.987.456-30", "+55 71 98999-1122", "BR")
MARIANA = Person("Mariana Rocha", "456.123.789-40", "+55 81 98999-2233", "BR")
CAMILA = Person("Camila Duarte", "234.567.890-12", "+55 11 98123-4567", "BR")
RODRIGO = Person("Rodrigo Peixoto", "345.678.901-23", "+55 21 98234-5678", "BR")
BEATRIZ = Person("Beatriz Nogueira", "456.789.012-34", "+55 31 98345-6789", "BR")
DIEGO = Person("Diego Cavalcanti", "567.890.123-45", "+55 41 98456-7890", "BR")
ALINE = Person("Aline Barros", "678.901.234-56", "+55 51 98567-8901", "BR")
FELIPE = Person("Felipe Andrade", "789.012.345-67", "+55 61 98678-9012", "BR")
JULIANA = Person("Juliana Freitas", "890.123.456-78", "+55 71 98789-0123", "BR")
LEONARDO = Person("Leonardo Farias", "901.234.567-89", "+55 81 98890-1234", "BR")
PATRICIA = Person("Patricia Moraes", "012.345.678-90", "+55 91 98901-2345", "BR")
EDUARDO = Person("Eduardo Teixeira", "135.792.468-01", "+55 19 98012-3456", "BR")
VANESSA = Person("Vanessa Correia", "246.813.579-02", "+55 27 98123-5678", "BR")
RAFAEL = Person("Rafael Duarte", "357.924.680-13", "+55 47 98234-6789", "BR")
SIMONE = Person("Simone Batista", "468.035.791-24", "+55 48 98345-7890", "BR")
THIAGO = Person("Thiago Nascimento", "579.146.802-35", "+55 62 98456-8901", "BR")
PRISCILA = Person("Priscila Lopes", "680.257.913-46", "+55 85 98567-9012", "BR")
ANDERSON = Person("Anderson Cardoso", "791.368.024-57", "+55 34 98678-0123", "BR")
FABIANA = Person("Fabiana Ramos", "802.479.135-68", "+55 45 98789-1234", "BR")
GILBERTO = Person("Gilberto Pires", "913.580.246-79", "+55 54 98890-2345", "BR")
MARCELO = Person("Marcelo Vidal", "PT3344556", "+351 913 456 789", "PT")
ALESSANDRA = Person("Alessandra Conti", "IT2233445", "+39 340 123 4567", "IT")
MANUEL = Person("Manuel Ibanez", "ES6677889", "+34 611 234 567", "ES")
CHLOE = Person("Chloe Girard", "FR8899001", "+33 6 23 45 67 89", "FR")
HANS = Person("Hans Weber", "DE0011223", "+49 30 87654321", "DE")
LAURA = Person("Laura Bennett", "US4455667", "+1 212 345 6789", "US")
# Companhia de dois fillers, so para variar tambem o tamanho do grupo.
YASMIN = Person("Yasmin Duarte", "024.681.357-80", "+55 71 98999-3344", "BR")
CAIO = Person("Caio Pires", "135.792.468-91", "+55 81 98999-4455", "BR")

# Sem ficha nenhuma: alimentam a busca por nome, documento e telefone.
GUESTS_WITHOUT_STAY = (DAVI, URSULA)

# (numero, capacidade, ativo)
ROOMS = (
    ("101", 2, True),
    ("102", 2, True),
    ("103", 3, True),
    ("104", 2, True),
    ("105", 3, True),
    ("201", 4, True),
    ("202", 4, True),
    ("203", 2, True),
    ("301", 6, True),
    ("302", 4, False),
    ("401", 2, True),
    ("402", 3, True),
    ("701", 2, True),
    ("702", 3, True),
    ("501", 2, True),
    ("502", 2, True),
    ("503", 3, True),
    ("504", 2, True),
    ("505", 2, True),
    ("506", 3, True),
    ("507", 4, True),
    ("508", 2, True),
    ("509", 2, True),
    ("510", 3, True),
    ("601", 2, True),
    ("602", 3, True),
    ("603", 2, True),
    ("604", 4, True),
    ("605", 2, True),
    ("606", 2, True),
    ("607", 3, True),
    ("608", 2, True),
    ("609", 5, True),
    ("610", 2, True),
    ("703", 2, True),
    ("704", 3, True),
    ("705", 2, True),
    ("706", 2, True),
)


def scenario(today: date) -> list[Stay]:
    """As fichas em ordem de criacao.

    A ordem e' significativa: uma ficha com data de entrada no passado faz o
    servico checar se o quarto tem alguem hospedado *agora* (RoomUnavailable),
    entao as estadias encerradas nascem antes das ativas, e as pendentes
    depois de todas -- e o mesmo quarto pode contar historia sem colidir. O
    preenchimento (a partir da Camila) usa um quarto exclusivo cada, entao a
    posicao dele na lista nao importa.
    """

    def day(offset: int) -> date:
        return today + timedelta(days=offset)

    sunday = last_past_sunday(today)

    return [
        Stay(
            SOFIA,
            room="201",
            checkin=day(-11),
            checkout=day(-7),
            stage=ReservationStatus.CHECKED_OUT,
            has_vehicle=True,
            payment=PaymentMethod.CASH,
        ),
        Stay(
            TIAGO,
            room="202",
            checkin=day(-9),
            checkout=day(-8),
            stage=ReservationStatus.CHECKED_OUT,
            checkout_at=time(11, 0),
            payment=PaymentMethod.CARD,
        ),
        Stay(
            RICARDO,
            room="101",
            checkin=day(-4),
            checkout=day(-2),
            stage=ReservationStatus.CHECKED_OUT,
            has_vehicle=True,
            checkout_at=LATE_CHECKOUT,
        ),
        Stay(
            CARLA,
            room="103",
            checkin=sunday - timedelta(days=2),
            checkout=sunday,
            stage=ReservationStatus.CHECKED_OUT,
            has_vehicle=True,
            checkout_at=ONE_MINUTE_LATE,
        ),
        Stay(
            PAULA,
            room="203",
            checkin=day(-2),
            checkout=day(-1),
            stage=ReservationStatus.CHECKED_OUT,
            checkout_at=time(9, 45),
            payment=PaymentMethod.PIX,
        ),
        Stay(
            NADIA,
            room="301",
            checkin=day(-4),
            checkout=day(3),
            stage=ReservationStatus.CHECKED_IN,
            has_vehicle=True,
            companions=(LARISSA, THEO),
        ),
        Stay(
            OTAVIO,
            room="202",
            checkin=day(-5),
            checkout=day(-1),
            stage=ReservationStatus.CHECKED_IN,
            has_vehicle=True,
        ),
        Stay(
            BRUNO,
            room="102",
            checkin=day(-1),
            checkout=day(1),
            stage=ReservationStatus.CHECKED_IN,
            companions=(EVA,),
        ),
        Stay(
            MARCOS,
            room="105",
            checkin=day(-2),
            checkout=today,
            stage=ReservationStatus.CHECKED_IN,
            has_vehicle=True,
        ),
        Stay(
            ANA,
            room="101",
            checkin=today,
            checkout=day(2),
            stage=ReservationStatus.PENDING,
            has_vehicle=True,
        ),
        Stay(
            VITOR,
            room="701",
            checkin=today,
            checkout=day(3),
            stage=ReservationStatus.PENDING,
        ),
        Stay(
            MARIANA,
            room="702",
            checkin=today,
            checkout=day(5),
            stage=ReservationStatus.PENDING,
            has_vehicle=True,
        ),
        Stay(
            FERNANDA,
            room="104",
            checkin=day(-1),
            checkout=day(1),
            stage=ReservationStatus.PENDING,
        ),
        Stay(
            GUSTAVO,
            room="105",
            checkin=day(1),
            checkout=day(4),
            stage=ReservationStatus.PENDING,
            has_vehicle=True,
        ),
        Stay(
            HELENA,
            room="201",
            checkin=day(3),
            checkout=day(7),
            stage=ReservationStatus.PENDING,
            companions=(BENTO, CLARA),
        ),
        Stay(
            PAULA,
            room="203",
            checkin=day(8),
            checkout=day(10),
            stage=ReservationStatus.PENDING,
        ),
        Stay(
            IGOR,
            room="203",
            checkin=day(10),
            checkout=day(12),
            stage=ReservationStatus.PENDING,
        ),
        Stay(
            JULIA,
            room="104",
            checkin=day(5),
            checkout=day(6),
            stage=ReservationStatus.CANCELLED,
        ),
        # Preenchimento: quarto exclusivo cada, entao sem risco de colidir
        # agenda com as fichas acima nem entre si.
        Stay(
            CAMILA,
            room="501",
            checkin=day(-15),
            checkout=day(-13),
            stage=ReservationStatus.CHECKED_OUT,
            payment=PaymentMethod.CASH,
        ),
        Stay(
            RODRIGO,
            room="502",
            checkin=day(-13),
            checkout=day(-10),
            stage=ReservationStatus.CHECKED_OUT,
            has_vehicle=True,
            payment=PaymentMethod.CARD,
        ),
        Stay(
            BEATRIZ,
            room="503",
            checkin=day(-10),
            checkout=day(-9),
            stage=ReservationStatus.CHECKED_OUT,
            payment=PaymentMethod.PIX,
        ),
        Stay(
            DIEGO,
            room="504",
            checkin=day(-8),
            checkout=day(-6),
            stage=ReservationStatus.CHECKED_OUT,
            has_vehicle=True,
            checkout_at=LATE_CHECKOUT,
        ),
        Stay(
            ALINE,
            room="505",
            checkin=day(-6),
            checkout=day(-5),
            stage=ReservationStatus.CHECKED_OUT,
        ),
        Stay(
            FELIPE,
            room="506",
            checkin=day(-3),
            checkout=day(-2),
            stage=ReservationStatus.CHECKED_OUT,
            has_vehicle=True,
            payment=PaymentMethod.CASH,
        ),
        Stay(
            JULIANA,
            room="507",
            checkin=day(-7),
            checkout=day(2),
            stage=ReservationStatus.CHECKED_IN,
            has_vehicle=True,
        ),
        Stay(
            LEONARDO,
            room="508",
            checkin=day(-6),
            checkout=day(-1),
            stage=ReservationStatus.CHECKED_IN,
        ),
        Stay(
            PATRICIA,
            room="509",
            checkin=day(-3),
            checkout=today,
            stage=ReservationStatus.CHECKED_IN,
            has_vehicle=True,
        ),
        Stay(
            EDUARDO,
            room="510",
            checkin=day(-1),
            checkout=day(6),
            stage=ReservationStatus.CHECKED_IN,
        ),
        Stay(
            VANESSA,
            room="601",
            checkin=today,
            checkout=day(1),
            stage=ReservationStatus.PENDING,
        ),
        Stay(
            RAFAEL,
            room="602",
            checkin=day(-2),
            checkout=day(3),
            stage=ReservationStatus.PENDING,
            has_vehicle=True,
        ),
        Stay(
            SIMONE,
            room="603",
            checkin=day(1),
            checkout=day(2),
            stage=ReservationStatus.PENDING,
        ),
        Stay(
            THIAGO,
            room="604",
            checkin=day(2),
            checkout=day(5),
            stage=ReservationStatus.PENDING,
            has_vehicle=True,
        ),
        Stay(
            PRISCILA,
            room="605",
            checkin=day(4),
            checkout=day(6),
            stage=ReservationStatus.PENDING,
        ),
        Stay(
            ANDERSON,
            room="606",
            checkin=day(6),
            checkout=day(9),
            stage=ReservationStatus.PENDING,
            companions=(YASMIN,),
        ),
        Stay(
            FABIANA,
            room="607",
            checkin=day(9),
            checkout=day(11),
            stage=ReservationStatus.PENDING,
        ),
        Stay(
            GILBERTO,
            room="608",
            checkin=day(14),
            checkout=day(16),
            stage=ReservationStatus.PENDING,
            companions=(CAIO,),
        ),
        Stay(
            MARCELO,
            room="609",
            checkin=day(18),
            checkout=day(20),
            stage=ReservationStatus.PENDING,
        ),
        Stay(
            ALESSANDRA,
            room="610",
            checkin=day(3),
            checkout=day(4),
            stage=ReservationStatus.CANCELLED,
        ),
        Stay(
            MANUEL,
            room="703",
            checkin=day(-4),
            checkout=day(-3),
            stage=ReservationStatus.CANCELLED,
        ),
        Stay(
            CHLOE,
            room="704",
            checkin=day(-14),
            checkout=day(-12),
            stage=ReservationStatus.CHECKED_OUT,
            payment=PaymentMethod.CARD,
        ),
        Stay(
            HANS,
            room="705",
            checkin=day(-12),
            checkout=day(-11),
            stage=ReservationStatus.CHECKED_OUT,
        ),
        Stay(
            LAURA,
            room="706",
            checkin=day(7),
            checkout=day(9),
            stage=ReservationStatus.PENDING,
            has_vehicle=True,
        ),
    ]


class Command(BaseCommand):
    help = "Popula o banco com um cenario de demonstracao (idempotente)."

    @transaction.atomic
    def handle(self, *args, **options) -> None:
        today = timezone.localdate()

        attendant = self._ensure_users()
        rooms = self._ensure_rooms()

        # Quantas fichas o hospede ja recebeu nesta execucao: e a chave de
        # idempotencia da n-esima ficha dele (ver _ensure_reservation).
        slots: dict[int, int] = {}

        for stay in scenario(today):
            guest = self._ensure_guest(stay.guest)
            companions = [self._ensure_guest(person) for person in stay.companions]
            slot = slots.get(guest.pk, 0)
            slots[guest.pk] = slot + 1

            reservation = self._ensure_reservation(
                guest,
                room=rooms[stay.room],
                companions=companions,
                stay=stay,
                slot=slot,
                today=today,
                actor=attendant,
            )
            self._advance(reservation, stay=stay, today=today, actor=attendant)
            self._report(reservation, stay=stay)

        for person in GUESTS_WITHOUT_STAY:
            self._ensure_guest(person)

        self._summarize()

    def _report(self, reservation: Reservation, *, stay: Stay) -> None:
        line = (
            f"  {stay.guest.full_name} · quarto {stay.room} · "
            f"{stay.checkin:%d/%m} -> {stay.checkout:%d/%m} · {reservation.status}"
        )
        account = reservation.account
        if account is not None and account.total_amount is not None:
            line += f" · R$ {account.total_amount} ({account.status})"
        self.stdout.write(line)

    def _summarize(self) -> None:
        by_status = {
            status.label: Reservation.objects.filter(status=status).count()
            for status in ReservationStatus
        }
        self.stdout.write(self.style.SUCCESS("Seed de demonstracao aplicado."))
        self.stdout.write(
            f"Atendente: {ATTENDANT_USERNAME} / {ATTENDANT_PASSWORD} "
            f"| Admin: {ADMIN_USERNAME} / {ADMIN_PASSWORD}"
        )
        self.stdout.write(
            f"quartos: {Room.objects.count()} | hospedes: {Guest.objects.count()} "
            f"| reservas: {Reservation.objects.count()} "
            + " | ".join(f"{label}: {count}" for label, count in by_status.items())
        )

    def _ensure_users(self):
        attendant = self._ensure_user(ATTENDANT_USERNAME, ATTENDANT_PASSWORD, Role.ATTENDANT)
        self._ensure_user(ADMIN_USERNAME, ADMIN_PASSWORD, Role.ADMIN)
        return attendant

    def _ensure_user(self, username: str, password: str, role: str):
        user_model = get_user_model()
        user, created = user_model.objects.get_or_create(
            username=username,
            defaults={"role": role, "is_staff": False, "is_superuser": False},
        )
        if created:
            user.set_password(password)
            user.save(update_fields=["password"])
            self.stdout.write(f"  usuario criado: {username} ({role})")
        elif user.is_staff or user.is_superuser:
            # get_or_create nao mexe em linha existente: bancos antigos
            # guardariam para sempre um superusuario com senha publicada.
            user_model.objects.filter(pk=user.pk).update(is_staff=False, is_superuser=False)
            self.stdout.write(f"  {username} rebaixado para usuario comum")
            user.refresh_from_db()
        return user

    def _ensure_rooms(self) -> dict[str, Room]:
        rooms: dict[str, Room] = {}
        for number, capacity, is_active in ROOMS:
            room, created = Room.objects.get_or_create(
                number=number, defaults={"capacity": capacity, "is_active": is_active}
            )
            if created:
                self.stdout.write(f"  quarto criado: {number} ({capacity} pessoas)")
            rooms[number] = room
        return rooms

    def _ensure_guest(self, person: Person) -> Guest:
        existing = Guest.objects.filter(document=normalize_document(person.document)).first()
        if existing is not None:
            return existing

        return guest_services.create_guest(
            full_name=person.full_name,
            document=person.document,
            phone=person.phone,
            nationality=person.nationality,
        )

    def _ensure_reservation(
        self,
        guest: Guest,
        *,
        room: Room,
        companions: list[Guest],
        stay: Stay,
        slot: int,
        today: date,
        actor,
    ) -> Reservation:
        # A n-esima ficha do hospede e' a chave, nao a data: as datas do
        # cenario sao relativas a hoje, entao chavear por data criaria uma
        # ficha nova a cada dia -- e o seed roda na subida do compose.
        existing = list(guest.reservations.order_by("id")[: slot + 1])
        if len(existing) > slot:
            return existing[slot]

        return reservation_services.create_reservation(
            guest=guest,
            room=room,
            companions=companions,
            checkin_date=stay.checkin,
            checkout_date=stay.checkout,
            has_vehicle=stay.has_vehicle,
            actor=actor,
            # Recuar o relogio so' para ficha passada, que o servico recusaria.
            # Adiantar seria pior: com today no futuro, a checagem de "quarto
            # ocupado agora" entra e recusa a reserva de um quarto que estara
            # livre na data pedida.
            today=min(today, stay.checkin),
        )

    def _advance(self, reservation: Reservation, *, stay: Stay, today: date, actor) -> None:
        if stay.stage == ReservationStatus.CANCELLED:
            if reservation.status == ReservationStatus.PENDING:
                reservation_services.cancel(
                    reservation, now=local_dt(today - timedelta(days=1), time(9, 0)), actor=actor
                )
            return

        if stay.stage not in (ReservationStatus.CHECKED_IN, ReservationStatus.CHECKED_OUT):
            return

        if reservation.status == ReservationStatus.PENDING:
            reservation_services.check_in(
                reservation,
                now=local_dt(stay.checkin, CHECKIN_AT),
                actor=actor,
                allow_early=False,
            )

        if stay.stage != ReservationStatus.CHECKED_OUT:
            return

        checkout_at = local_dt(stay.checkout, stay.checkout_at)
        if reservation.status == ReservationStatus.CHECKED_IN:
            reservation_services.check_out(reservation, now=checkout_at, actor=actor)

        if stay.payment is not None and reservation.account.status == AccountStatus.CLOSED:
            reservation_services.mark_paid(
                reservation,
                now=checkout_at + timedelta(minutes=10),
                actor=actor,
                payment_method=stay.payment,
            )
