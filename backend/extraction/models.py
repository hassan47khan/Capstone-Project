"""Gmail access and what the scan found (spec section 7, handoff 11 §2).

Retention is the design constraint here (11 §2.9). An email body never lands
in this database: a pending extraction holds at most the 300-character
snippet the review screen quotes, a TTL index deletes it after a day, and
confirm or discard deletes it sooner. What outlives the review is a SHA-256
of the message id, so a rescan can tell it has already seen that email.
"""

from django.conf import settings
from django.db import models

# 11 §2.9: "Store the snippet shown on screen (<= 300 characters)".
SNIPPET_MAX = 300


class GmailConnection(models.Model):
    """One user's read-only Gmail grant.

    Only the refresh token is kept, Fernet-encrypted (`extraction/crypto.py`).
    Access tokens last an hour and are fetched when a scan needs one, so a
    database dump never holds a credential that works on its own.
    """

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="gmail"
    )
    email = models.EmailField()
    refresh_token_encrypted = models.TextField()
    scopes = models.CharField(max_length=500)
    connected_at = models.DateTimeField()
    # Set when Google refuses the refresh token (revoked from the Google
    # account side, or expired). Settings then shows "Reconnect" (11 §2.8).
    revoked_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "gmail_connections"

    def __str__(self):
        return f"gmail for {self.user_id}"


class PendingExtraction(models.Model):
    """One email's extracted fields, waiting for the user to review them.

    Nothing here is a subscription until "Confirm and track" (11 §2.4.6).
    """

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="pending_extractions"
    )
    sender = models.CharField(max_length=320)
    subject = models.CharField(max_length=500)
    snippet = models.CharField(max_length=SNIPPET_MAX)
    # The contract's ExtractedFields and ExtractionConfidence, as stored.
    # Prices are decimal strings, never floats.
    fields = models.JSONField()
    confidence = models.JSONField()
    flagged = models.JSONField(default=list)
    duplicate_of = models.CharField(max_length=24, null=True, blank=True)  # noqa: DJ001
    message_hash = models.CharField(max_length=64)
    created_at = models.DateTimeField(auto_now_add=True)
    # A TTL index (migration 0002) deletes the row, snippet and all, at this time.
    expires_at = models.DateTimeField()

    class Meta:
        db_table = "pending_extractions"
        constraints = [
            models.UniqueConstraint(
                fields=["owner", "message_hash"], name="pending_extraction_per_message"
            )
        ]
        indexes = [models.Index(fields=["owner", "created_at"], name="pending_owner_created")]

    def __str__(self):
        return f"pending {self.pk} for {self.owner_id}"


class ExtractionAttempt(models.Model):
    """One email the scan looked at, and what became of it. No content.

    Two jobs. The unique (owner, message_hash) pair stops a rescan offering
    an email the user already confirmed or discarded. And the rows that
    reached the model, counted per day, are the per-user cap
    (`EXTRACTION_DAILY_CAP`) that bounds what one bad day can cost.
    """

    class Outcome(models.TextChoices):
        PENDING = "pending"
        CONFIRMED = "confirmed"
        DISCARDED = "discarded"
        # Rejected before extraction: not a subscription email, not English.
        SKIPPED = "skipped"
        # The model was unreachable or its output unusable.
        FAILED = "failed"

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="extraction_attempts"
    )
    message_hash = models.CharField(max_length=64)
    outcome = models.CharField(max_length=10, choices=Outcome.choices)
    called_model = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "extraction_attempts"
        constraints = [
            models.UniqueConstraint(
                fields=["owner", "message_hash"], name="extraction_attempt_per_message"
            )
        ]
        indexes = [models.Index(fields=["owner", "created_at"], name="attempt_owner_created")]

    def __str__(self):
        return f"{self.outcome} for {self.owner_id}"
