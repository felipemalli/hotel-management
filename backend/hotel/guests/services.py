from __future__ import annotations

from core.errors import DomainError, DomainValidationError, translate_integrity_error
from hotel.guests.models import GUEST_DOCUMENT_UNIQUE, Guest
from hotel.guests.normalization import (
    ISO_3166_ALPHA2,
    normalize_country,
    normalize_document,
    to_e164_digits,
)

PHONE_HELP = "Informe o telefone com o código do país, ex.: +55 21 98888-7777."
NATIONALITY_HELP = "Informe a nacionalidade como código ISO 3166-1 alpha-2, ex.: BR."


class DuplicateDocumentError(DomainError):
    code = "DUPLICATE_DOCUMENT"
    default_detail = "Documento já cadastrado para outro hóspede."


def create_guest(*, full_name: str, document: str, phone: str, nationality: str) -> Guest:
    phone = _to_e164(phone)
    nationality = _assert_known_country(nationality)
    _assert_document_available(document)
    with translate_integrity_error({GUEST_DOCUMENT_UNIQUE: DuplicateDocumentError}):
        return Guest.objects.create(
            full_name=full_name,
            document=document,
            phone=phone,
            nationality=nationality,
        )


def _to_e164(phone: str) -> str:
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
    if Guest.objects.filter(document=normalize_document(document)).exists():
        raise DuplicateDocumentError
