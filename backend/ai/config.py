from __future__ import annotations

import os

from django.conf import settings

DEFAULT_MODEL = "gemini-3.8-flash"
TIMEOUT_SECONDS = 10.0  # por chamada HTTP
# Laco inteiro. Cabe com folga no timeout de 30 s do worker: no pior caso o
# atendente ve um toast de 502, nunca um worker morto.
BUDGET_SECONDS = 15.0
MAX_TOOL_ROUNDS = 4  # 5 chamadas HTTP no maximo


def api_keys() -> list[str]:
    """Chaves na ordem de tentativa: a gratuita primeiro, a paga como reserva.

    A chave herda o tier do projeto que a emitiu, e num projeto com billing tudo
    e pago. "Gratis ate acabar, depois cobra" so existe com duas chaves: o 429
    da gratuita faz o client repetir na paga.
    """
    candidates = (
        getattr(settings, "GEMINI_API_KEY", ""),
        getattr(settings, "GEMINI_API_KEY_PAID", ""),
    )
    return [key for key in (str(value or "").strip() for value in candidates) if key]


def ai_enabled() -> bool:
    # Deploy so com a chave paga tambem liga a feature.
    return bool(api_keys())


def model() -> str:
    configured = getattr(settings, "GEMINI_MODEL", "") or os.environ.get("GEMINI_MODEL", "")
    return str(configured).strip() or DEFAULT_MODEL


def ai_throttle_rate() -> str:
    # Fora de settings.py para que apagar backend/ai/ nao deixe chave morta la.
    return os.environ.get("THROTTLE_AI", "20/min").strip() or "20/min"
