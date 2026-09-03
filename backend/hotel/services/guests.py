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

from hotel.models import GUEST_DOCUMENT_UNIQUE, Guest
from hotel.normalization import (
    ISO_3166_ALPHA2,
    normalize_country,
    normalize_document,
    to_e164_digits,
)
from hotel.services.errors import (
    DomainError,
    DomainValidationError,
    translate_integrity_error,
)

PHONE_HELP = "Informe o telefone com o código do país, ex.: +55 21 98888-7777."
NATIONALITY_HELP = "Informe a nacionalidade como código ISO 3166-1 alpha-2, ex.: BR."



class DuplicateDocumentError(DomainError):
    """Segundo cadastro do mesmo documento -- 409 DUPLICATE_DOCUMENT (D12)."""

    code = "DUPLICATE_DOCUMENT"
    default_detail = "Documento já cadastrado para outro hóspede."


def create_guest(*, full_name: str, document: str, phone: str, nationality: str) -> Guest:
    """Cadastra um hospede (RF1). Documento e unico por hospede (D12).

    Telefone e nacionalidade sao validados AQUI, e nao no serializer, pela mesma
    razao de D11/D13: a regra tem de valer para o seed, para o shell e para
    qualquer importador futuro, nao so para quem entra por HTTP. O cliente nao
    percebe a diferenca -- sai o mesmo `400 VALIDATION_ERROR` por campo.
    """
    phone = _to_e164(phone)
    nationality = _assert_known_country(nationality)
    _assert_document_available(document)
    # O helper traduz por NOME de constraint e ja abre o savepoint: chamado de
    # dentro de uma `atomic` externa (o seed), o IntegrityError nao derruba a
    # transacao do chamador.
    with translate_integrity_error({GUEST_DOCUMENT_UNIQUE: DuplicateDocumentError}):
        # `Guest.save()` normaliza documento e telefone (SPEC 2.1); por isso a
        # escrita e `create`, nunca `bulk_create`.
        return Guest.objects.create(
            full_name=full_name,
            document=document,
            phone=phone,
            nationality=nationality,
        )


def _to_e164(phone: str) -> str:
    """Traduz a recusa tecnica de `to_e164_digits` no envelope por campo."""
    try:
        return to_e164_digits(phone)
    except ValueError as exc:
        raise DomainValidationError("phone", PHONE_HELP) from exc


def _assert_known_country(nationality: str) -> str:
    normalized = normalize_country(nationality)
    if normalized not in ISO_3166_ALPHA2:
        raise DomainValidationError("nationality", NATIONALITY_HELP)
    return normalized


def _assert_document_available(document: str) -> None:
    """Guarda de leitura para D12; a corrida fica com a constraint unica."""
    if Guest.objects.filter(document=normalize_document(document)).exists():
        raise DuplicateDocumentError
