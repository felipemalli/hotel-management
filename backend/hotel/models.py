"""
Modelos do dominio (SPEC 1.2-1.5).

Models enxutos (SPEC 0.3): nenhum calculo de dinheiro aqui -- isso e de
`services/pricing.py`. A unica logica que sobrevive no model e a
normalizacao de documento/telefone, que precisa valer para qualquer caminho de
escrita (API, seed, admin, shell).
"""

from __future__ import annotations

from decimal import Decimal

from django.conf import settings
from django.contrib.postgres.constraints import ExclusionConstraint
from django.contrib.postgres.fields import DateRangeField, RangeBoundary, RangeOperators
from django.contrib.postgres.indexes import GinIndex, OpClass
from django.core.validators import MinValueValidator
from django.db import models
from django.db.models import F, Func, Q
from django.db.models.functions import Upper

from hotel.normalization import (
    DOCUMENT_MAX_LENGTH,
    PHONE_MAX_LENGTH,
    normalize_country,
    normalize_document,
    normalize_phone,
)

# Nomes de constraint sao contrato: `services/errors.translate_integrity_error`
# casa por eles para transformar violacao em erro de dominio (SPEC 4.1). Por
# isso nenhuma constraint deste projeto nasce com nome gerado pelo Django.
GUEST_DOCUMENT_UNIQUE = "guest_document_unique"
POLICY_MONEY_NON_NEGATIVE = "policy_money_non_negative"
POLICY_CHECKOUT_BEFORE_CHECKIN = "policy_checkout_before_checkin"
RESV_ACTIVE_HAS_POLICY = "resv_active_has_policy"
RESV_PAYMENT_COMPLETE = "resv_payment_complete"
RESV_PAID_REQUIRES_CHECKED_OUT = "resv_paid_requires_checked_out"
STMTLINE_UNIQUE_DATE = "stmtline_unique_date"
ROOM_NUMBER_UNIQUE = "room_number_unique"
ROOM_CAPACITY_POSITIVE = "room_capacity_positive"
RESV_ROOM_NO_OVERLAP = "resv_room_no_overlap"
RESV_ONE_ACTIVE_PER_ROOM = "resv_one_active_per_room"


class ReservationStatus(models.TextChoices):
    PENDING = "PENDING", "Reserva pendente"
    CHECKED_IN = "CHECKED_IN", "Hospede no hotel"
    CHECKED_OUT = "CHECKED_OUT", "Finalizada"
    CANCELLED = "CANCELLED", "Cancelada"


class PaymentMethod(models.TextChoices):
    """Como a conta foi paga. NAO e um estado da reserva.

    Pagamento nao entrou em `ReservationStatus` de proposito: `PAID` seria um
    quinto estado numa maquina linear que ja termina em `CHECKED_OUT`, e
    obrigaria toda consulta de "estadia encerrada" a olhar dois valores. Pago e
    um FATO sobre a reserva encerrada, e vive em colunas proprias.
    """

    CASH = "CASH", "Dinheiro"
    CARD = "CARD", "Cartão"
    PIX = "PIX", "Pix"
    OTHER = "OTHER", "Outro"


class GuestManager(models.Manager):
    """Recusa as escritas que passam por cima do `save()` do modelo.

    `bulk_create` e `QuerySet.update()` nao chamam `save()`, e e o `save()` que
    normaliza `document`/`phone` (SPEC 2.1, D9). Sem este guarda, o hospede era
    gravado com a mascara digitada: a unicidade de documento e a busca por
    fragmento falhariam em silencio. Falhar alto e melhor que gravar dado
    silenciosamente quebrado.
    """

    def bulk_create(self, *args, **kwargs):
        raise NotImplementedError(
            "Guest.objects.bulk_create nao normaliza document/phone "
            "(SPEC 2.1). Crie um por um com save(), ou use os services."
        )


