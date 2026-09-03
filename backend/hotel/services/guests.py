"""
Camada de mutacao dos hospedes (SPEC 3.4, D12).

Existe pela mesma razao que `reservations.py`: **toda** escrita passa por
servico. Antes, criar hospede era a unica mutacao sem essa camada -- a regra
de documento unico vivia no serializer e a corrida era traduzida na view, o
que deixava o caminho de escrita do seed e de qualquer futuro importador sem
guarda nenhuma.

Divisao de trabalho de D12, a mesma de `check_in`: a leitura previa da a
mensagem boa no caminho comum, e a constraint unica do banco e a autoridade
final na corrida entre dois cadastros simultaneos.
"""

from __future__ import annotations

from django.db import IntegrityError, transaction

from hotel.models import Guest
from hotel.normalization import normalize_document
from hotel.services.errors import DomainError

# Fragmento presente na mensagem do PostgreSQL para a unicidade de
# `document` (SPEC 1.2), qualquer que seja o nome gerado pelo Django.
DOCUMENT_UNIQUE_MARKER = "document"


class DuplicateDocumentError(DomainError):
    """Segundo cadastro do mesmo documento -- 409 DUPLICATE_DOCUMENT (D12)."""

    code = "DUPLICATE_DOCUMENT"
    default_detail = "Documento já cadastrado para outro hóspede."


def create_guest(*, full_name: str, document: str, phone: str) -> Guest:
    """Cadastra um hospede (RF1). Documento e unico por hospede (D12)."""
    _assert_document_available(document)
    try:
        # Savepoint: se `create_guest` for chamado dentro de uma `atomic`
        # externa, o IntegrityError nao derruba a transacao do chamador.
        with transaction.atomic():
            # `Guest.save()` normaliza documento e telefone (SPEC 2.1); por isso
            # a escrita e `create`, nunca `bulk_create`.
            return Guest.objects.create(full_name=full_name, document=document, phone=phone)
    except IntegrityError as exc:
        if DOCUMENT_UNIQUE_MARKER in str(exc):
            raise DuplicateDocumentError from exc
        raise


def _assert_document_available(document: str) -> None:
    """Guarda de leitura para D12; a corrida fica com a constraint unica."""
    if Guest.objects.filter(document=normalize_document(document)).exists():
        raise DuplicateDocumentError
