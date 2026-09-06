from __future__ import annotations

from django.conf import settings

DEFAULT_MODEL = "gpt-4.1-nano"
TIMEOUT_SECONDS = 10.0
BUDGET_SECONDS = 15.0
MAX_ROUNDS = 7


def api_key() -> str:
    return str(settings.OPENAI_API_KEY).strip()


def ai_enabled() -> bool:
    return bool(api_key())


def model() -> str:
    return str(settings.OPENAI_MODEL).strip() or DEFAULT_MODEL
