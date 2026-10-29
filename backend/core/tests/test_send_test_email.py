"""`manage.py send_test_email` (phase 1).

The command exists to reach the real mailer, so the one thing worth pinning
down is that it will not do so by accident, and that it never prints the key.
"""

from io import StringIO

import pytest
from django.core import mail
from django.core.management import call_command
from django.core.management.base import CommandError

ADDRESS = "hassan@example.com"


def run(*args, **options):
    """Run the command, returning whatever it printed even if it then failed."""
    out = StringIO()
    try:
        call_command("send_test_email", *args, stdout=out, stderr=out, **options)
    finally:
        run.output = out.getvalue()
    return run.output


def test_it_refuses_to_send_without_live():
    with pytest.raises(CommandError, match="--live"):
        run(ADDRESS)

    assert mail.outbox == []


def test_live_sends_one_message():
    output = run(ADDRESS, live=True)

    assert len(mail.outbox) == 1
    assert mail.outbox[0].to == [ADDRESS]
    assert "Sent 1 message." in output


def test_it_reports_the_configuration_without_printing_the_key(settings):
    # The real Resend mailer, reported but never dialled: no --live.
    settings.MAILERS = {
        "default": {
            "BACKEND": "django.core.mail.backends.smtp.EmailBackend",
            "OPTIONS": {"host": "smtp.resend.com", "password": "re_super_secret"},
        }
    }

    with pytest.raises(CommandError):
        run(ADDRESS)

    assert "smtp.EmailBackend" in run.output
    assert settings.DEFAULT_FROM_EMAIL in run.output
    assert ADDRESS in run.output
    assert "re_super_secret" not in run.output


def test_it_says_so_when_the_console_backend_would_swallow_the_send(settings):
    settings.MAILERS = {"default": {"BACKEND": "django.core.mail.backends.console.EmailBackend"}}

    with pytest.raises(CommandError):
        run(ADDRESS)

    assert "RESEND_API_KEY is not set" in run.output


def test_a_mailer_that_accepts_nothing_is_reported_as_a_failure(monkeypatch):
    # send_mail returns the number of messages delivered; Resend rejecting an
    # unverified From address looks like this rather than like an exception.
    monkeypatch.setattr("core.management.commands.send_test_email.send_mail", lambda *a, **k: 0)

    with pytest.raises(CommandError, match="accepted no messages"):
        run(ADDRESS, live=True)
