"""
Fixtures da borda HTTP (SPEC 6.1).

A senha e (re)definida e SALVA aqui porque `UserFactory` roda com
`skip_postgeneration_save = True`: o `set_password` do post-generation fica
apenas em memoria, e sem este passo nenhum login autenticaria.
"""

from __future__ import annotations

from datetime import date, datetime, time
from zoneinfo import ZoneInfo

import pytest
from rest_framework.test import APIClient

from tests.factories import DEFAULT_PASSWORD, UserFactory

SAO_PAULO = ZoneInfo("America/Sao_Paulo")


def local(day: date, hour: int, minute: int = 0, second: int = 0) -> datetime:
    """Datetime ciente em America/Sao_Paulo -- o fuso das regras (SPEC 0.3)."""
    return datetime.combine(day, time(hour, minute, second), tzinfo=SAO_PAULO)


@pytest.fixture
def api_client() -> APIClient:
    return APIClient()


@pytest.fixture
def attendant(db):
    user = UserFactory()
    user.set_password(DEFAULT_PASSWORD)
    user.save(update_fields=["password"])
    return user


@pytest.fixture
def auth_client(api_client: APIClient, attendant) -> APIClient:
    api_client.force_authenticate(user=attendant)
    return api_client
