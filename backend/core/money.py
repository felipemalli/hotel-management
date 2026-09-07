from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal

ZERO = Decimal("0.00")
CENTS = Decimal("0.01")

# Kwargs de coluna e de campo DRF: o dinheiro tem uma so forma no projeto.
MONEY = {"max_digits": 10, "decimal_places": 2}


def quantize_money(value: Decimal) -> Decimal:
    """Unico ponto de arredondamento do projeto: meia unidade para cima."""
    return value.quantize(CENTS, rounding=ROUND_HALF_UP)
