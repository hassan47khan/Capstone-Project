"""`manage.py send_test_push` (phase 4)."""

from io import StringIO
from unittest import mock

import pytest
from django.core.management import call_command
from django.core.management.base import CommandError

from notifications import push

TOKEN = "ExponentPushToken[alex-1]"


def run(*args, **options):
    out = StringIO()
    try:
        call_command("send_test_push", *args, stdout=out, stderr=out, **options)
    finally:
        run.output = out.getvalue()
    return run.output


def test_it_refuses_to_send_without_live():
    with pytest.raises(CommandError, match="--live"):
        run(f"--token={TOKEN}")


def test_it_reports_the_configuration_without_printing_the_access_token(settings):
    settings.EXPO_ACCESS_TOKEN = "expo-super-secret"

    with pytest.raises(CommandError):
        run(f"--token={TOKEN}")

    assert "bearer token set" in run.output
    assert "expo-super-secret" not in run.output


def test_live_sends_one_message():
    with mock.patch.object(
        push, "send", return_value=[push.Ticket(TOKEN, "ok", receipt_id="r0")]
    ) as sent:
        output = run(f"--token={TOKEN}", live=True)

    assert sent.call_count == 1
    assert "Accepted. Receipt id r0." in output
    # Acceptance is not delivery, and the command has to say so.
    assert "not delivery" in output


def test_a_rejected_token_is_reported_as_a_failure():
    with mock.patch.object(
        push, "send", return_value=[push.Ticket(TOKEN, "error", error=push.DEVICE_NOT_REGISTERED)]
    ):
        with pytest.raises(CommandError, match=push.DEVICE_NOT_REGISTERED):
            run(f"--token={TOKEN}", live=True)
