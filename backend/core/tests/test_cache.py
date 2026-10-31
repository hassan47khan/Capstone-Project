"""Redis down reads as an empty cache, never a 500 (spec sections 6 and 12)."""

from unittest import mock

import pytest
from django.core.cache import caches
from rest_framework.test import APIClient

from accounts.tests.test_auth_api import ALEX, post
from subscriptions.seed import DEMO_PASSWORD

# Port 1 refuses at once, so the suite does not wait out a timeout.
UNREACHABLE = "redis://127.0.0.1:1/0"


@pytest.fixture
def redis_down(settings):
    settings.CACHES = {
        "default": {
            "BACKEND": "core.cache.FailOpenRedisCache",
            "LOCATION": UNREACHABLE,
            "OPTIONS": {"socket_connect_timeout": 1, "socket_timeout": 1},
        }
    }
    return caches["default"]


def test_reads_miss_and_writes_are_dropped(redis_down):
    assert redis_down.get("k") is None
    assert redis_down.get("k", "fallback") == "fallback"
    assert redis_down.get_many(["a", "b"]) == {}
    assert redis_down.has_key("k") is False
    assert redis_down.set("k", 1) is None
    assert redis_down.set_many({"a": 1}) == []
    assert redis_down.add("k", 1) is True
    assert redis_down.incr("k", 3) == 3
    assert redis_down.touch("k") is False
    assert redis_down.delete("k") is False
    assert redis_down.delete_many(["a", "b"]) is None
    assert redis_down.clear() is False


def test_a_reachable_redis_is_used_as_is(redis_down):
    # Only an unreachable Redis is swallowed; anything that worked is unchanged.
    with mock.patch.object(redis_down, "_cache") as client:
        client.get.return_value = "cached"
        assert redis_down.get("k") == "cached"


def test_other_redis_errors_are_not_swallowed(redis_down):
    # A bug, not an outage, should still be loud.
    with mock.patch.object(redis_down, "_cache") as client:
        client.get.side_effect = ValueError("bug")
        with pytest.raises(ValueError):
            redis_down.get("k")


@pytest.mark.usefixtures("alex", "redis_down")
@pytest.mark.parametrize(
    ("path", "data", "status"),
    [
        ("/auth/login", {"email": ALEX, "password": DEMO_PASSWORD}, 200),
        ("/auth/register", {"email": "new@example.com", "password": "a-long-passphrase"}, 201),
        ("/auth/resend-verification", {"email": ALEX}, 200),
        ("/auth/password-reset/request", {"email": ALEX}, 200),
    ],
)
def test_signing_in_and_up_survive_redis_being_down(path, data, status):
    # The throttles and the resend cooldown both read the cache first.
    assert post(APIClient(), path, data).status_code == status
