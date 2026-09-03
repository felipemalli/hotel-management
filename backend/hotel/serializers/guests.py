"""
I/O dos hospedes (SPEC 4.3).

Fronteira de I/O e nada mais: nenhuma regra de negocio e nenhuma leitura de
relogio (SPEC 0.3). Formato de documento e telefone (D9) e **forma** e fica
aqui; unicidade de documento (D12) depende do estado do banco e mora em
`services.guests.create_guest`.
"""

from __future__ import annotations

from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from hotel.models import Guest
from hotel.normalization import (
    DOCUMENT_MAX_LENGTH,
    DOCUMENT_MIN_LENGTH,
    PHONE_MAX_LENGTH,
    normalize_document,
)
from hotel.selectors import (
    ACTIVE_COMPANION_RESERVATIONS_ATTR,
    ACTIVE_RESERVATIONS_ATTR,
    PENDING_COMPANION_RESERVATIONS_ATTR,
    PENDING_RESERVATIONS_ATTR,
)
from hotel.serializers.reservations import ReservationSummarySerializer


class GuestSerializer(serializers.ModelSerializer):
    """Listagens, detalhe e abas: valor gravado, ja normalizado (SPEC 2.1)."""

    class Meta:
        model = Guest
        fields = ["id", "full_name", "document", "phone", "nationality", "created_at"]
        read_only_fields = fields


class GuestCreateSerializer(serializers.ModelSerializer):
    """Forma do cadastro (SPEC 4.3). Os 3 campos minimos do briefing sao obrigatorios.

    Comprimento do documento (D9) e forma, e fica aqui. O TELEFONE nao tem
    mais checagem de comprimento aqui: "ao menos 8 digitos" era uma medida, nao
    uma regra, e um numero valido com DDI passa por `to_e164_digits` no
    servico. Duas checagens sobre o mesmo campo dariam duas mensagens
    diferentes para a mesma entrada ruim, conforme qual falhasse primeiro. O que
    depende de conhecimento de mundo NAO fica: a validade do telefone
    internacional (lista de DDIs e planos de numeracao) e a lista ISO de
    nacionalidades vivem em `services.guests.create_guest` (SPEC 3.4), junto
    com a unicidade de documento (D12) -- tudo isso tem de valer para o seed e
    para o shell, nao so para quem entra por HTTP. `nationality` aqui e so
    "exatamente 2 caracteres".

    `document` e `phone` sao declarados explicitamente para carregar
    `allow_blank=False` e o maximo de entrada de D9 -- e para que o duplicado
    nunca saia como `400 VALIDATION_ERROR` comparando valor nao normalizado.
    """

    document = serializers.CharField(
        allow_blank=False,
        max_length=DOCUMENT_MAX_LENGTH,
        trim_whitespace=True,
    )
    nationality = serializers.CharField(
        allow_blank=False,
        min_length=2,
        max_length=2,
        trim_whitespace=True,
        help_text="Código ISO 3166-1 alpha-2, ex.: `BR`.",
    )
    phone = serializers.CharField(
        allow_blank=False,
        max_length=PHONE_MAX_LENGTH,
        trim_whitespace=True,
    )

    class Meta:
        model = Guest
        fields = ["full_name", "document", "phone", "nationality"]
        extra_kwargs = {
            "full_name": {"allow_blank": False, "trim_whitespace": True},
        }

    def validate_document(self, value: str) -> str:
        # Minimo aferido APOS a normalizacao de D9 (alfanumerico maiusculo):
        # `12.3` tem 4 caracteres, mas so 3 alfanumericos.
        normalized = normalize_document(value)
        if len(normalized) < DOCUMENT_MIN_LENGTH:
            raise serializers.ValidationError(
                f"Documento exige ao menos {DOCUMENT_MIN_LENGTH} caracteres alfanuméricos."
            )
        return value.strip()



class GuestInHotelSerializer(GuestSerializer):
    """Aba "no hotel" (RF4). `active_reservation` e unico pela constraint SPEC 1.5."""

    active_reservation = serializers.SerializerMethodField()

    class Meta(GuestSerializer.Meta):
        fields = [*GuestSerializer.Meta.fields, "active_reservation"]

    @extend_schema_field(ReservationSummarySerializer(allow_null=True))
    def get_active_reservation(self, guest: Guest) -> dict | None:
        reservations = _merged(guest, ACTIVE_RESERVATIONS_ATTR, ACTIVE_COMPANION_RESERVATIONS_ATTR)
        if not reservations:
            return None
        return ReservationSummarySerializer(reservations[0]).data


class GuestPendingCheckinSerializer(GuestSerializer):
    """Aba "check-in pendente" (RF5). Plural: um hospede pode ter varias futuras."""

    pending_reservations = serializers.SerializerMethodField()

    class Meta(GuestSerializer.Meta):
        fields = [*GuestSerializer.Meta.fields, "pending_reservations"]

    @extend_schema_field(ReservationSummarySerializer(many=True))
    def get_pending_reservations(self, guest: Guest) -> list[dict]:
        reservations = _merged(
            guest, PENDING_RESERVATIONS_ATTR, PENDING_COMPANION_RESERVATIONS_ATTR
        )
        return ReservationSummarySerializer(reservations, many=True).data


def _merged(guest: Guest, own_attr: str, companion_attr: str) -> list:
    """Reservas do hospede como titular e como acompanhante, em uma lista.

    Ordenada por `(checkin_date, id)` em Python e nao no banco: sao dois
    prefetches distintos, e ordenar cada um separadamente daria uma
    concatenacao com as vencidas no meio. A aba precisa de
    `[vencidas, futuras]` -- e o que `test_pending_checkin_endpoint_shape`
    verifica.
    """
    own = getattr(guest, own_attr, None) or []
    companion = getattr(guest, companion_attr, None) or []
    return sorted([*own, *companion], key=lambda r: (r.checkin_date, r.pk))
