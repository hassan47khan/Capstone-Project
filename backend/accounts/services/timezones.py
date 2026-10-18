"""Time zone rules for US-5. Pure Python: no Django, database, or network."""

from dataclasses import dataclass
from datetime import date, datetime, time
from functools import lru_cache
from zoneinfo import ZoneInfo, available_timezones

UTC = ZoneInfo("UTC")
DEFAULT_SEND_TIME = time(9, 0)  # spec section 8: reminders go out at 09:00 local


@lru_cache(maxsize=1)
def _valid_names() -> frozenset[str]:
    return frozenset(available_timezones())


def is_valid_timezone(name: str | None) -> bool:
    """True only for real IANA names such as "America/New_York"."""
    return bool(name) and name in _valid_names()


@dataclass(frozen=True)
class ResolvedZone:
    zone: ZoneInfo
    label: str
    flagged: bool  # True means "time zone not set"


def resolve_timezone(name: str | None) -> ResolvedZone:
    """Use the user's zone, or fall back to UTC and flag it."""
    if is_valid_timezone(name):
        return ResolvedZone(ZoneInfo(name), name, False)
    return ResolvedZone(UTC, "UTC", True)


def local_to_utc(
    local_date: date, tz_name: str | None, send_time: time = DEFAULT_SEND_TIME
) -> tuple[datetime, bool]:
    """Turn a local calendar date plus send time into a UTC instant.

    Returns (utc_datetime, flagged). Building from local wall-clock time is
    what keeps reminders at the right local hour across DST changes.
    """
    resolved = resolve_timezone(tz_name)
    local_dt = datetime.combine(local_date, send_time, tzinfo=resolved.zone)
    return local_dt.astimezone(UTC), resolved.flagged
