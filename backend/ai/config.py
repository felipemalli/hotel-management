from __future__ import annotations

import os

from django.conf import settings

DEFAULT_MODEL = "claude-haiku-4-5"
TIMEOUT_SECONDS = 10.0


def api_key() -> str:
    return str(getattr(settings, "ANTHROPIC_API_KEY", "") or "").strip()


def ai_enabled() -> bool:
    return bool(api_key())


def model() -> str:
    configured = getattr(settings, "ANTHROPIC_MODEL", "") or os.environ.get("ANTHROPIC_MODEL", "")
    return str(configured).strip() or DEFAULT_MODEL


def ai_throttle_rate() -> str:
    # Fora de settings.py para que apagar backend/ai/ nao deixe chave morta la.
    return os.environ.get("THROTTLE_AI", "20/min").strip() or "20/min"
