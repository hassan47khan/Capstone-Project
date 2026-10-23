"""The API's authentication class (REST_FRAMEWORK settings). Kept apart from
accounts.tokens because DRF imports it while its own settings load."""

from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.authentication import JWTAuthentication

# Carries User.token_version; a token behind the user's version is dead.
VERSION_CLAIM = "tv"
SESSION_EXPIRED = "Your session has expired. Log in again."


class VersionedJWTAuthentication(JWTAuthentication):
    """simplejwt's authentication, plus the `tv` check (spec section 6)."""

    def get_user(self, validated_token):
        user = super().get_user(validated_token)
        if validated_token.get(VERSION_CLAIM) != user.token_version:
            raise AuthenticationFailed(SESSION_EXPIRED, code="token_invalid")
        return user
