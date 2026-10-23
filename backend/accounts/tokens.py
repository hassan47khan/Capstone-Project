"""Session tokens (spec section 6, handoff 04 §5).

Access tokens live 15 minutes and refresh tokens 7 days. Both carry the user's
`token_version` as a `tv` claim, and a token whose `tv` is behind the user's is
rejected, so a password reset ends every session at once. Refresh tokens
rotate: each one works once, because /auth/refresh and /auth/logout record its
`jti` in RevokedRefreshToken.
"""

from datetime import UTC, datetime

from django.db import IntegrityError
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken

from core.contract import ApiError

from .authentication import SESSION_EXPIRED, VERSION_CLAIM
from .models import RevokedRefreshToken, User


def _expired() -> ApiError:
    return ApiError(401, "token_invalid", SESSION_EXPIRED)


def issue_pair(user: User) -> dict:
    refresh = RefreshToken.for_user(user)
    refresh[VERSION_CLAIM] = user.token_version
    # The access token copies every claim, `tv` included.
    return {"access": str(refresh.access_token), "refresh": str(refresh)}


def _current(token: str) -> tuple[RefreshToken, User]:
    """The refresh token and its user, if it still works; 401 otherwise."""
    try:
        refresh = RefreshToken(token)
    except TokenError:
        raise _expired() from None
    user = User.objects.filter(pk=refresh["user_id"], is_active=True).first()
    if user is None or refresh.get(VERSION_CLAIM) != user.token_version:
        raise _expired()
    if RevokedRefreshToken.objects.filter(jti=refresh["jti"]).exists():
        raise _expired()
    return refresh, user


def _revoke(refresh: RefreshToken, user: User) -> None:
    RevokedRefreshToken.objects.create(
        jti=refresh["jti"],
        user=user,
        expires_at=datetime.fromtimestamp(refresh["exp"], tz=UTC),
    )


def rotate(token: str) -> dict:
    """A new pair for a working refresh token, which then stops working."""
    refresh, user = _current(token)
    try:
        _revoke(refresh, user)
    except IntegrityError:
        # Another request rotated the same token first.
        raise _expired() from None
    return issue_pair(user)


def revoke(token: str) -> None:
    """Log out this device. A token that already does not work is fine."""
    try:
        refresh, user = _current(token)
        _revoke(refresh, user)
    except (ApiError, IntegrityError):
        pass
