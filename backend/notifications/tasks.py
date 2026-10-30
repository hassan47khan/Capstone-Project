"""Delivering reminders (spec section 8).

The dispatcher claims, a per-reminder task delivers. That split is what lets
the retry policy be Celery's — 3 attempts at roughly 1, 2 and 4 minutes with
jitter (section 12) — instead of a worker sitting in a sleep loop holding a
slot for seven minutes.

Delivery order is section 8's, and the order is the point: the in-app row is
written **before** any push is attempted, so the alert exists even when the
push fails or the user never granted permission. That is what makes the
inbox the fallback rather than a nice-to-have.
"""

import logging
from datetime import timedelta

import httpx
from celery import shared_task
from django.utils import timezone

from accounts.models import rules_for
from core.tasks import queue_email

from . import push
from .models import DeviceToken, Notification, PushReceipt, Reminder

logger = logging.getLogger(__name__)

State = Reminder.State
Kind = Reminder.Kind

# Anything due longer ago than this is a stale warning, not an alert: a
# renewal notice three days after the charge helps nobody (section 8).
DISPATCH_WINDOW = timedelta(hours=48)

# Section 12: 3 retries, exponential with jitter, roughly 1, 2, 4 minutes.
MAX_PUSH_RETRIES = 3
RETRY_BACKOFF_SECONDS = 60

# Expo drops receipts after 24 hours, so an id it never answers must not be
# asked about forever.
RECEIPT_TTL = timedelta(hours=24)

# Past this, an undelivered reminder is an incident worth seeing on /health/.
OVERDUE_INCIDENT_MINUTES = 30

_COPY = {
    Kind.TRIAL_ENDING: ("Trial ending soon", "Your {name} free trial ends on {date}."),
    Kind.RENEWAL: ("Renewal coming up", "{name} renews on {date}."),
    Kind.PRICE_INCREASE: ("Price went up", "The price of {name} has gone up."),
}

# Spec section 8: a user with no time zone is treated as UTC and told so.
NO_TIMEZONE_NOTE = " Times are UTC because you have not set a time zone."


def claim(reminder_id) -> bool:
    """Move one reminder from pending to sending, atomically.

    A conditional update, so when two dispatchers overlap exactly one of
    them gets the row and the other sends nothing (section 12's "atomic
    state changes").
    """
    return bool(
        Reminder.objects.filter(pk=reminder_id, state=State.PENDING).update(
            state=State.SENDING, updated_at=timezone.now()
        )
    )


def _target_date(reminder: Reminder):
    sub = reminder.subscription
    if reminder.kind == Kind.TRIAL_ENDING:
        return sub.trial_ends_on
    return sub.next_bill_date


def copy_for(reminder: Reminder) -> tuple[str, str]:
    """The title and body for one reminder."""
    title, template = _COPY[reminder.kind]
    date = _target_date(reminder)
    body = template.format(name=reminder.subscription.name, date=date.isoformat() if date else "")
    if reminder.timezone_flagged:
        body += NO_TIMEZONE_NOTE
    return title, body


def ensure_notification(reminder: Reminder) -> Notification:
    """The inbox row for this reminder, created once.

    One per reminder is a database constraint, so a dispatcher that runs
    twice cannot put the same alert in the inbox twice.
    """
    title, body = copy_for(reminder)
    notification, _ = Notification.objects.get_or_create(
        reminder=reminder,
        defaults={
            "user": reminder.user,
            "subscription": reminder.subscription,
            "kind": reminder.kind,
            "title": title,
            "body": body,
        },
    )
    return notification


@shared_task(name="notifications.tasks.dispatch_due_reminders")
def dispatch_due_reminders() -> dict:
    """Claim everything due and hand each one to a delivery task."""
    now = timezone.now()

    # Expire first, so a backlog from an outage does not get sent as a
    # burst of stale warnings when the workers come back.
    expired = Reminder.objects.filter(state=State.PENDING, due_at__lt=now - DISPATCH_WINDOW).update(
        state=State.EXPIRED
    )

    due = Reminder.objects.filter(
        state=State.PENDING, due_at__lte=now, due_at__gte=now - DISPATCH_WINDOW
    ).values_list("pk", flat=True)

    claimed = 0
    for reminder_id in list(due):
        if claim(reminder_id):
            deliver_reminder.delay(str(reminder_id))
            claimed += 1
    return {"claimed": claimed, "expired": expired}


@shared_task(bind=True, name="notifications.tasks.deliver_reminder", max_retries=MAX_PUSH_RETRIES)
def deliver_reminder(self, reminder_id: str) -> str:
    """Deliver one claimed reminder, in section 8's order."""
    reminder = Reminder.objects.filter(pk=reminder_id).first()
    if reminder is None:
        return "gone"

    rules = rules_for(reminder.user)
    if not rules.send_push and not rules.send_email:
        # Nothing to send through, so this is not a failure.
        Reminder.objects.filter(pk=reminder.pk).update(state=State.SKIPPED)
        return State.SKIPPED

    # The inbox row first, always, before anything can go wrong.
    notification = ensure_notification(reminder)

    if rules.send_push and _push(self, reminder, notification) == GAVE_UP:
        # Already marked failed, and the alert flagged missed. Carrying on
        # to mark it sent would say the opposite.
        return State.FAILED

    if rules.send_email:
        queue_email(notification.title, notification.body, [reminder.user.email])

    Reminder.objects.filter(pk=reminder.pk).update(state=State.SENT)
    return State.SENT


