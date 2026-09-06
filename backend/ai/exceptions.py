from __future__ import annotations

from rest_framework import status

from core.exceptions import ApiError


class AiDisabledError(ApiError):
    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    error_code = "AI_DISABLED"
    default_detail = "Preenchimento por IA indisponível: nenhuma chave configurada."


class AiUpstreamError(ApiError):
    status_code = status.HTTP_502_BAD_GATEWAY
    error_code = "AI_UPSTREAM_ERROR"
    default_detail = "O provedor de IA não devolveu uma extração utilizável. Preencha à mão."