class Guest(models.Model):
    """Hospede. Nome, documento e telefone em claro e buscaveis por fragmento (D5).

    `phone` guarda digitos E.164 SEM o `+` (D9): a presenca do DDI e garantida
    na ENTRADA por `services.guests.create_guest`, porque o `+` nao persiste e
    a coluna nao distingue "5521988887777" de um numero local de 13 digitos.
    """

    full_name = models.CharField(max_length=140)
    document = models.CharField(max_length=DOCUMENT_MAX_LENGTH)
    phone = models.CharField(max_length=PHONE_MAX_LENGTH)
    # Sem `default` no model: default silencioso faria todo hospede estrangeiro
    # nascer brasileiro no primeiro caminho de escrita que esquecesse o campo.
    # A migration usa um default one-off (`preserve_default=False`) so para
    # preencher linha existente. Sem CHECK regex: nao ha corrida a proteger, e a
    # autoridade da lista ISO e o servico.
    nationality = models.CharField(max_length=2)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = GuestManager()

    class Meta:
        ordering = ["full_name", "id"]
        constraints = [
            # `unique=True` no campo deixaria o PostgreSQL escolher o nome, e a
            # traducao de `IntegrityError` casa por nome (GUEST_DOCUMENT_UNIQUE).
            models.UniqueConstraint(fields=["document"], name=GUEST_DOCUMENT_UNIQUE),
        ]
        indexes = [
            # Indices FUNCIONAIS: casam o SQL real do icontains no PG,
            # `UPPER("coluna"::text) LIKE UPPER(%s)` (SPEC 1.4, V4+V5).
            GinIndex(
                OpClass(Upper("full_name"), name="gin_trgm_ops"),
                name="guest_name_trgm_upper",
            ),
            GinIndex(
                OpClass(Upper("document"), name="gin_trgm_ops"),
                name="guest_document_trgm_upper",
            ),
            GinIndex(
                OpClass(Upper("phone"), name="gin_trgm_ops"),
                name="guest_phone_trgm_upper",
            ),
        ]

    def __str__(self) -> str:
        return self.full_name

    def save(self, *args, **kwargs):
        """Normaliza documento, telefone e nacionalidade em qualquer escrita (D9)."""
        self.document = normalize_document(self.document)
        self.phone = normalize_phone(self.phone)
        self.nationality = normalize_country(self.nationality)
        super().save(*args, **kwargs)




class DateRange(Func):
    """`daterange(checkin_date, checkout_date, '[)')` para o `EXCLUDE` do PG.

    O Django nao tem expressao pronta para construir um range a partir de duas
    colunas, e o `ExclusionConstraint` precisa de um operando do tipo range.
    `'[)'` -- inicio incluido, fim excluido -- e o que faz uma saida no dia 09
    e uma entrada no dia 09 NAO se sobreporem: e a mesma semantica de D1, onde
    a diaria e cobrada por data em `[checkin, checkout)`.
    """

    function = "daterange"
    output_field = DateRangeField()


class Room(models.Model):
    """Quarto fisico. Numero, capacidade e se esta em operacao.

    Sem preco, sem tipo e sem foto: a unica propriedade que outra regra consome
    hoje e `capacity` (titular + acompanhantes <= capacidade). Preco por quarto
    entra por `RoomType` + `catalog.rate_table_of(policy, room)` quando houver
    requisito; foto precisa de `MEDIA_ROOT`, volume no compose e Pillow no
    Dockerfile, e nao e a coluna que custa.
    """

    number = models.CharField(max_length=10)
    capacity = models.PositiveSmallIntegerField(validators=[MinValueValidator(1)])
    # A FK da reserva e `PROTECT`: sem `is_active`, o primeiro quarto em reforma
    # nao teria saida -- nao daria para apaga-lo (tem historico) nem para
    # esconde-lo da disponibilidade.
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["number"]
        constraints = [
            # Texto, nao inteiro: "12A" e um numero de quarto tao valido quanto
            # "101". Nomeada, como todas -- a traducao de IntegrityError casa
            # por nome.
            models.UniqueConstraint(fields=["number"], name=ROOM_NUMBER_UNIQUE),
            models.CheckConstraint(
                name=ROOM_CAPACITY_POSITIVE,
                condition=Q(capacity__gte=1),
            ),
        ]

    def __str__(self) -> str:
        return self.number


