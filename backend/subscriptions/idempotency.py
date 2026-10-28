"""`Idempotency-Key` on POST /subscriptions (system design spec, data integrity
practices): a phone that retries after a dropped connection gets the
subscription it already created, not a second one.

The key is optional. Without it a create is a create, as before.
"""

import hashlib
import json
from datetime import timedelta

from django.utils import timezone

from core.contract import ApiError

from .models import IdempotencyKey

HEADER = "Idempotency-Key"
MAX_LENGTH = 255
# Long enough for any retry; the client makes a new key for each new form.
LIFETIME = timedelta(hours=24)


def key_from(request) -> str | None:
    """The request's key, None if it sent none, or 400 if it is unusable."""
    key = request.headers.get(HEADER)
    if key is None:
        return None
    key = key.strip()
    if not key or len(key) > MAX_LENGTH:
        message = f"Send an {HEADER} of 1 to {MAX_LENGTH} characters, or none."
        raise ApiError(400, "validation_error", message, fields={HEADER: [message]})
    return key


def digest(data) -> str:
    """The same body gives the same digest, whatever order its keys came in."""
    canonical = json.dumps(data, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(canonical.encode()).hexdigest()


def stored(owner, key: str) -> IdempotencyKey | None:
    """The live record for this key. An expired one the TTL monitor has not
    removed yet is deleted here, so its key can be used again."""
    records = IdempotencyKey.objects.filter(owner=owner, key=key)
    records.filter(expires_at__lte=timezone.now()).delete()
    return records.select_related("subscription").first()


def check(record: IdempotencyKey, request_digest: str):
    """The subscription a repeat should get back, or 409 if the body changed."""
    if record.request_digest != request_digest:
        raise ApiError(
            409,
            "idempotency_key_reused",
            f"This {HEADER} was already used for a different subscription.",
        )
    return record.subscription


def remember(owner, key: str, request_digest: str, subscription) -> None:
    """Record the key. Raises IntegrityError if a parallel request beat us to it."""
    IdempotencyKey.objects.create(
        owner=owner,
        key=key,
        request_digest=request_digest,
        subscription=subscription,
        expires_at=timezone.now() + LIFETIME,
    )
