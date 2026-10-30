"""The inbox scan and the review queue (handoff 04 §6a, 11 §2.4, §2.8, §2.9).

`POST /extractions/scan` checks what it can answer at once (connected? model
available? under the cap?) and hands the scan to a worker. The worker reads
the inbox, screens each email, asks the model about the rest, and writes one
`PendingExtraction` per subscription it finds. **Nothing becomes a
subscription here**: only `confirm`, the user's "Confirm and track", does.
"""

import hashlib
import logging
from datetime import timedelta

import httpx
from bson import ObjectId
from django.core.cache import cache
from django.utils import timezone
from django_mongodb_backend import transaction
from kombu.exceptions import OperationalError
from rest_framework import status

from accounts.models import settings_for
from core.clock import today_for
from core.contract import ApiError, not_found
from subscriptions import operations
from subscriptions.models import ServiceCatalogEntry, Subscription

from . import circuit, gmail, llm, pipeline, service
from .models import SNIPPET_MAX, ExtractionAttempt, GmailConnection, PendingExtraction

logger = logging.getLogger(__name__)

Outcome = ExtractionAttempt.Outcome

# 11 §2.9: "a pending extraction record with a TTL (suggest 24 hours)".
REVIEW_TTL = timedelta(hours=24)
# Longest a scan is reported as running; a worker that died stops counting then.
SCAN_SECONDS = 600

UNAVAILABLE = "Finding subscriptions in your email isn't available right now. Add one manually."


def _scanning_key(user) -> str:
    return f"extraction:scanning:{user.pk}"


def message_hash(user, message_id: str) -> str:
    """What outlives the review (11 §2.9). Salted with the user, so the same
    email in two inboxes gives two unrelated hashes."""
    return hashlib.sha256(f"{user.pk}:{message_id}".encode()).hexdigest()


def snippet(text: str) -> str:
    """The excerpt the review screen quotes: at most 300 characters (11 §2.9)."""
    if len(text) <= SNIPPET_MAX:
        return text
    cut = text[: SNIPPET_MAX - 1].rsplit(" ", 1)[0]
    return f"{cut}…"


# Starting a scan ------------------------------------------------------------------------


def start_scan(user) -> dict:
    """Answer at once, then scan in the background.

    409 `gmail_not_connected`; 503 `extraction_unavailable` (route to manual
    entry); 429 `throttled` once the user's daily cap is spent.
    """
    if not GmailConnection.objects.filter(user=user, revoked_at__isnull=True).exists():
        raise ApiError(status.HTTP_409_CONFLICT, "gmail_not_connected", "Connect Gmail first.")
    if not circuit.available():
        raise ApiError(status.HTTP_503_SERVICE_UNAVAILABLE, "extraction_unavailable", UNAVAILABLE)
    if not circuit.under_cap(user):
        raise ApiError(
            status.HTTP_429_TOO_MANY_REQUESTS,
            "throttled",
            "You've scanned a lot today. Try again tomorrow.",
            retry_after=_seconds_until_a_call_frees(user),
        )
    from .tasks import scan_inbox  # tasks imports this module

    cache.set(_scanning_key(user), True, SCAN_SECONDS)
    try:
        scan_inbox.delay(str(user.pk))
    except (OperationalError, OSError) as error:
        # A scan is too slow to run inside the request, so with no broker
        # the honest answer is "not now", not a request that times out.
        cache.delete(_scanning_key(user))
        raise ApiError(
            status.HTTP_503_SERVICE_UNAVAILABLE, "extraction_unavailable", UNAVAILABLE
        ) from error
    return {"status": "scanning"}


def _seconds_until_a_call_frees(user) -> int:
    oldest = (
        ExtractionAttempt.objects.filter(
            owner=user,
            called_model=True,
            created_at__gte=timezone.now() - timedelta(hours=24),
        )
        .order_by("created_at")
        .first()
    )
    if oldest is None:  # pragma: no cover - only reached when the cap is spent
        return 60
    remaining = oldest.created_at + timedelta(hours=24) - timezone.now()
    return max(1, int(remaining.total_seconds()) + 1)


# The scan itself, on a worker ------------------------------------------------------------


def _catalog() -> dict[str, str]:
    return {
        pipeline.service_key(entry.name): entry.category.slug
        for entry in ServiceCatalogEntry.objects.select_related("category")
    }


def run_scan(user, *, transport: httpx.BaseTransport | None = None) -> int:
    """Read the inbox and queue what it finds for review. Returns how many."""
    try:
        return _scan(user, transport=transport)
    finally:
        cache.delete(_scanning_key(user))


