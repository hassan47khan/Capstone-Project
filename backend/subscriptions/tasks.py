"""Scheduled subscription work (spec section 8).

Each task is a thin wrapper over the operation it runs, so the hourly job
and the management command cannot drift apart: the command calls the same
function this task does.
"""

from datetime import date

from celery import shared_task
from django.utils import timezone

from .operations import convert_due_trials


@shared_task(name="subscriptions.tasks.convert_expired_trials")
def convert_expired_trials(today: str | None = None) -> int:
    """Turn trials that ended on or before today into paying subscriptions.

    `today` is an ISO date string rather than a date, because the only
    serializer is JSON. Unset, it is the server's current date, which is
    what `manage.py convert_trials` has always used.
    """
    day = date.fromisoformat(today) if today else timezone.localdate()
    return convert_due_trials(today=day)
