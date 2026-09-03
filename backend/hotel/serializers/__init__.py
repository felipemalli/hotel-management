"""
Serializers da API (SPEC 4.3-4.4) -- fachada do pacote.

Fronteira de I/O e nada mais. Nenhum calculo de dinheiro acontece aqui
(SPEC 0.3: dinheiro e de `services/pricing.py`); o que existe e serializacao
de `Decimal` -- e o `DecimalField` do DRF garante a saida como **string**
decimal (`"120.00"`), nunca como numero de ponto flutuante.

Listagens e detalhe devolvem o valor gravado (normalizado, SPEC 2.1). A
formatacao para exibicao (mascara de CPF/telefone) e do frontend.

Era um arquivo unico; virou pacote quando passou a hospedar recursos com
capitulos independentes. Os nomes seguem importaveis de `hotel.serializers`:
esta fachada e o que mantem `from hotel.serializers import X` valido em todo
chamador. Reexportacao **explicita** (nunca `import *`) para que o linter
enxergue o que existe.
"""

from __future__ import annotations

from hotel.serializers.common import (
    MONEY,
    ErrorEnvelopeSerializer,
    GuestMinimalSerializer,
    UserMinimalSerializer,
    money_field,
)
from hotel.serializers.guests import (
    GuestCreateSerializer,
    GuestInHotelSerializer,
    GuestPendingCheckinSerializer,
    GuestSerializer,
)
from hotel.serializers.policies import (
    PricingPolicyCreateSerializer,
    PricingPolicySerializer,
)
from hotel.serializers.reservations import (
    CheckInRequestSerializer,
    PaymentRequestSerializer,
    ReservationCreateSerializer,
    ReservationListQuerySerializer,
    ReservationSerializer,
    ReservationSummarySerializer,
)
from hotel.serializers.statement import (
    BillLineSerializer,
    LateFeeSerializer,
    PaymentSerializer,
    StatementSerializer,
    build_statement,
)

__all__ = [
    "MONEY",
    "BillLineSerializer",
    "CheckInRequestSerializer",
    "ErrorEnvelopeSerializer",
    "GuestCreateSerializer",
    "GuestInHotelSerializer",
    "GuestMinimalSerializer",
    "GuestPendingCheckinSerializer",
    "GuestSerializer",
    "LateFeeSerializer",
    "PaymentRequestSerializer",
    "PaymentSerializer",
    "PricingPolicyCreateSerializer",
    "PricingPolicySerializer",
    "ReservationCreateSerializer",
    "ReservationListQuerySerializer",
    "ReservationSerializer",
    "ReservationSummarySerializer",
    "StatementSerializer",
    "UserMinimalSerializer",
    "build_statement",
    "money_field",
]
