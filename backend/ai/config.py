"""
Configuracao da feature de IA (SPEC 7.2).

A leitura mora aqui, e nao em `config/settings.py`, por causa do corte limpo da
SPEC 8.4/C1: a lista de arquivos a apagar quando a IA sai da entrega nao inclui
`settings.py`, logo nada que exista **so** para a IA pode morar lá. `settings`
continua sendo a fonte da chave (`ANTHROPIC_API_KEY`, ja lido pelo Workstream
C) -- o que este modulo faz e derivar o portao de fallback a partir dela, em
tempo de chamada (nunca em tempo de import), para que o teste possa ligar e
desligar a feature com o fixture `settings`.
"""

from __future__ import annotations

import os

from django.conf import settings

# Modelo barato e suficiente para extracao (SPEC 7.2). Sobrescrevivel por env
# `ANTHROPIC_MODEL` -- conferir modelos vigentes em docs.claude.com.
DEFAULT_MODEL = "claude-haiku-4-5"

# Timeout curto: o atendente esta no balcao com o hospede na frente. Estourar
# em 10 s e melhor do que travar o formulario (SPEC 7.2).
TIMEOUT_SECONDS = 10.0


def api_key() -> str:
    return str(getattr(settings, "ANTHROPIC_API_KEY", "") or "").strip()


def ai_enabled() -> bool:
    """`AI_ENABLED` da SPEC 7.2: existe chave, existe feature."""
    return bool(api_key())


def model() -> str:
    configured = getattr(settings, "ANTHROPIC_MODEL", "") or os.environ.get("ANTHROPIC_MODEL", "")
    return str(configured).strip() or DEFAULT_MODEL
