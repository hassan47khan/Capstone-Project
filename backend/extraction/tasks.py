"""Background work for the Gmail scan (spec section 8)."""

from celery import shared_task
from django.contrib.auth import get_user_model

from . import reviews


@shared_task(
    name="extraction.tasks.scan_inbox",
    # Up to 25 emails at 8 seconds or more each, far past the 90 seconds every
    # other task gets. It finishes inside the time the app shows it as running.
    soft_time_limit=reviews.SCAN_SECONDS - 30,
    time_limit=reviews.SCAN_SECONDS,
)
def scan_inbox(user_id: str) -> int:
    """Not retried: a failed scan leaves its emails unrecorded, so the next
    one the user starts picks them up, and nothing is ever processed twice."""
    user = get_user_model().objects.filter(pk=user_id).first()
    if user is None:
        return 0
    return reviews.run_scan(user)