# What a push attempt came to. "No device" is a success: the in-app row is
# the delivery (section 8), and retrying would never help.
PUSHED = "pushed"
NO_DEVICE = "no_device"
GAVE_UP = "gave_up"


def _push(task, reminder: Reminder, notification: Notification) -> str:
    """Push to the user's devices and say how it went."""
    tokens = list(
        DeviceToken.objects.filter(user=reminder.user, active=True).values_list("token", flat=True)
    )
    if not tokens:
        # No device or no permission: the in-app row *is* the delivery, and
        # the task succeeds (section 8). Retrying would never help.
        Notification.objects.filter(pk=notification.pk).update(
            push_status=Notification.PushStatus.NO_DEVICE
        )
        return NO_DEVICE

    messages = [
        push.message_for(
            token,
            title=notification.title,
            body=notification.body,
            data={"subscription_id": str(reminder.subscription_id), "kind": reminder.kind},
        )
        for token in tokens
    ]
    try:
        tickets = push.send(messages)
    except (httpx.HTTPError, OSError) as error:
        return _retry_or_fail(task, reminder, notification, error)

    devices = {d.token: d for d in DeviceToken.objects.filter(token__in=tokens)}
    expires_at = timezone.now() + RECEIPT_TTL
    for ticket in tickets:
        if ticket.token_is_dead:
            DeviceToken.objects.filter(token=ticket.token).update(active=False)
        elif ticket.accepted and ticket.receipt_id:
            PushReceipt.objects.update_or_create(
                receipt_id=ticket.receipt_id,
                defaults={
                    "device_token": devices[ticket.token],
                    "notification": notification,
                    "expires_at": expires_at,
                },
            )

    if not any(ticket.accepted for ticket in tickets):
        return _retry_or_fail(task, reminder, notification, RuntimeError("every token rejected"))

    Notification.objects.filter(pk=notification.pk).update(push_status=Notification.PushStatus.SENT)
    return PUSHED


def _retry_or_fail(task, reminder: Reminder, notification: Notification, error) -> str:
    """Back off and try again, or give up and flag the alert as missed."""
    attempts = reminder.attempts + 1
    Reminder.objects.filter(pk=reminder.pk).update(attempts=attempts, state=State.RETRYING)

    if attempts <= MAX_PUSH_RETRIES:
        # 60, 120, 240 seconds. task.retry always raises: Retry for the
        # worker to catch, or the original exception when tasks run eagerly.
        countdown = RETRY_BACKOFF_SECONDS * 2 ** (attempts - 1)
        logger.warning("Push failed for reminder %s, retrying in %ss.", reminder.pk, countdown)
        raise task.retry(countdown=countdown, exc=error)

    logger.warning("Push gave up for reminder %s after %s attempts.", reminder.pk, attempts)
    Reminder.objects.filter(pk=reminder.pk).update(state=State.FAILED)
    # The app shows this as a missed-alert banner on next open (US-13).
    Notification.objects.filter(pk=notification.pk).update(
        push_status=Notification.PushStatus.FAILED, missed=True
    )
    return GAVE_UP


@shared_task(name="notifications.tasks.check_push_receipts")
def check_push_receipts() -> int:
    """Deactivate tokens Expo reports as gone.

    Expo accepting a message is not delivery; only the receipt says that,
    and it takes a few minutes to appear, which is why this runs on its own
    schedule rather than inline after a send.
    """
    waiting = {r.receipt_id: r for r in PushReceipt.objects.all()[: push.MAX_RECEIPT_IDS]}
    if not waiting:
        return 0

    answered = push.receipts(list(waiting))
    deactivated = 0
    for receipt_id, receipt in answered.items():
        row = waiting.get(receipt_id)
        if row is None:
            continue
        if receipt.error == push.DEVICE_NOT_REGISTERED:
            deactivated += DeviceToken.objects.filter(pk=row.device_token_id).update(active=False)
    # Answered ids are done with; the rest are asked about again next run.
    PushReceipt.objects.filter(receipt_id__in=list(answered)).delete()
    return deactivated


def oldest_overdue_minutes(now=None) -> int | None:
    """Age of the oldest due-but-unsent reminder, for `GET /health/`.

    Section 12 treats more than 30 minutes as an incident: it means the
    dispatcher is not running, so alerts are piling up unseen.
    """
    now = now or timezone.now()
    oldest = (
        Reminder.objects.filter(state__in=[State.PENDING, State.SENDING], due_at__lte=now)
        .order_by("due_at")
        .values_list("due_at", flat=True)
        .first()
    )
    return None if oldest is None else int((now - oldest).total_seconds() // 60)