def _scan(user, *, transport) -> int:
    try:
        token = service.access_token_for(user, transport=transport)
        ids = gmail.search(token, transport=transport)
    except ApiError:
        return 0  # revoked: access_token_for has marked it for Reconnect
    except httpx.HTTPError as error:
        logger.warning("Gmail scan failed: %s", type(error).__name__)
        return 0
    existing = [(str(s.pk), s.name) for s in Subscription.objects.filter(owner=user)]
    catalog = _catalog()
    currency = settings_for(user).display_currency
    found = 0
    for message_id in ids:
        digest = message_hash(user, message_id)
        if ExtractionAttempt.objects.filter(owner=user, message_hash=digest).exists():
            continue  # seen before: confirmed, discarded, skipped or already waiting
        if not circuit.under_cap(user) or not circuit.available():
            break  # left unrecorded, so a later scan picks it up
        try:
            email = gmail.fetch(token, message_id, transport=transport)
        except httpx.HTTPError:
            continue
        source = pipeline.Source(
            sender=email.sender,
            subject=email.subject,
            text=email.text,
            received_on=email.received_on or today_for(user),
        )
        if pipeline.screen(source):
            _attempt(user, digest, Outcome.SKIPPED, called_model=False)
            continue
        try:
            reply = circuit.guarded(lambda s=source: llm.read_email(s, transport=transport))
        except llm.LLMUnavailable:
            break  # the circuit now knows; stop rather than fail 25 times
        except llm.LLMUnusable:
            # 11 §2.8: malformed twice -> a blank Add form the user can fill in.
            candidate = pipeline.blank(source)
        else:
            if not reply.data.get("is_subscription_email"):
                _attempt(user, digest, Outcome.SKIPPED, called_model=True)
                continue
            candidate = pipeline.extract(
                source,
                reply.data,
                default_currency=currency,
                catalog=catalog,
                existing=existing,
            )
        _queue(user, digest, email, candidate)
        found += 1
    return found


def _attempt(user, digest: str, outcome: str, *, called_model: bool) -> None:
    ExtractionAttempt.objects.create(
        owner=user, message_hash=digest, outcome=outcome, called_model=called_model
    )


def _queue(user, digest: str, email: gmail.Email, candidate: pipeline.Candidate) -> None:
    with transaction.atomic():
        _attempt(user, digest, Outcome.PENDING, called_model=True)
        PendingExtraction.objects.create(
            owner=user,
            sender=email.sender[:320],
            subject=email.subject[:500],
            snippet=snippet(email.text),
            fields=candidate.fields,
            confidence=candidate.confidence,
            flagged=candidate.flagged,
            duplicate_of=candidate.duplicate_of,
            message_hash=digest,
            expires_at=timezone.now() + REVIEW_TTL,
        )


# The review queue -------------------------------------------------------------------------


def _row(row: PendingExtraction) -> dict:
    return {
        "id": str(row.pk),
        "source": {"sender": row.sender, "subject": row.subject, "snippet": row.snippet},
        "fields": row.fields,
        "confidence": row.confidence,
        "flagged": row.flagged,
        "duplicate_of": row.duplicate_of,
        "created_at": row.created_at,
        "expires_at": row.expires_at,
    }


def pending(user) -> dict:
    # The TTL monitor runs about once a minute, so expiry is checked here too.
    rows = PendingExtraction.objects.filter(owner=user, expires_at__gt=timezone.now())
    return {
        "scanning": bool(cache.get(_scanning_key(user))),
        "results": [_row(row) for row in rows.order_by("-created_at")],
    }


def _owned(user, extraction_id: str) -> PendingExtraction:
    """The caller's pending review, or 404 -- never 403, so ids cannot be probed."""
    if not ObjectId.is_valid(extraction_id):
        raise not_found()
    row = PendingExtraction.objects.filter(
        owner=user, pk=ObjectId(extraction_id), expires_at__gt=timezone.now()
    ).first()
    if row is None:
        raise not_found()
    return row


def _close(user, row: PendingExtraction, outcome: str) -> None:
    ExtractionAttempt.objects.filter(owner=user, message_hash=row.message_hash).update(
        outcome=outcome
    )
    # The snippet goes with the row (11 §2.9); the hash on the attempt stays.
    row.delete()


def confirm(user, extraction_id: str, fields: dict) -> Subscription:
    """ "Confirm and track": the only way a scan's result becomes a subscription."""
    row = _owned(user, extraction_id)
    with transaction.atomic():
        sub = operations.create_subscription(today=today_for(user), owner=user, **fields)
        _close(user, row, Outcome.CONFIRMED)
    return sub


def discard(user, extraction_id: str) -> None:
    _close(user, _owned(user, extraction_id), Outcome.DISCARDED)