class PricingPolicy(models.Model):
    """Tarifas e horarios vigentes a partir de um instante. Append-only.

    Append-only por AUSENCIA de caminho de escrita, nao por gatilho no banco:
    nao existe `PATCH` nem `DELETE`, e `services.catalog.create_policy` so
    insere. Mudar a politica e publicar outra linha -- e mudar a politica e
    mudar o FUTURO, nunca o passado, porque a reserva amarra a sua por FK no
    check-in (D15) e o extrato tem as tarifas persistidas linha a linha.

    Nenhum metodo aqui importa `pricing`: a camada e models -> services, e a
    conversao para `pricing.RateTable` e de `services.catalog.rate_table_of`,
    que e o UNICO ponto de resolucao -- e por isso a costura para preco por
    quarto no futuro.
    """

    weekday_rate = models.DecimalField(max_digits=10, decimal_places=2)
    weekend_rate = models.DecimalField(max_digits=10, decimal_places=2)
    weekday_park = models.DecimalField(max_digits=10, decimal_places=2)
    weekend_park = models.DecimalField(max_digits=10, decimal_places=2)
    # 4 casas: a multa e um fator (0.5000 = 50%), nao dinheiro. Sem teto --
    # multa de 100% e plausivel e um `<= 1` seria regra inventada aqui.
    late_fee_factor = models.DecimalField(max_digits=5, decimal_places=4, default=Decimal("0.5"))
    # Hora LOCAL (America/Sao_Paulo), com precisao de minuto na entrada.
    checkin_opens = models.TimeField()
    checkout_limit = models.TimeField()
    # Definido pelo SERVIDOR (`now` injetado pela view), nunca pelo cliente.
    # Sem `unique`: erro de digitacao se corrige publicando outra linha, e a
    # resolucao por `(-effective_from, -id)` faz a mais recente vencer sem que
    # a errada desapareca do historico.
    effective_from = models.DateTimeField(db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    # `null` = a linha do bootstrap, inserida pela migration: ninguem a criou.
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="pricing_policies",
        null=True,
        blank=True,
    )
    note = models.CharField(max_length=200, blank=True)

    class Meta:
        ordering = ["-effective_from", "-id"]
        constraints = [
            models.CheckConstraint(
                name=POLICY_MONEY_NON_NEGATIVE,
                condition=Q(weekday_rate__gte=0)
                & Q(weekend_rate__gte=0)
                & Q(weekday_park__gte=0)
                & Q(weekend_park__gte=0)
                & Q(late_fee_factor__gte=0),
            ),
            # O limite de checkout vem ANTES da abertura do check-in no mesmo
            # dia: e o que faz o quarto ser desocupado antes de ser reocupado.
            # Invertido, a mesma diaria pertenceria a duas estadias.
            models.CheckConstraint(
                name=POLICY_CHECKOUT_BEFORE_CHECKIN,
                condition=Q(checkout_limit__lte=F("checkin_opens")),
            ),
        ]

    def __str__(self) -> str:
        return f"politica de {self.effective_from:%Y-%m-%d %H:%M}"


