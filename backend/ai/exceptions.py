"""
Erros da IA no envelope unico da SPEC 4.1.

Ambos herdam de `hotel.exceptions.ApiError`, o mesmo mecanismo dos erros de
dominio: quem traduz para `{"code","detail","extra"}` e o
`api_exception_handler` do Workstream C. A dependencia e de `ai/` para
`hotel/` (nunca o contrario), logo apagar `ai/` nao deixa orfao (SPEC 8.4/C1).

| code              | HTTP |
|-------------------|------|
| AI_DISABLED       | 503  |
| AI_UPSTREAM_ERROR | 502  |
"""

from __future__ import annotations

from rest_framework import status

from hotel.exceptions import ApiError


class AiDisabledError(ApiError):
    """Sem `ANTHROPIC_API_KEY`: a feature esta desligada, nao quebrada (SPEC 7.2)."""

    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    error_code = "AI_DISABLED"
    default_detail = "Preenchimento por IA indisponível: nenhuma chave configurada."


class AiUpstreamError(ApiError):
    """Timeout, HTTP != 200, JSON invalido ou campo faltante (SPEC 7.2).

    Privacidade (SPEC 2.2): a mensagem e generica de proposito -- nem o texto
    enviado nem o corpo devolvido pelo provedor entram na resposta ou em log.
    """

    status_code = status.HTTP_502_BAD_GATEWAY
    error_code = "AI_UPSTREAM_ERROR"
    default_detail = "O provedor de IA não devolveu uma extração utilizável. Preencha à mão."
