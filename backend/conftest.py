"""
Fixtures globais da suite.

Duas correcoes de ambiente de teste, ambas com efeito mensuravel:

* Hasher rapido. O PBKDF2 de producao custa ~0,5 s por hash; a suite de API
  criava usuario em quase todo teste e passava a maior parte do tempo dentro do
  hasher, nao no codigo sob teste. Trocar o hasher no teste e a pratica
  recomendada pela propria documentacao do Django.
* Cache local e limpo. Em producao o cache e o Postgres, compartilhado entre os
  workers do gunicorn (ver `settings.CACHES`), porque o throttling do DRF guarda
  o historico de chamadas ali. No teste isso seria ruim duas vezes: exigiria a
  tabela de cache no banco de teste (que nao vem por migracao, e por isso
  faltaria nos testes sem `django_db`) e deixaria historico vazando de um teste
  para o proximo. Memoria, zerada nas duas pontas, resolve os dois.
"""

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