class Reservation(models.Model):
    """Reserva. Datas agendadas + fatos reais; totais congelados no checkout.

    Sem `updated_at`: todo `save()` dos services usa `update_fields`, entao um
    `auto_now` nunca entraria na lista e a coluna mentiria para sempre. Os
    `*_at` por transicao, com o ator ao lado, sao a linha do tempo real.
    """

    guest = models.ForeignKey(
        Guest,
        on_delete=models.PROTECT,
        related_name="reservations",
    )
    # NOT NULL: reserva sem quarto e o overbooking que este inventario
    # existe para impedir. `PROTECT` porque o quarto explica a estadia.
    room = models.ForeignKey(
        "hotel.Room",
        on_delete=models.PROTECT,
        related_name="reservations",
    )
    # M2M IMPLICITO: a unicidade `(reservation, guest)` vem de graca com a
    # tabela intermediaria do Django, e nao ha atributo POR VINCULO (papel,
    # idade, data de entrada do acompanhante) que justifique um `through`.
    # Quando houver, o `through` explicito e uma migration, nao um redesenho.
    companions = models.ManyToManyField(
        Guest,
        related_name="companion_reservations",
        blank=True,
    )
    checkin_date = models.DateField()
    checkout_date = models.DateField()
    has_vehicle = models.BooleanField(default=False)
    status = models.CharField(
        max_length=11,
        choices=ReservationStatus,
        default=ReservationStatus.PENDING,
    )
    # Amarrada no CHECK-IN, nao na criacao nem no checkout: e a politica
    # vigente quando o hospede entrou que rege a estadia inteira -- diarias,
    # vaga, fator da multa e limite de checkout (D15). `PROTECT` porque a
    # politica e o que explica os numeros congelados. `null` enquanto a reserva
    # e PENDING (ou foi cancelada sem nunca entrar), o que a CHECK abaixo
    # formaliza.
    policy = models.ForeignKey(
        "hotel.PricingPolicy",
        on_delete=models.PROTECT,
        related_name="reservations",
        null=True,
        blank=True,
    )
    # Fatos reais: e por eles que se cobra (D6), nunca pelas datas agendadas.
    checked_in_at = models.DateTimeField(null=True, blank=True)
    checked_out_at = models.DateTimeField(null=True, blank=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)
    # Quem fez cada transicao. A maquina de estados e linear e cada transicao
    # ocorre no maximo uma vez, entao a coluna com o seu `*_at` ao lado E o
    # historico: nao ha o que uma tabela de eventos acrescentaria enquanto
    # nenhuma transicao for repetivel. `PROTECT` porque apagar o usuario
    # apagaria a autoria de um lancamento financeiro; `null` porque a linha
    # pode ter nascido antes da transicao (ou fora da API, pelo shell).
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="reservations_created",
        null=True,
        blank=True,
    )
    checked_in_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="reservations_checked_in",
        null=True,
        blank=True,
    )
    checked_out_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="reservations_checked_out",
        null=True,
        blank=True,
    )
    cancelled_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="reservations_cancelled",
        null=True,
        blank=True,
    )
    # Congelados no checkout para auditoria; o extrato linha a linha e
    # recomputavel deterministicamente de checked_in_at/checked_out_at.
    total_daily = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    total_parking = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    late_fee = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    # A tarifa que serviu de base a multa. `late_fee_applied` do extrato DERIVA
    # daqui (`late_fee_base IS NOT NULL`) em vez de ser uma coluna boolean: duas
    # colunas para o mesmo fato podem discordar, e um `late_fee_applied=True`
    # com base nula nao teria como ser reemitido.
    late_fee_base = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    total_amount = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    # Pagamento unico e integral (D18): tres colunas que nascem e morrem juntas,
    # guardadas pela CHECK `resv_payment_complete`. Pagamento parcial ou estorno
    # sao o gatilho para extrair uma tabela `Payment` -- ai a transicao passa a
    # ser repetivel e a coluna deixa de ser o historico.
    paid_at = models.DateTimeField(null=True, blank=True)
    # `null=True` num CharField contraria a convencao do Django (DJ001), e
    # aqui e deliberado: as tres colunas do pagamento formam um grupo que a
    # CHECK `resv_payment_complete` exige nulo JUNTO. Com `""` como ausencia, o
    # grupo teria duas representacoes de "nao pago" e a CHECK precisaria
    # verificar as duas -- e uma string vazia numa coluna com `choices` seria um
    # valor fora do enum gravado como se fosse um.
    payment_method = models.CharField(  # noqa: DJ001
        max_length=8,
        choices=PaymentMethod,
        null=True,
        blank=True,
    )
    paid_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="reservations_paid",
        null=True,
        blank=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["checkin_date", "id"]
        indexes = [
            # Serve as abas "no hotel" / "pendentes" ordenadas por data (SPEC 1.4).
            # `status` NAO leva `db_index` proprio: e a coluna que lidera este
            # indice composto, logo o indice simples seria peso morto -- custo
            # de escrita e de espaco sem nenhuma consulta que o prefira.
            models.Index(fields=["status", "checkin_date"], name="resv_status_checkin"),
        ]
        constraints = [
            # Agendamento exige no minimo 1 noite (D13); day-use real e coberto
            # por D1 no motor financeiro, nao aqui.
            models.CheckConstraint(
                name="resv_checkout_after_checkin",
                condition=Q(checkout_date__gt=F("checkin_date")),
            ),
            # No maximo UMA reserva CHECKED_IN por hospede: e o que garante que
            # `active_reservation` da aba "no hotel" e unico (SPEC 4.3).
            models.UniqueConstraint(
                name="resv_one_active_per_guest",
                fields=["guest"],
                condition=Q(status="CHECKED_IN"),
            ),
            # A AGENDA: duas reservas ativas nao podem ocupar o mesmo quarto
            # em datas que se cruzam. `[)` deixa passar estadias adjacentes
            # (sai dia 09, entra dia 09), que e o comportamento correto.
            # NAO `DEFERRABLE`: o conflito e detectado no proprio INSERT da
            # segunda transacao (depois de ela esperar a primeira), e e por isso
            # que o savepoint em volta do INSERT basta para traduzir o erro.
            ExclusionConstraint(
                name=RESV_ROOM_NO_OVERLAP,
                expressions=[
                    ("room", RangeOperators.EQUAL),
                    (
                        DateRange("checkin_date", "checkout_date", RangeBoundary()),
                        RangeOperators.OVERLAPS,
                    ),
                ],
                condition=Q(status__in=["PENDING", "CHECKED_IN"]),
            ),
            # O FATO FISICO: um hospede que fica alem do `checkout_date` (D6/D7)
            # continua CHECKED_IN com a agenda ja liberada. A exclusao acima nao
            # pega esse caso, porque ela olha datas agendadas. Duas pessoas no
            # mesmo quarto ao mesmo tempo e o que esta unique impede.
            models.UniqueConstraint(
                name=RESV_ONE_ACTIVE_PER_ROOM,
                fields=["room"],
                condition=Q(status="CHECKED_IN"),
            ),
            # Toda reserva que passou pelo check-in tem politica: sem ela,
            # `statement()` nao saberia com que tarifa a conta foi fechada.
            models.CheckConstraint(
                name=RESV_ACTIVE_HAS_POLICY,
                condition=Q(status__in=["PENDING", "CANCELLED"]) | Q(policy__isnull=False),
            ),
            # Estado terminal exige timestamp e total congelado.
            models.CheckConstraint(
                name="resv_checked_out_complete",
                condition=~Q(status="CHECKED_OUT")
                | (Q(checked_out_at__isnull=False) & Q(total_amount__isnull=False)),
            ),
            # Os tres campos do pagamento nascem juntos ou nao nascem. Meio
            # pagamento gravado (valor sem ator, ator sem instante) seria um
            # recibo que nao se sustenta, e nenhuma leitura saberia se houve
            # pagamento ou nao.
            models.CheckConstraint(
                name=RESV_PAYMENT_COMPLETE,
                condition=(
                    Q(paid_at__isnull=True)
                    & Q(payment_method__isnull=True)
                    & Q(paid_by__isnull=True)
                )
                | (
                    Q(paid_at__isnull=False)
                    & Q(payment_method__isnull=False)
                    & Q(paid_by__isnull=False)
                ),
            ),
            # So se paga o que foi fechado: sem checkout nao existe total.
            models.CheckConstraint(
                name=RESV_PAID_REQUIRES_CHECKED_OUT,
                condition=Q(paid_at__isnull=True) | Q(status="CHECKED_OUT"),
            ),
        ]

    def __str__(self) -> str:
        return f"{self.guest_id} {self.checkin_date} -> {self.checkout_date} ({self.status})"


