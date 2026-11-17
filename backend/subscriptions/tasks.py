"""Scheduled subscription work (spec section 8).

Each task is a thin wrapper over the operation it runs, so the hourly job
and the management command cannot drift apart: the command calls the same
function this task does.
"""

from datetime import date

from celery import shared_task
from django.utils import timezone

from . import fx
from .operations import convert_due_trials, roll_forward_bills


@shared_task(name="subscriptions.tasks.convert_expired_trials")
def convert_expired_trials(today: str | None = None) -> int:
    """Turn trials that ended on or before today into paying subscriptions.

    `today` is an ISO date string rather than a date, because the only
    serializer is JSON. Unset, it is the server's current date, which is
    what `manage.py convert_trials` has always used.
    """
    day = date.fromisoformat(today) if today else timezone.localdate()
    return convert_due_trials(today=day)


@shared_task(name="subscriptions.tasks.roll_forward_renewals")
def roll_forward_renewals(today: str | None = None) -> int:
    """Move next_bill_date past bills that have gone by, and reschedule their
    reminders. Without this each subscription gets only one renewal alert.

    `today` is an ISO date string, because the only serializer is JSON. Unset,
    each subscription uses its owner's local date.
    """
    return roll_forward_bills(today=date.fromisoformat(today) if today else None)


@shared_task(
    name="subscriptions.tasks.refresh_exchange_rates",
    # Spec section 12: 3 retries "across the day". A rate source that is
    # down now is usually down for a while, and yesterday's rates stay
    # perfectly usable, so the backoff is hours rather than seconds.
    autoretry_for=(Exception,),
    max_retries=3,
    retry_backoff=3600,
    retry_backoff_max=14400,
    # No jitter: one worker makes this call, so there is nothing to spread out,
    # and full jitter could spend all three retries inside the same outage.
    retry_jitter=False,
)
def refresh_exchange_rates() -> int:
    """Store today's rates. Never called by the suite or by `seed_demo`.

    Both depend on the fixed EUR 0.9177 the canonical figures are built on
    (04 §4), so a live refresh in either would quietly change every demo
    number. `fx.fetch_rates` refuses to make a real call under pytest, and
    `seed_demo` writes the fixed rate itself.

    On failure the exception reaches Celery, which retries; the rates
    already stored stay exactly as they are, and analytics keeps reporting
    their older `rates_as_of` (section 12's named fallback).
    """
    return fx.refresh()
