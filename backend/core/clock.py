"""What "today" means for a user: their local calendar date (US-5).

Every figure that depends on the date (next bills, trials, total spent, the
analytics windows) asks this module, so a whole request agrees on one day.
SUBTRAK_TODAY pins it for tests and demos, which run at SEED_TODAY (04 §4.1).
"""

from datetime import date

from django.conf import settings
from django.utils import timezone

from accounts.models import settings_for
from accounts.services.timezones import resolve_timezone


def today_for(user) -> date:
    pinned = getattr(settings, "SUBTRAK_TODAY", None)
    if pinned is not None:
        return pinned
    zone = resolve_timezone(settings_for(user).timezone).zone
    return timezone.now().astimezone(zone).date()
