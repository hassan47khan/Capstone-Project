"""Registration, login, email verification and password reset (spec section 6,
handoff 04 §5, 05).

Rules that keep the endpoints from revealing which emails have accounts:
login says "Email or password is incorrect." for an unknown email and a wrong
password alike, and reveals an unverified account only once the password is
right; resend and password reset answer the same whether or not the account
exists. Register's 409 is the accepted exception (05 §3).
"""

import hashlib
import hmac
import math
import secrets
from datetime import datetime, timedelta

from django.conf import settings
from django.contrib.auth.hashers import make_password
from django.core.cache import cache
from django.core.mail import send_mail
from django.utils import timezone
from django_mongodb_backend import transaction

from core.contract import ApiError

from . import tokens
from .models import EmailLinkToken, User, rules_for, settings_for

Purpose = EmailLinkToken.Purpose

LINK_LIFETIMES = {
    Purpose.VERIFY_EMAIL: timedelta(hours=24),
    Purpose.PASSWORD_RESET: timedelta(hours=1),
}
# Deep links the app opens (mobile/src/navigation/linking.ts).
LINK_PATHS = {
    Purpose.VERIFY_EMAIL: "verify-email",
    Purpose.PASSWORD_RESET: "reset-password",
}
# How long Resend stays disabled after a send (05 §4). The server holds it too.
RESEND_COOLDOWN_SECONDS = 60

LOCKOUT_FAILURES = 5
LOCKOUT_WINDOW = timedelta(minutes=10)
LOCKOUT_DURATION = timedelta(minutes=15)

INVALID_CREDENTIALS = "Email or password is incorrect."


def normalize(email: str) -> str:
    return email.strip().lower()


def _minutes(delta: timedelta) -> int:
    return max(1, math.ceil(delta.total_seconds() / 60))


def _plural(n: int, word: str) -> str:
    return f"{n} {word}" if n == 1 else f"{n} {word}s"


# Links ----------------------------------------------------------------------


_USED = {
    Purpose.VERIFY_EMAIL: "This link is not valid. Request a new one.",
    Purpose.PASSWORD_RESET: "This link has already been used.",
}


