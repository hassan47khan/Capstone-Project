"""Connecting and disconnecting Gmail (handoff 04 §6a, 11 §2.1 and §2.9).

The views call these and serialize what comes back; the shapes are the ones
`mocks.py` froze, so the mobile client sees no difference.
"""

import logging

import httpx
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from django.utils import timezone
from django_mongodb_backend import transaction
from rest_framework import status

from core.contract import ApiError

from . import crypto, gmail
from .models import GmailConnection, PendingExtraction

logger = logging.getLogger(__name__)

DENIED = "Access was denied or timed out."


def _require_configuration() -> None:
    """Fail before spending the user's single-use code, not after.

    A missing client or key is an operator mistake, so this is a 500 with a
    message in the log, not a 400 that would tell the user to try again.
    """
    missing = [
        name
        for name in (
            "GOOGLE_OAUTH_CLIENT_ID",
            "GOOGLE_OAUTH_CLIENT_SECRET",
            "GOOGLE_OAUTH_REDIRECT_URIS",
            "GMAIL_TOKEN_ENCRYPTION_KEY",
        )
        if not getattr(settings, name)
    ]
    if missing:
        raise ImproperlyConfigured(f"Gmail is not configured: {', '.join(missing)} unset.")


def _payload(connection: GmailConnection) -> dict:
    return {
        "provider": "gmail",
        "email": connection.email,
        "connected_at": connection.connected_at,
    }


def connect(
    user,
    code: str,
    redirect_uri: str,
    code_verifier: str | None = None,
    *,
    transport: httpx.BaseTransport | None = None,
) -> dict:
    """Redeem the consent code and keep the (encrypted) refresh token."""
    _require_configuration()
    try:
        tokens = gmail.exchange_code(code, redirect_uri, code_verifier, transport=transport)
    except gmail.GmailDenied as error:
        # The reason goes to the log, never the code or a token.
        logger.info("Gmail connect refused: %s", error)
        raise ApiError(status.HTTP_400_BAD_REQUEST, "gmail_denied", DENIED) from error
    try:
        address = gmail.profile_email(tokens.access_token, transport=transport)
    except (httpx.HTTPError, KeyError) as error:
        # We hold a grant we cannot use. Hand it back rather than keep it.
        gmail.revoke(tokens.refresh_token, transport=transport)
        raise ApiError(status.HTTP_400_BAD_REQUEST, "gmail_denied", DENIED) from error

    previous = GmailConnection.objects.filter(user=user).first()
    connection, _ = GmailConnection.objects.update_or_create(
        user=user,
        defaults={
            "email": address,
            "refresh_token_encrypted": crypto.encrypt(tokens.refresh_token),
            "scopes": tokens.scope,
            "connected_at": timezone.now(),
            "revoked_at": None,
        },
    )
    if previous is not None:
        # Reconnecting issues a new refresh token; the old one would
        # otherwise stay valid at Google with nothing holding it.
        _revoke_stored(previous, transport=transport)
    return _payload(connection)


def _revoke_stored(connection: GmailConnection, *, transport=None) -> None:
    try:
        token = crypto.decrypt(connection.refresh_token_encrypted)
    except (crypto.InvalidToken, ImproperlyConfigured):
        # Unreadable under the current key, so there is nothing to send.
        return
    gmail.revoke(token, transport=transport)


def disconnect(user, *, transport: httpx.BaseTransport | None = None) -> None:
    """Revoke at Google, forget the token, and purge every pending review (11 §2.9).

    Idempotent: disconnecting twice, or without ever connecting, is a no-op.
    """
    connection = GmailConnection.objects.filter(user=user).first()
    if connection is not None:
        _revoke_stored(connection, transport=transport)
    with transaction.atomic():
        GmailConnection.objects.filter(user=user).delete()
        PendingExtraction.objects.filter(owner=user).delete()


def access_token_for(user, *, transport: httpx.BaseTransport | None = None) -> str:
    """An access token for a scan, or 409 `gmail_not_connected`.

    A refresh token Google refuses marks the connection revoked, so Settings
    can show "Reconnect" (11 §2.8) instead of failing on every scan.
    """
    connection = GmailConnection.objects.filter(user=user, revoked_at__isnull=True).first()
    if connection is None:
        raise ApiError(status.HTTP_409_CONFLICT, "gmail_not_connected", "Connect Gmail first.")
    try:
        return gmail.refresh_access_token(
            crypto.decrypt(connection.refresh_token_encrypted), transport=transport
        )
    except (gmail.GmailRevoked, crypto.InvalidToken) as error:
        GmailConnection.objects.filter(pk=connection.pk).update(revoked_at=timezone.now())
        raise ApiError(
            status.HTTP_409_CONFLICT, "gmail_not_connected", "Reconnect Gmail to scan again."
        ) from error