class StatementLine(models.Model):
    """Uma diaria do extrato, congelada no checkout. Snapshot imutavel.

    Existe porque a 2a via nao pode RECOMPUTAR. Antes, `statement()` chamava
    `calculate_bill` de novo: com a tarifa versionada isso deixou de divergir,
    mas ainda faria o recibo depender de o motor continuar produzindo o mesmo
    numero para a mesma entrada -- e o recibo de uma estadia encerrada nao e
    uma funcao, e um fato.

    `CASCADE` e nao `PROTECT`: a linha nao tem vida sem a reserva, e apagar
    reserva ja e barrado pelo `PROTECT` do hospede.

    `weekday_label` NAO e coluna: deriva de `date` em `build_statement` via
    `pricing.weekday_label`. Nome de dia da semana e formatacao na fronteira de
    I/O -- guardar em coluna congelaria o idioma junto com o dinheiro.
    """

    reservation = models.ForeignKey(
        Reservation,
        on_delete=models.CASCADE,
        related_name="statement_lines",
    )
    date = models.DateField()
    daily_rate = models.DecimalField(max_digits=10, decimal_places=2)
    parking_fee = models.DecimalField(max_digits=10, decimal_places=2)

    class Meta:
        ordering = ["date"]
        constraints = [
            # Uma diaria por data (D1). A constraint e o que impede um checkout
            # reexecutado de duplicar as linhas em silencio.
            models.UniqueConstraint(
                fields=["reservation", "date"],
                name=STMTLINE_UNIQUE_DATE,
            ),
        ]

    def __str__(self) -> str:
        return f"{self.reservation_id} {self.date} {self.daily_rate}"
