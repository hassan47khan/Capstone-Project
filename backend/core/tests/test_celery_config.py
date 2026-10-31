"""How Celery and the shared cache are configured (spec section 8).

Configuration, not behaviour, but each of these is a decision that would be
expensive to discover was wrong in production: a pickle serializer, a task
with no time limit, a schedule naming a task that does not exist, or a
`.delay()` that blocks a registration request while the broker is away.
"""

import pytest
from django.conf import settings

from config.celery import app
from core.tests.test_settings import read_setting


def test_the_app_is_wired_up_for_celery_a_config():
    # `celery -A config worker -B` finds the app through config/__init__.py.
    from config import celery_app

    assert celery_app is app


def test_only_json_crosses_the_wire():
    # Pickle would make the broker a remote-code-execution surface.
    assert settings.CELERY_TASK_SERIALIZER == "json"
    assert settings.CELERY_ACCEPT_CONTENT == ["json"]


def test_no_task_may_run_forever():
    assert settings.CELERY_TASK_SOFT_TIME_LIMIT < settings.CELERY_TASK_TIME_LIMIT
    assert settings.CELERY_TASK_TIME_LIMIT <= 300


def test_beat_schedules_in_utc():
    # Each task converts to the user's zone itself; a beat in local time
    # would move every schedule twice a year.
    assert settings.CELERY_TIMEZONE == "UTC"
    assert settings.CELERY_ENABLE_UTC is True


def test_publishing_fails_fast_so_a_dead_broker_cannot_hold_a_request():
    assert settings.CELERY_TASK_PUBLISH_RETRY is False
    assert settings.CELERY_BROKER_TRANSPORT_OPTIONS["socket_connect_timeout"] <= 5


@pytest.mark.parametrize("name", list(settings.CELERY_BEAT_SCHEDULE))
def test_every_scheduled_task_exists(name):
    # Discovery is lazy until a worker boots, so do here what it does there.
    app.loader.import_default_modules()
    scheduled = settings.CELERY_BEAT_SCHEDULE[name]["task"]

    # A schedule naming a task nobody registered fails silently in beat: the
    # entry fires, cannot be routed, and the job simply never runs.
    assert scheduled in app.tasks, f"{scheduled} is scheduled but not registered"


def test_trials_are_converted_hourly():
    schedule = settings.CELERY_BEAT_SCHEDULE["convert-expired-trials"]["schedule"]

    assert schedule.minute == {0}
    assert len(schedule.hour) == 24


def test_tasks_run_inline_in_the_suite():
    # Otherwise every test that triggers a task would need a live worker.
    assert settings.CELERY_TASK_ALWAYS_EAGER is True


# The shared cache ---------------------------------------------------------------


def test_the_cache_moves_to_redis_once_one_is_configured():
    # Shared, so a rate limit counts across the web process and the worker.
    assert (
        read_setting("CACHES['default']['BACKEND']", REDIS_URL="redis://localhost:6379/0")
        == "'core.cache.FailOpenRedisCache'"
    )
    assert (
        read_setting("CACHES['default']['LOCATION']", REDIS_URL="redis://localhost:6379/1")
        == "'redis://localhost:6379/1'"
    )


def test_the_cache_stays_in_process_without_redis():
    assert (
        read_setting("CACHES['default']['BACKEND']", REDIS_URL="")
        == "'django.core.cache.backends.locmem.LocMemCache'"
    )


def test_the_broker_falls_back_to_compose_when_redis_url_is_unset():
    # Unlike the cache: a worker is only ever started deliberately, so a
    # default there is a convenience rather than a wrong guess.
    assert read_setting("CELERY_BROKER_URL", REDIS_URL="") == "'redis://localhost:6379/0'"


def test_tasks_run_inline_when_no_redis_is_configured():
    # Nobody runs a worker without REDIS_URL, so a task queued on compose's
    # Redis would never run: the verify link would simply never arrive.
    assert read_setting("CELERY_TASK_ALWAYS_EAGER", REDIS_URL="") == "True"


def test_tasks_go_to_the_worker_once_redis_is_configured():
    assert read_setting("CELERY_TASK_ALWAYS_EAGER", REDIS_URL="redis://localhost:6379/0") == "False"


def test_the_suite_never_uses_a_developers_redis():
    assert settings.CACHES["default"]["BACKEND"] == (
        "django.core.cache.backends.locmem.LocMemCache"
    )
