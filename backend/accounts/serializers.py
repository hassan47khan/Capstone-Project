from rest_framework import serializers

from .models import User

# Minimum length only, the same rule client and server (handoff 04 §5, 05 §3).
PASSWORD_MIN_LENGTH = 8
PASSWORD_MESSAGE = f"Use at least {PASSWORD_MIN_LENGTH} characters."
EMAIL_MESSAGE = "Enter a valid email address."


class UserProfileSerializer(serializers.ModelSerializer):
    """Matches `UserProfile` in mobile/src/api/types.ts."""

    # ObjectId is not JSON; the client treats ids as opaque strings.
    id = serializers.CharField(read_only=True)
    email_verified = serializers.BooleanField(read_only=True)

    class Meta:
        model = User
        fields = ["id", "email", "name", "email_verified"]
        read_only_fields = fields


def _email():
    return serializers.EmailField(
        error_messages={"invalid": EMAIL_MESSAGE, "required": EMAIL_MESSAGE, "blank": EMAIL_MESSAGE}
    )


def _new_password():
    return serializers.CharField(
        min_length=PASSWORD_MIN_LENGTH,
        max_length=128,
        trim_whitespace=False,
        style={"input_type": "password"},
        error_messages={
            "min_length": PASSWORD_MESSAGE,
            "required": PASSWORD_MESSAGE,
            "blank": PASSWORD_MESSAGE,
        },
    )


class RegisterSerializer(serializers.Serializer):
    email = _email()
    password = _new_password()


class RegisterResponseSerializer(serializers.Serializer):
    email = serializers.EmailField()
    verification_sent = serializers.BooleanField()


class LoginSerializer(serializers.Serializer):
    email = _email()
    password = serializers.CharField(
        trim_whitespace=False,
        style={"input_type": "password"},
        error_messages={"required": "Enter your password.", "blank": "Enter your password."},
    )


class TokenPairSerializer(serializers.Serializer):
    access = serializers.CharField(help_text="Short-lived access token (15 minutes).")
    refresh = serializers.CharField(
        help_text="Refresh token (7 days). Rotated on every refresh; keep it in secure storage."
    )


class RefreshSerializer(serializers.Serializer):
    refresh = serializers.CharField()


class EmailTokenSerializer(serializers.Serializer):
    token = serializers.CharField(help_text="The token from the emailed link.")


class EmailSerializer(serializers.Serializer):
    email = _email()


class CooldownSerializer(serializers.Serializer):
    cooldown_seconds = serializers.IntegerField(
        help_text="Keep Resend disabled for this long, with a visible countdown."
    )


class PasswordResetConfirmSerializer(serializers.Serializer):
    token = serializers.CharField(help_text="The token from the emailed link.")
    password = _new_password()
