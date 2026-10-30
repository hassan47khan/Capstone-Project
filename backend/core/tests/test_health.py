"""`GET /health/` (spec sections 5 and 12).

The split that matters: MongoDB is the only dependency that can make this a
503, because it is the system of record. Redis being down is `degraded` --
the app still reads and writes, reminders are merely late, and their rows
are safe in MongoDB either way.
"""

from unittest import mock

import pytest
from django.db import DatabaseError
from redis.exceptions import ConnectionError as RedisConnectionError
from rest_framework.test import APIClient


@pytest.fixture
def redis_up(settings):
    settings.REDIS_URL = "redis://localhost:6379/0"
    with mock.patch("core.views.redis.Redis.from_url") as from_url:
        from_url.return_value.ping.return_value = True
        yield from_url


@pytest.fixture
def redis_down(settings):
    settings.REDIS_URL = "redis://localhost:6379/0"
    with mock.patch("core.views.redis.Redis.from_url") as from_url:
        from_url.return_value.ping.side_effect = RedisConnectionError("refused")
        yield from_url


@pytest.mark.django_db
def test_health_returns_200(redis_up):
    response = APIClient().get("/api/v1/health/")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "database": "ok",
        "redis": "ok",
        # Phase 4 and phase 5 fill these in.
        "oldest_overdue_reminder_minutes": None,
        "llm": None,
    }


@pytest.mark.django_db
def test_health_needs_no_token(redis_up):
    # A garbage Authorization header must not turn a liveness probe into a 401.
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION="Bearer not-a-token")

    assert client.get("/api/v1/health/").status_code == 200


@pytest.mark.django_db
def test_health_returns_503_when_mongodb_is_down():
    with mock.patch("core.views.connection.ensure_connection", side_effect=DatabaseError):
        response = APIClient().get("/api/v1/health/")

    assert response.status_code == 503
    assert response.json()["database"] == "down"


@pytest.mark.django_db
def test_redis_being_down_is_degraded_and_not_an_outage(redis_down):
    response = APIClient().get("/api/v1/health/")

    # Still 200: the app works, so the client must not show its retry screen.
    assert response.status_code == 200
    assert response.json()["status"] == "degraded"
    assert response.json()["redis"] == "down"
    assert response.json()["database"] == "ok"


@pytest.mark.django_db
def test_no_redis_configured_reads_as_down(settings):
    # Truthfully so: with no broker there is no worker, so nothing on the
    # beat schedule is running.
    settings.REDIS_URL = None

    assert APIClient().get("/api/v1/health/").json()["redis"] == "down"


@pytest.mark.django_db
def test_the_redis_check_cannot_hang_the_probe(redis_up):
    APIClient().get("/api/v1/health/")

    # A liveness probe that blocks on a dead Redis is worse than useless.
    assert redis_up.call_args.kwargs == {"socket_connect_timeout": 2, "socket_timeout": 2}


@pytest.mark.django_db
def test_health_matches_the_contract(redis_up, contract):
    contract(APIClient().get("/api/v1/health/"), "/health/")


@pytest.mark.django_db
def test_reminders_piling_up_unsent_is_an_incident(redis_up, alex):
    from datetime import timedelta

    from django.utils import timezone

    from notifications.models import Reminder

    Reminder.objects.all().update(
        state=Reminder.State.PENDING, due_at=timezone.now() - timedelta(minutes=45)
    )

    body = APIClient().get("/api/v1/health/").json()

    # Section 12: past 30 minutes the dispatcher is not running, which is
    # worth seeing even while everything else answers.
    assert body["oldest_overdue_reminder_minutes"] == 45
    assert body["status"] == "degraded"


@pytest.mark.django_db
def test_a_reminder_only_just_due_is_not_an_incident(redis_up, alex):
    from datetime import timedelta

    from django.utils import timezone

    from notifications.models import Reminder

    Reminder.objects.all().update(
        state=Reminder.State.PENDING, due_at=timezone.now() - timedelta(minutes=2)
    )

    body = APIClient().get("/api/v1/health/").json()

    assert body["oldest_overdue_reminder_minutes"] == 2
    assert body["status"] == "ok"
