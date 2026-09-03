"""
Envelope unico de erro da API (SPEC 4.1).

Toda resposta de erro -- de validacao, de autenticacao, de dominio -- sai com
a mesma forma `{"code", "detail", "extra"}`. O frontend ramifica por `code`
(ex.: `EARLY_CHECKIN` abre o modal do F2, SPEC 5.3), nunca por texto.

| code               | HTTP |
|--------------------|------|
| VALIDATION_ERROR   | 400  |
| NOT_AUTHENTICATED  | 401  |
| PERMISSION_DENIED  | 403  |
| NOT_FOUND          | 404  |
| EARLY_CHECKIN      | 409  |
| INVALID_STATUS     | 409  |
| DUPLICATE_DOCUMENT | 409  |
| THROTTLED          | 429  |
| AI_UPSTREAM_ERROR  | 502  |
| AI_DISABLED        | 503  |

Privacidade (SPEC 2.2): este modulo nao loga nada e **nao ecoa o body** da
requisicao -- o `extra` de validacao carrega apenas os nomes dos campos e as
mensagens do DRF, nunca os valores enviados.
"""

from __future__ import annotations

from typing import Any

from django.core.exceptions import PermissionDenied as DjangoPermissionDenied
from django.http import Http404
from rest_framework import exceptions
from rest_framework.response import Response
from rest_framework.settings import api_settings
from rest_framework.views import exception_handler as drf_exception_handler

from hotel.services.errors import VALIDATION_DETAIL, DomainError

GENERIC_DETAIL = "Não foi possível processar a requisição."


class ApiError(exceptions.APIException):
    """`APIException` que carrega um `code` da tabela SPEC 4.1.

    `error_code`, e nao `code`, porque `APIException.__init__` ja recebe um
    `code`: o slug que o DRF gruda em cada `ErrorDetail` (`invalid`,
    `not_found`). Sao dois conceitos, e `AiUpstreamError(code="X")` nao deve
    parecer que muda o envelope. Sobrescrever o `default_code` teria o mesmo
    problema pelo avesso: e o campo do framework, em snake_case, nao o nosso.
    """

    error_code = "ERROR"
    extra: dict[str, Any] = {}


def envelope(code: str, detail: str, extra: dict[str, Any] | None = None) -> dict[str, Any]:
    return {"code": code, "detail": detail, "extra": extra or {}}


def api_exception_handler(exc: Exception, context: dict) -> Response | None:
    """`REST_FRAMEWORK["EXCEPTION_HANDLER"]` -- ponto unico do envelope."""
    if isinstance(exc, DomainError):
        # Erro de dominio: o service ja nasce com code/detail/extra/status do
        # envelope (SPEC 3.2/3.4), a view nao precisa saber traduzir nada.
        return Response(
            envelope(exc.code, exc.detail, exc.extra),
            status=exc.status_code,
        )

    exc = _as_api_exception(exc)
    response = drf_exception_handler(exc, context)
    if response is None:
        # Excecao nao tratada: deixa estourar (500 do Django), sem mascarar bug
        # em envelope bonitinho.
        return None

    code, extra = _classify(exc)
    response.data = envelope(code, _detail_of(exc, response), extra)
    return response


def _as_api_exception(exc: Exception) -> Exception:
    """Troca os erros do Django pelos equivalentes do DRF.

    O `exception_handler` do DRF faz essa conversao, mas so na variavel local
    dele: o `exc` que chega ao `_classify` continua sendo o do Django, que nao
    tem `default_code` para derivar codigo nenhum. Sem isto, o
    `PermissionDenied` do Django sai como `ERROR` num HTTP 403.
    """
    if isinstance(exc, Http404):
        return exceptions.NotFound(*exc.args)
    if isinstance(exc, DjangoPermissionDenied):
        return exceptions.PermissionDenied(*exc.args)
    return exc


def _classify(exc: Exception) -> tuple[str, dict[str, Any]]:
    """`code` do envelope. So tem ramo onde o nome derivado sairia errado."""
    if isinstance(exc, exceptions.ValidationError):
        # Derivaria INVALID, e as mensagens por campo tem de virar `extra`.
        return "VALIDATION_ERROR", _field_errors(exc.detail)
    error_code = getattr(exc, "error_code", None)
    if error_code:
        return str(error_code), dict(getattr(exc, "extra", None) or {})
    if isinstance(exc, exceptions.NotAuthenticated | exceptions.AuthenticationFailed):
        # `AuthenticationFailed` derivaria AUTHENTICATION_FAILED, fora da
        # tabela: credencial invalida e credencial ausente sao o mesmo 401.
        return "NOT_AUTHENTICATED", {}
    # `default_code` do DRF em maiusculas -- e assim que NOT_FOUND, THROTTLED e
    # PERMISSION_DENIED saem certos sem ramo proprio. Excecao futura do DRF cai
    # aqui com um nome legivel em vez de ERROR.
    return str(getattr(exc, "default_code", "error")).upper(), {}


def _detail_of(exc: Exception, response: Response) -> str:
    if isinstance(exc, exceptions.ValidationError):
        # A mensagem humana de validacao vive em `extra`, por campo.
        return VALIDATION_DETAIL
    data = response.data
    if isinstance(data, dict) and "detail" in data:
        return str(data["detail"])
    if isinstance(data, list) and data:
        return str(data[0])
    return GENERIC_DETAIL


def _field_errors(detail: Any) -> dict[str, Any]:
    """`extra` = erros por campo do DRF (SPEC 4.1), sempre em forma de dict."""
    if isinstance(detail, dict):
        return {
            str(field): value if isinstance(value, list | dict) else [value]
            for field, value in detail.items()
        }
    if isinstance(detail, list):
        return {api_settings.NON_FIELD_ERRORS_KEY: detail}
    return {api_settings.NON_FIELD_ERRORS_KEY: [detail]}
