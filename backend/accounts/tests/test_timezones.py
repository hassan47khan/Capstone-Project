from datetime import date, datetime
from zoneinfo import ZoneInfo

import pytest

from accounts.services.timezones import is_valid_timezone, local_to_utc

NY = ZoneInfo("America/New_York")


def test_us5_delivery_uses_local_time_not_server_utc():
    utc, flagged = local_to_utc(date(2026, 10, 10), "America/New_York")
    assert utc == datetime(2026, 10, 10, 13, 0, tzinfo=ZoneInfo("UTC"))  # EDT is UTC-4
    assert flagged is False


@pytest.mark.parametrize(
    "day, expected_utc_hour",
    [
        (date(2026, 10, 31), 13),  # before DST ends: EDT, UTC-4
        (date(2026, 11, 2), 14),  # after DST ends: EST, UTC-5
        (date(2027, 3, 13), 14),  # before DST starts: EST
        (date(2027, 3, 15), 13),  # after DST starts: EDT
    ],
)
def test_us5_dst_keeps_local_wall_clock_at_9am(day, expected_utc_hour):
    utc, _ = local_to_utc(day, "America/New_York")
    assert utc.hour == expected_utc_hour
    assert utc.astimezone(NY).hour == 9


@pytest.mark.parametrize("tz_name", [None, "", "Mars/Olympus"])
def test_us5_unset_or_invalid_defaults_to_utc_and_is_flagged(tz_name):
    utc, flagged = local_to_utc(date(2026, 10, 10), tz_name)
    assert utc == datetime(2026, 10, 10, 9, 0, tzinfo=ZoneInfo("UTC"))
    assert flagged is True


def test_valid_and_invalid_zone_names():
    assert is_valid_timezone("Europe/London")
    assert not is_valid_timezone("Europe/Nowhere")
    assert not is_valid_timezone("")
    assert not is_valid_timezone(None)
