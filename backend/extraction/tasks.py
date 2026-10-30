"""Background work for the Gmail scan (spec section 8)."""

from celery import shared_task
from django.contrib.auth import get_user_model

from . import reviews


@shared_task(name="extraction.tasks.scan_inbox")
def scan_inbox(user_id: str) -> int:
    """Not retried: a failed scan leaves its emails unrecorded, so the next
    one the user starts picks them up, and nothing is ever processed twice."""
    user = get_user_model().objects.filter(pk=user_id).first()
    if user is None:
        return 0
    return reviews.run_scan(user)
