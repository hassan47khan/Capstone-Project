"""Refresh tokens at rest (11 §2.9: "store the refresh token encrypted")."""

import pytest
from cryptography.fernet import Fernet
from django.core.exceptions import ImproperlyConfigured

from extraction import crypto


def test_a_token_survives_the_round_trip_and_is_not_stored_readable(gmail_settings):
    stored = crypto.encrypt("refresh-1")

    assert "refresh-1" not in stored
    assert crypto.decrypt(stored) == "refresh-1"


def test_a_tampered_ciphertext_fails_closed(gmail_settings):
    stored = crypto.encrypt("refresh-1")
    tampered = stored[:-4] + ("AAAA" if not stored.endswith("AAAA") else "BBBB")

    with pytest.raises(crypto.InvalidToken):
        crypto.decrypt(tampered)


def test_a_token_from_another_key_does_not_decrypt(gmail_settings):
    stored = crypto.encrypt("refresh-1")
    gmail_settings.GMAIL_TOKEN_ENCRYPTION_KEY = Fernet.generate_key().decode()

    with pytest.raises(crypto.InvalidToken):
        crypto.decrypt(stored)


def test_without_a_key_nothing_is_stored_rather_than_stored_weakly(settings):
    settings.GMAIL_TOKEN_ENCRYPTION_KEY = None

    with pytest.raises(ImproperlyConfigured):
        crypto.encrypt("refresh-1")
