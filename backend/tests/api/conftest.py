"""
Fixtures da borda HTTP (SPEC 6.1).
"""

from __future__ import annotations

from datetime import date, datetime, time
from zoneinfo import ZoneInfo

import pytest
from rest_framework.test import APIClient

from tests.factories import UserFactory

SAO_PAULO = ZoneInfo("America/Sao_Paulo")


def local(day: date, hour: int, minute: int = 0, second: int = 0) -> datetime:
    """Datetime ciente em America/Sao_Paulo -- o fuso das regras (SPEC 0.3)."""
    return datetime.combine(day, time(hour, minute, second), tzinfo=SAO_PAULO)


@pytest.fixture
def api_client() -> APIClient:
    return APIClient()


@pytest.fixture
def attendant(db):
    # `UserFactory` ja grava o hash no INSERT; um segundo `set_password` aqui
    # so pagaria o hasher de novo.
    return UserFactory()


@pytest.fixture
def auth_client(api_client: APIClient, attendant) -> APIClient:
    api_client.force_authenticate(user=attendant)
    return api_client


@pytest.fixture
def hotel_admin(db):
    """Usuario com `role=ADMIN` e `is_staff=False` -- o papel do produto."""
    return UserFactory(username="admin-do-teste", admin=True)


@pytest.fixture
def admin_client(hotel_admin) -> APIClient:
    """Cliente separado do `auth_client` de proposito.

    Um unico cliente que troca de usuario no meio do teste esconderia o que a
    rota administrativa precisa provar: que o MESMO pedido, so mudando quem o
    faz, passa ou recebe 403.
    """
    client = APIClient()
    client.force_authenticate(user=hotel_admin)
    return client
