"""
Fixtures globais da suite.

Duas correcoes de ambiente de teste, ambas com efeito mensuravel:

* Hasher rapido. O PBKDF2 de producao custa ~0,5 s por hash; a suite de API
  criava usuario em quase todo teste e passava a maior parte do tempo dentro do
  hasher, nao no codigo sob teste. Trocar o hasher no teste e a pratica
  recomendada pela propria documentacao do Django.
* Politica de tarifa de bootstrap sempre presente. A linha entra por data
  migration, mas o `flush` transacional do pytest-django NAO restaura dado de
  migration: sem esta fixture, o primeiro teste que fizesse check-in derrubaria
  a suite inteira com "nenhuma PricingPolicy vigente". `get_or_create` pela
  mesma chave da migration (a sentinela) mantem a fixture inocua quando o dado
  sobreviveu.
* Cache local e limpo. Em producao o cache e o Postgres, compartilhado entre os
  workers do gunicorn (ver `settings.CACHES`), porque o throttling do DRF guarda
  o historico de chamadas ali. No teste isso seria ruim duas vezes: exigiria a
  tabela de cache no banco de teste (que nao vem por migracao, e por isso
  faltaria nos testes sem `django_db`) e deixaria historico vazando de um teste
  para o proximo. Memoria, zerada nas duas pontas, resolve os dois.
"""

from datetime import UTC, datetime, time
from decimal import Decimal

import pytest
from django.core.cache import caches


@pytest.fixture(autouse=True)
def _fast_password_hashing(settings):
    settings.PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]


@pytest.fixture(autouse=True)
def _isolated_cache(settings):
    # A ordem importa: trocar CACHES primeiro (o sinal `setting_changed` do
    # Django reconstroi o handler) e so depois limpar. Limpar antes bateria no
    # cache de banco e quebraria todo teste sem `django_db`.
    settings.CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "test-suite",
        }
    }
    caches["default"].clear()
    yield
    caches["default"].clear()


# Mesma chave e mesmos valores da data migration `hotel/0005_pricingpolicy`.
# A sentinela em 2000 e o que faz `policy_in_force` responder para os testes
# que congelam o relogio em marco/2025 e para o seed, que faz check-in "ontem".
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
    """A politica do briefing, garantida em todo teste que toca o banco.

    Autouse e sem custo para quem nao usa banco: sem a marca `django_db` a
    fixture nao faz nada. Idempotente por `get_or_create`, como o seed -- as
    duas escritas usam a mesma chave.
    """
    if "django_db" not in request.keywords and "db" not in request.fixturenames:
        return None

    from hotel.models import PricingPolicy

    policy, _ = PricingPolicy.objects.get_or_create(
        effective_from=BOOTSTRAP_EFFECTIVE_FROM,
        defaults=BOOTSTRAP_POLICY,
    )
    return policy
