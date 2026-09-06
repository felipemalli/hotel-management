from datetime import UTC, datetime, time
from decimal import Decimal

import pytest
from django.core.cache import caches


@pytest.fixture(autouse=True)
def _fast_password_hashing(settings):
    settings.PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]


@pytest.fixture(autouse=True)
def _isolated_cache(settings):
    # Trocar CACHES primeiro (setting_changed reconstrói o handler) e so depois limpar.
    settings.CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "test-suite",
        }
    }
    caches["default"].clear()
    yield
    caches["default"].clear()


BOOTSTRAP_EFFECTIVE_FROM = datetime(2000, 1, 1, 0, 0, tzinfo=UTC)
BOOTSTRAP_POLICY = {
    "weekday_rate": Decimal("120.00"),
    "weekend_rate": Decimal("180.00"),
    "weekday_park": Decimal("15.00"),
    "weekend_park": Decimal("20.00"),
    "late_fee_factor": Decimal("0.5"),
    "checkin_opens": time(14, 0),
    "checkout_limit": time(12, 0),
    "note": "tarifa do briefing (bootstrap)",
}


@pytest.fixture(autouse=True)
def default_policy(request):
    """flush transacional do pytest-django nao restaura data migration."""
    if "django_db" not in request.keywords and "db" not in request.fixturenames:
        return None

    from hotel.billing.models import PricingPolicy

    policy, _ = PricingPolicy.objects.get_or_create(
        effective_from=BOOTSTRAP_EFFECTIVE_FROM,
        defaults=BOOTSTRAP_POLICY,
    )
    return policy
