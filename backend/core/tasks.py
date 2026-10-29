"""Sending email off the request thread, without depending on the broker.

Spec section 6 is the constraint: registration and password reset must work
whether or not Redis is up. So `queue_email` tries to enqueue, and sends
inline when the broker will not take the message. The user waits a little
longer in an outage; they are never told to try again later.

Section 12's budget for a send is 5 seconds with 2 retries, so the retries
belong to the worker (`max_retries=2`) and the timeout to the SMTP backend
(`MAILERS`).
"""

import logging

from celery import shared_task
from django.core.mail import send_mail
from kombu.exceptions import OperationalError

logger = logging.getLogger(__name__)


@shared_task(
    name="core.tasks.send_email",
    # Section 12: 2 retries. The backoff is short because a mail provider
    # that is briefly unreachable is usually back within a minute.
    autoretry_for=(Exception,),
    max_retries=2,
    retry_backoff=10,
    retry_jitter=True,
)
def send_email(subject: str, body: str, recipients: list[str]) -> int:
    """Send one message. Arguments are JSON, which is the only serializer."""
    return send_mail(subject, body, None, recipients)


def queue_email(subject: str, body: str, recipients: list[str]) -> bool:
    """Hand the message to a worker, or send it here if the broker is down.

    Returns True when it was queued. `CELERY_TASK_PUBLISH_RETRY` is off so
    this fails in seconds rather than holding a request open while kombu
    retries a broker that is not there.
    """
    try:
        send_email.delay(subject, body, recipients)
        return True
    except (OperationalError, OSError):
        # Never log the body: a reset link is in it.
        logger.warning("Celery broker unreachable; sending email inline.")
        send_mail(subject, body, None, recipients)
        return False
