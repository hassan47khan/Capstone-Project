from datetime import UTC, date, datetime

import pytest

from accounts.models import User, settings_for
from core import clock


@pytest.fixture
def user(db):
    return User.objects.create_user(email="clock@example.com", password="x")


def test_today_is_pinned_when_subtrak_today_is_set(user, settings):
    settings.SUBTRAK_TODAY = date(2026, 10, 1)
    assert clock.today_for(user) == date(2026, 10, 1)


def test_today_is_the_users_local_date(user, settings, monkeypatch):
    settings.SUBTRAK_TODAY = None
    # 02:00 UTC on Oct 2 is still Oct 1 in New York.
    monkeypatch.setattr(clock.timezone, "now", lambda: datetime(2026, 10, 2, 2, tzinfo=UTC))
    assert clock.today_for(user) == date(2026, 10, 2)  # no zone set: UTC

    prefs = settings_for(user)
    prefs.timezone = "America/New_York"
    prefs.save()
    assert clock.today_for(user) == date(2026, 10, 1)