def _digest(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def issue_link(user: User, purpose: str) -> str:
    """A new single-use token for `purpose`; the earlier ones stop working."""
    now = timezone.now()
    token = secrets.token_urlsafe(32)
    with transaction.atomic():
        EmailLinkToken.objects.filter(user=user, purpose=purpose, used_at=None).update(used_at=now)
        EmailLinkToken.objects.create(
            user=user,
            purpose=purpose,
            digest=_digest(token),
            expires_at=now + LINK_LIFETIMES[purpose],
        )
    return token


def _redeem(token: str, purpose: str) -> EmailLinkToken:
    """Mark a link used and return it, or 400 `token_expired` / `token_invalid`."""
    digest = _digest(token)
    link = EmailLinkToken.objects.filter(digest=digest, purpose=purpose).first()
    if link is None or not hmac.compare_digest(link.digest, digest) or link.used_at:
        raise ApiError(400, "token_invalid", _USED[purpose])
    now = timezone.now()
    if link.expires_at <= now:
        raise ApiError(400, "token_expired", "This link has expired.")
    # Only one request can flip used_at from null, so a link works once.
    if not EmailLinkToken.objects.filter(pk=link.pk, used_at=None).update(used_at=now):
        raise ApiError(400, "token_invalid", _USED[purpose])
    return link


_MAIL = {
    Purpose.VERIFY_EMAIL: (
        "Confirm your SubTrak email",
        "Tap the link to confirm your email address. It works once, for 24 hours.\n\n{link}\n",
    ),
    Purpose.PASSWORD_RESET: (
        "Reset your SubTrak password",
        "Tap the link to choose a new password. It works once, for 1 hour.\n\n{link}\n"
        "\nIf you did not ask for this, you can ignore this email.\n",
    ),
}


def _send_link(user: User, purpose: str) -> None:
    token = issue_link(user, purpose)
    link = f"{settings.APP_LINK_PREFIX}{LINK_PATHS[purpose]}?token={token}"
    subject, body = _MAIL[purpose]
    send_mail(subject, body.format(link=link), None, [user.email])


def _cooldown(purpose: str, email: str) -> dict:
    """Start the resend cooldown for this email, or 429 if it is still running.

    Applied whether or not the account exists, so the answer reveals nothing.
    """
    key = f"auth:cooldown:{purpose}:{_digest(email)}"
    now = timezone.now().timestamp()
    until = cache.get(key)
    if until and until > now:
        wait = math.ceil(until - now)
        raise ApiError(
            429, "throttled", f"Try again in {_plural(wait, 'second')}.", retry_after=wait
        )
    cache.set(key, now + RESEND_COOLDOWN_SECONDS, RESEND_COOLDOWN_SECONDS)
    return {"cooldown_seconds": RESEND_COOLDOWN_SECONDS}


# Endpoints --------------------------------------------------------------------


def register(email: str, password: str) -> dict:
    email = normalize(email)
    if User.objects.filter(email=email).exists():
        raise ApiError(
            409,
            "duplicate_email",
            "An account with this email already exists.",
            fields={"email": ["An account with this email already exists."]},
        )
    with transaction.atomic():
        user = User.objects.create_user(email=email, password=password)
        settings_for(user)
        rules_for(user)
    _send_link(user, Purpose.VERIFY_EMAIL)
    return {"email": email, "verification_sent": True}


def verify_email(token: str) -> dict:
    """Confirm the email and sign the user in (05 §4)."""
    link = _redeem(token, Purpose.VERIFY_EMAIL)
    user = link.user
    if user.email_verified_at is None:
        user.email_verified_at = timezone.now()
        user.save(update_fields=["email_verified_at"])
    return tokens.issue_pair(user)


def resend_verification(email: str) -> dict:
    email = normalize(email)
    cooldown = _cooldown(Purpose.VERIFY_EMAIL, email)
    user = User.objects.filter(email=email, is_active=True).first()
    if user is not None and not user.email_verified:
        _send_link(user, Purpose.VERIFY_EMAIL)
    return cooldown


def _locked(user: User, now: datetime) -> ApiError:
    wait = _plural(_minutes(user.locked_until - now), "minute")
    return ApiError(423, "account_locked", f"Too many failed attempts. Try again in {wait}.")


def _record_failure(user: User, now: datetime) -> None:
    recent = [at for at in user.failed_logins if now - at < LOCKOUT_WINDOW]
    user.failed_logins = [*recent, now][-LOCKOUT_FAILURES:]
    if len(user.failed_logins) >= LOCKOUT_FAILURES:
        user.locked_until = now + LOCKOUT_DURATION
        user.failed_logins = []
    user.save(update_fields=["failed_logins", "locked_until"])


def login(email: str, password: str) -> dict:
    """Lockout first, then the password, then verification (spec section 6)."""
    now = timezone.now()
    user = User.objects.filter(email=normalize(email)).first()
    if user is not None and user.locked_until and user.locked_until > now:
        raise _locked(user, now)
    if user is None:
        make_password(password)  # as slow as a wrong password, so timing says nothing
        raise ApiError(401, "invalid_credentials", INVALID_CREDENTIALS)
    if not user.check_password(password) or not user.is_active:
        _record_failure(user, now)
        raise ApiError(401, "invalid_credentials", INVALID_CREDENTIALS)
    if not user.email_verified:
        raise ApiError(403, "email_not_verified", "Verify your email address before you log in.")
    if user.failed_logins or user.locked_until:
        user.failed_logins, user.locked_until = [], None
        user.save(update_fields=["failed_logins", "locked_until"])
    return tokens.issue_pair(user)


def request_password_reset(email: str) -> dict:
    email = normalize(email)
    cooldown = _cooldown(Purpose.PASSWORD_RESET, email)
    user = User.objects.filter(email=email, is_active=True).first()
    if user is not None:
        _send_link(user, Purpose.PASSWORD_RESET)
    return cooldown


def confirm_password_reset(token: str, password: str) -> None:
    """Set the new password and end every session (spec section 6)."""
    link = _redeem(token, Purpose.PASSWORD_RESET)
    user = link.user
    user.set_password(password)
    user.token_version += 1
    user.failed_logins, user.locked_until = [], None
    user.save(update_fields=["password", "token_version", "failed_logins", "locked_until"])
