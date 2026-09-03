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

from collections.abc import Callable, Iterator, Mapping
from contextlib import contextmanager
from typing import Any

from django.db import IntegrityError, transaction

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


def constraint_name(exc: IntegrityError) -> str | None:
    """Nome da constraint que o PostgreSQL violou, ou `None` se nao houver.

    O `IntegrityError` do Django e um wrapper: a mensagem varia com locale e
    versao, mas o driver traz o campo estruturado. Com psycopg 3 o erro
    original fica em `__cause__` e expoe `diag.constraint_name` -- o
    `PG_DIAG_CONSTRAINT_NAME` do protocolo. Casar por substring da mensagem (o
    que `guests.py` fazia com "document") nao distingue unica de exclusao e
    confunde constraints cujos nomes se contem.
    """
    diag = getattr(getattr(exc, "__cause__", None), "diag", None)
    return getattr(diag, "constraint_name", None)


@contextmanager
def translate_integrity_error(
    errors: Mapping[str, Callable[[], DomainError]],
) -> Iterator[None]:
    """Traduz violacao de constraint em erro de dominio, por NOME.

    Duas razoes para o `atomic()` interno: (1) savepoint, para que o
    `IntegrityError` nao deixe a transacao do chamador abortada -- toda
    constraint deste projeto e verificada no proprio comando, nunca
    `DEFERRABLE`, logo o savepoint em volta da escrita basta; (2) sem ele, uma
    escrita que falha dentro de uma `atomic` externa envenena a transacao
    inteira e o 409 seguinte viraria 500.

    Nome desconhecido sobe intacto: constraint nova sem traducao e bug de
    programacao, e mascara-la como erro de dominio esconderia o bug.
    """
    try:
        with transaction.atomic():
            yield
    except IntegrityError as exc:
        factory = errors.get(constraint_name(exc) or "")
        if factory is None:
            raise
        raise factory() from exc
