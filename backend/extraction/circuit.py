"""What stops one bad day becoming an outage or a bill (spec sections 7 and 12).

Three independent brakes:

* **The kill switch**, `EXTRACTION_ENABLED`. Off, nothing calls the model.
* **The circuit breaker.** After `FAILURES_TO_OPEN` failures in a row the
  model is not called for `OPEN_SECONDS`; the scan answers 503
  `extraction_unavailable` straight away, which the contract documents as
  "route to manual entry". The first call after that is the probe: success
  closes the circuit, failure opens it again.
* **The per-user cap**, `EXTRACTION_DAILY_CAP` model calls in any 24 hours.

State lives in the cache, so with Redis every process shares one circuit.
"""

from datetime import timedelta

from django.conf import settings
from django.core.cache import cache
from django.utils import timezone

from .llm import LLMUnavailable
from .models import ExtractionAttempt

FAILURES_TO_OPEN = 3
OPEN_SECONDS = 300
# Failures further apart than this are not "in a row".
FAILURE_WINDOW_SECONDS = 600

_FAILURES = "extraction:llm:failures"
_OPEN_UNTIL = "extraction:llm:open_until"

OK, OPEN, DISABLED, UNCONFIGURED = "ok", "open", "disabled", "unconfigured"


def state() -> str:
    """What /health/ reports as `llm`."""
    if not settings.EXTRACTION_ENABLED:
        return DISABLED
    if not settings.LLM_API_KEY:
        return UNCONFIGURED
    until = cache.get(_OPEN_UNTIL)
    if until and until > timezone.now().timestamp():
        return OPEN
    return OK


def available() -> bool:
    return state() == OK


def record_success() -> None:
    cache.delete_many([_FAILURES, _OPEN_UNTIL])


def record_failure() -> None:
    cache.add(_FAILURES, 0, FAILURE_WINDOW_SECONDS)
    if cache.incr(_FAILURES) >= FAILURES_TO_OPEN:
        cache.set(_OPEN_UNTIL, timezone.now().timestamp() + OPEN_SECONDS, OPEN_SECONDS)


def guarded(operation):
    """Run one model call through the breaker.

    Only an unreachable model counts against it. An answer that could not be
    used means the service is up, so it neither opens nor closes the circuit.
    """
    if not available():
        raise LLMUnavailable(state())
    try:
        result = operation()
    except LLMUnavailable:
        record_failure()
        raise
    record_success()
    return result


def calls_in_last_day(user) -> int:
    """Rolling 24 hours, so the cap needs no time zone and has no midnight burst."""
    since = timezone.now() - timedelta(hours=24)
    return ExtractionAttempt.objects.filter(
        owner=user, called_model=True, created_at__gte=since
    ).count()


def under_cap(user) -> bool:
    return calls_in_last_day(user) < settings.EXTRACTION_DAILY_CAP
