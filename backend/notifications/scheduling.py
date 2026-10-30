"""Deciding which reminders a user should have, and keeping them in step.

Spec section 8: `reschedule_for_subscription()` recomputes the whole desired
set for one subscription whenever anything that feeds it changes, upserts by
`dedupe_key` and cancels pending rows that are no longer wanted. Editing a
subscription five times therefore leaves one row per alert, not five, and
never an orphan pointing at a date that moved.

Timing comes from `NotificationRule` (handoff 09 §5), not from the spec's
fixed `trial_3d` / `trial_1d`: 09 makes both the lead time and the on/off
switch user settings, so the reminder *kind* says what the alert is about
and the rule says when.

Every `due_at` is built from the user's local date and `reminder_time`
through `zoneinfo` and then converted to UTC, so the wall-clock hour survives
a DST change (US-5).
"""

from dataclasses import dataclass
from datetime import date, datetime, timedelta

from django.utils import timezone
from django_mongodb_backend import transaction

from accounts.models import rules_for, settings_for
from accounts.services.timezones import local_to_utc
from subscriptions.models import Subscription

from .models import Reminder

Kind = Reminder.Kind
State = Reminder.State

# A reminder whose moment has already gone is due now rather than skipped:
# a trial ending in 2 days with a 3-day lead still has to be told about
# ("Reminder due now", handoff 11 §2.4).
DUE_NOW = "due now"


@dataclass(frozen=True)
class Wanted:
    """One reminder the rules say should exist."""

    kind: str
    target_date: date
    due_at: datetime
    timezone_flagged: bool


def dedupe_key(subscription_id, kind: str, target_date: date) -> str:
    """`subscription:kind:target_date` (spec section 8)."""
    return f"{subscription_id}:{kind}:{target_date.isoformat()}"


def _due_at(target_date: date, tz_name: str, send_time, *, now: datetime) -> tuple[datetime, bool]:
    """When to send, in UTC, never earlier than now.

    Clamping to `now` is the "Reminder due now" rule: a lead time longer than
    the time remaining would otherwise put `due_at` in the past, where the
    dispatcher's 48-hour window might never pick it up at all.
    """
    due_at, flagged = local_to_utc(target_date, tz_name, send_time)
    return max(due_at, now), flagged


def wanted_for(sub: Subscription, *, today: date, now: datetime | None = None) -> list[Wanted]:
    """Every reminder this subscription should currently have.

    Pure apart from reading the owner's settings: it decides, and
    `reschedule_for_subscription` writes.
    """
    now = now or timezone.now()
    rules = rules_for(sub.owner)
    tz_name = settings_for(sub.owner).timezone

    # A subscription that is cancelled, deleted or has no future to warn
    # about wants nothing at all; the caller cancels whatever it had.
    if sub.status != Subscription.Status.ACTIVE:
        return []

    wanted: list[Wanted] = []

    if sub.is_trial and sub.trial_ends_on and sub.trial_reminder_enabled:
        target = sub.trial_ends_on - timedelta(days=rules.trial_alert_days_before)
        if sub.trial_ends_on >= today:
            due_at, flagged = _due_at(target, tz_name, rules.reminder_time, now=now)
            wanted.append(Wanted(Kind.TRIAL_ENDING, target, due_at, flagged))

    # A trial is not a renewal: it has no bill until it converts (04 §6a).
    if not sub.is_trial and sub.next_bill_date:
        target = sub.next_bill_date - timedelta(days=rules.days_before_reminder)
        if sub.next_bill_date >= today:
            due_at, flagged = _due_at(target, tz_name, rules.reminder_time, now=now)
            wanted.append(Wanted(Kind.RENEWAL, target, due_at, flagged))

    return wanted


def reschedule_for_subscription(sub: Subscription, *, today: date, now: datetime | None = None):
    """Bring this subscription's reminders in line with the rules.

    Upserts what is wanted and cancels any pending row that is not. Only
    `pending` rows are cancelled: one already sent is history, and one being
    sent belongs to the dispatcher.
    """
    now = now or timezone.now()
    wanted = wanted_for(sub, today=today, now=now)
    keep = set()

    with transaction.atomic():
        for item in wanted:
            key = dedupe_key(sub.pk, item.kind, item.target_date)
            keep.add(key)
            Reminder.objects.update_or_create(
                dedupe_key=key,
                defaults={
                    "user": sub.owner,
                    "subscription": sub,
                    "kind": item.kind,
                    "due_at": item.due_at,
                    "timezone_flagged": item.timezone_flagged,
                },
            )
            # A row that had already failed or expired gets another go now
            # that the schedule moved; one already sent is left alone.
            Reminder.objects.filter(
                dedupe_key=key, state__in=[State.CANCELLED, State.EXPIRED, State.FAILED]
            ).update(state=State.PENDING, attempts=0)

        Reminder.objects.filter(subscription=sub, state=State.PENDING).exclude(
            dedupe_key__in=keep
        ).update(state=State.CANCELLED)

    return wanted


def reschedule_for_user(user, *, today: date, now: datetime | None = None) -> int:
    """Redo every subscription's reminders for one user.

    Needed when something user-wide moves: the time zone, the reminder time,
    the lead times or the channel toggles (handoff 09 §5). Returns how many
    subscriptions were visited.
    """
    subs = list(Subscription.objects.filter(owner=user))
    for sub in subs:
        reschedule_for_subscription(sub, today=today, now=now)
    return len(subs)
