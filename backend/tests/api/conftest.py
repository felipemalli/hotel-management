from __future__ import annotations

from datetime import date, datetime, time
from zoneinfo import ZoneInfo

import pytest
from rest_framework.test import APIClient

from tests.factories import UserFactory

SAO_PAULO = ZoneInfo("America/Sao_Paulo")


def local(day: date, hour: int, minute: int = 0, second: int = 0) -> datetime:
    return datetime.combine(day, time(hour, minute, second), tzinfo=SAO_PAULO)


@pytest.fixture
def api_client() -> APIClient:
    return APIClient()


@pytest.fixture
def attendant(db):
    return UserFactory()


@pytest.fixture
def auth_client(api_client: APIClient, attendant) -> APIClient:
    api_client.force_authenticate(user=attendant)
    return api_client


@pytest.fixture
def hotel_admin(db):
    return UserFactory(username="admin-do-teste", admin=True)


@pytest.fixture
def admin_client(hotel_admin) -> APIClient:
    client = APIClient()
    client.force_authenticate(user=hotel_admin)
    return client
