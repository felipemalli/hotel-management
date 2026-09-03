"""
Erros de dominio no formato do envelope (SPEC 4.1).

Um erro de dominio ja nasce sabendo o proprio `code`, `detail`, `extra` e
status HTTP -- a view nao traduz nada e o handler tem um unico ramo. Isso e o
que permite a regra de negocio morar no servico (SPEC 3.4) sem que o servico
importe DRF: a camada de dominio depende apenas da linguagem, e a borda HTTP
le estes atributos.

Duas familias, porque a SPEC 4.1 tem dois significados distintos:

* `DomainError` -- conflito com o estado atual do recurso (409). O cliente
  resolve mudando o mundo (fazer checkout antes de novo check-in) ou a
  requisicao (`allow_early`).
* `DomainValidationError` -- a entrada viola uma regra de negocio (400). Sai
  no mesmo formato por campo do `ValidationError` do DRF, de proposito: o
  cliente nao deve perceber se a regra foi checada no serializer ou no
  servico.
"""

from __future__ import annotations

from typing import Any

VALIDATION_DETAIL = "Dados inválidos."


class DomainError(Exception):
    """Regra de negocio violada. Carrega o envelope da SPEC 4.1."""

    code = "ERROR"
    status_code = 409
    default_detail = "Operação inválida."

    def __init__(self, detail: str | None = None, extra: dict[str, Any] | None = None) -> None:
        self.detail = detail or self.default_detail
        self.extra = extra or {}
        super().__init__(self.detail)


class DomainValidationError(DomainError):
    """Entrada recusada por regra de negocio -- 400 VALIDATION_ERROR.

    `extra` e o mapa `{campo: [mensagem]}` que o envelope da SPEC 4.1 usa para
    validacao, identico ao que o DRF produz. Assim D11/D13 puderam sair do
    serializer (onde liam o relogio, violando SPEC 0.3) sem que a resposta
    mudasse um byte.
    """

    code = "VALIDATION_ERROR"
    status_code = 400
    default_detail = VALIDATION_DETAIL

    def __init__(self, field: str, message: str) -> None:
        super().__init__(detail=None, extra={field: [message]})
