"""Reminders, the in-app inbox and device tokens (spec sections 4 and 8).

The shape of this follows one rule from section 8: **MongoDB is the source of
truth and Celery only delivers.** Reminder rows are written by the API when a
subscription changes, never by a task, so a broker outage delays alerts and
cannot lose them, and `GET /notifications` can materialise anything already
due when the app next opens.
"""

from django.conf import settings
from django.db import models

from subscriptions.models import Subscription


class Reminder(models.Model):
    """One alert SubTrak intends to send, and how far it has got.

    `dedupe_key` is `subscription:kind:target_date`, and it is unique. That is
    what makes rescheduling an upsert: editing a subscription five times
    leaves one row per alert, not five.
    """

    class Kind(models.TextChoices):
        # Deliberately not the spec's fixed trial_3d / trial_1d. Handoff 09 §5
        # makes both the lead time and the on/off switch user settings, so the
        # kind says what the alert is about and NotificationRule says when.
        TRIAL_ENDING = "trial_ending"
        RENEWAL = "renewal"
        # Event-driven: raised when a higher charge is recorded, not scheduled.
        PRICE_INCREASE = "price_increase"

    class State(models.TextChoices):
        PENDING = "pending"
        SENDING = "sending"
        SENT = "sent"
        RETRYING = "retrying"
        FAILED = "failed"
        # The subscription changed and this alert is no longer wanted.
        CANCELLED = "cancelled"
        # Too late to matter: sending it now would be a stale warning.
        EXPIRED = "expired"
        # Both channels off, so there was nothing to send.
        SKIPPED = "skipped"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="reminders"
    )
    subscription = models.ForeignKey(
        Subscription, on_delete=models.CASCADE, related_name="reminders"
    )
    kind = models.CharField(max_length=20, choices=Kind.choices)
    # UTC, built from the user's local date and reminder_time through
    # zoneinfo, so the wall-clock hour survives a DST change (US-5).
    due_at = models.DateTimeField()
    state = models.CharField(max_length=10, choices=State.choices, default=State.PENDING)
    attempts = models.PositiveSmallIntegerField(default=0)
    dedupe_key = models.CharField(max_length=120, unique=True)
    # The user had no time zone, so this was scheduled as UTC and the body
    # says so (spec section 8).
    timezone_flagged = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "reminders"
        indexes = [
            # The dispatcher's only query: everything pending and due.
            models.Index(fields=["state", "due_at"], name="reminder_state_due"),
            models.Index(fields=["user", "state", "due_at"], name="reminder_user_state_due"),
        ]

    def __str__(self):
        return f"{self.kind} for {self.subscription_id} at {self.due_at:%Y-%m-%d %H:%M}Z"


class Notification(models.Model):
    """A row in the in-app inbox.

    Created before any push is attempted, so the alert exists even when the
    push fails or the user never granted permission. That is what makes the
    in-app inbox the fallback rather than a nice-to-have (section 8).
    """

    class PushStatus(models.TextChoices):
        NOT_SENT = "not_sent"
        SENT = "sent"
        FAILED = "failed"
        # Nothing to push to, which is not a failure.
        NO_DEVICE = "no_device"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notifications"
    )
    # One notification per reminder, enforced by the database, so a dispatcher
    # that runs twice cannot put the same alert in the inbox twice.
    reminder = models.OneToOneField(
        Reminder, on_delete=models.CASCADE, related_name="notification", null=True, blank=True
    )
    subscription = models.ForeignKey(
        Subscription, on_delete=models.CASCADE, related_name="notifications", null=True, blank=True
    )
    kind = models.CharField(max_length=20, choices=Reminder.Kind.choices)
    title = models.CharField(max_length=120)
    body = models.TextField()
    push_status = models.CharField(
        max_length=10, choices=PushStatus.choices, default=PushStatus.NOT_SENT
    )
    # Every push attempt failed, so the app shows this as a missed alert
    # banner on next open (US-13).
    missed = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "notifications"
        indexes = [models.Index(fields=["user", "-created_at"], name="notification_user_created")]

    def __str__(self):
        return f"{self.kind} for {self.user_id}"


class DeviceToken(models.Model):
    """An Expo push token for one of a user's devices.

    Unique on the token rather than on (user, token): a handset handed to
    somebody else keeps its token, and the row must follow whoever registered
    it last instead of delivering to the wrong account.
    """

    class Platform(models.TextChoices):
        ANDROID = "android"
        IOS = "ios"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="device_tokens"
    )
    token = models.CharField(max_length=255, unique=True)
    platform = models.CharField(max_length=10, choices=Platform.choices)
    # Turned off when Expo reports the token as DeviceNotRegistered, so a
    # dead handset stops costing a request on every send.
    active = models.BooleanField(default=True)
    last_seen_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "device_tokens"
        indexes = [models.Index(fields=["user", "active"], name="device_user_active")]

    def __str__(self):
        return f"{self.platform} device for {self.user_id}"
