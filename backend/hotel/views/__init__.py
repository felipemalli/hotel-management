"""
Views da API (SPEC 4.2-4.4) -- fachada do pacote.

Views **finas** por invariante (SPEC 0.3): elas resolvem HTTP, leem o relogio
e delegam. Nenhuma view calcula dinheiro nem monta QuerySet a mao -- leitura
vem de `selectors`, mutacao e dinheiro vem de `services`.

Documentacao (SPEC 4.4): toda action custom carrega `@extend_schema` com
request, response e exemplo de erro -- `/api/docs/` e contrato navegavel. Era
o que fazia deste arquivo unico dois tercos de decorador: os exemplos
compartilhados foram para `openapi.py` e cada recurso ganhou seu modulo.

Reexportacao **explicita** (nunca `import *`): `from hotel.views import
GuestViewSet` segue valido em `config/urls.py` e em todo teste.
"""

from __future__ import annotations

from hotel.views.guests import GuestViewSet
from hotel.views.reservations import ReservationViewSet

__all__ = ["GuestViewSet", "ReservationViewSet"]
