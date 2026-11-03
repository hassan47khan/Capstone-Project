"""Email through Celery, and what happens when the broker is not there.

Spec section 6: signing up and resetting a password must work during a
Redis outage. That is the behaviour most of this file is about.
"""

import logging
from unittest import mock

import pytest
from django.core import mail
from kombu.exceptions import OperationalError

from accounts import auth
from core.tasks import queue_email, send_email

SUBJECT = "Reset your SubTrak password"
BODY = "Tap the link.\n\nsubtrak://reset-password?token=secret-token-value\n"


def test_a_queued_email_is_sent():
    assert queue_email(SUBJECT, BODY, ["alex@example.com"]) is True
    assert len(mail.outbox) == 1
    assert mail.outbox[0].subject == SUBJECT
    assert mail.outbox[0].to == ["alex@example.com"]


def test_the_task_sends_one_message_when_a_worker_runs_it():
    assert send_email(SUBJECT, BODY, ["alex@example.com"]) == 1
    assert len(mail.outbox) == 1


def test_section_12_allows_the_send_two_retries():
    assert send_email.max_retries == 2


# The broker-down fallback ------------------------------------------------------


def broker_down():
    return mock.patch.object(send_email, "delay", side_effect=OperationalError("no broker"))


def test_a_broker_that_is_down_does_not_stop_the_email():
    with broker_down():
        queued = queue_email(SUBJECT, BODY, ["alex@example.com"])

    assert queued is False
    assert len(mail.outbox) == 1, "the message must still go out, just inline"


def test_the_fallback_never_logs_the_link(caplog):
    with broker_down(), caplog.at_level(logging.DEBUG):
        queue_email(SUBJECT, BODY, ["alex@example.com"])

    assert "broker unreachable" in caplog.text.lower()
    assert "secret-token-value" not in caplog.text


@pytest.mark.django_db
def test_registration_still_works_with_the_broker_down(anon_register):
    with broker_down():
        anon_register()

    assert len(mail.outbox) == 1
    assert "verify-email" in mail.outbox[0].body


@pytest.mark.django_db
def test_a_password_reset_still_works_with_the_broker_down(alex):
    with broker_down():
        auth.request_password_reset(alex.email)

    assert len(mail.outbox) == 1
    assert "reset-password" in mail.outbox[0].body


@pytest.fixture
def anon_register():
    def register():
        return auth.register("broker@example.com", "longenough")

    return register
