"""Auth endpoints (handoff 04 §5). Requests are validated for real; the answers
come from `mocks` until slice 3 adds tokens, mail and rate limits."""

from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import status
from rest_framework.generics import RetrieveAPIView
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

import mocks
from core.contract import errors

from .serializers import (
    CooldownSerializer,
    EmailSerializer,
    EmailTokenSerializer,
    LoginSerializer,
    PasswordResetConfirmSerializer,
    RefreshSerializer,
    RegisterResponseSerializer,
    RegisterSerializer,
    TokenPairSerializer,
    UserProfileSerializer,
)

NO_CONTENT = OpenApiResponse(description="Done; no body.")


class MeView(RetrieveAPIView):
    """The signed-in user's profile. Authentication comes from the defaults."""

    serializer_class = UserProfileSerializer

    def get_object(self):
        return self.request.user


class AuthMeView(MeView):
    @extend_schema(
        operation_id="auth_me", tags=["auth"], responses={200: UserProfileSerializer, **errors(401)}
    )
    def get(self, request, *args, **kwargs):
        """The signed-in user's profile."""
        return super().get(request, *args, **kwargs)


class PublicView(APIView):
    """Reached without a token; a stale Authorization header must not cause a 401."""

    authentication_classes = []
    permission_classes = [AllowAny]

    @staticmethod
    def valid(serializer_class, request) -> dict:
        serializer = serializer_class(data=request.data)
        serializer.is_valid(raise_exception=True)
        return serializer.validated_data


class RegisterView(PublicView):
    @extend_schema(
        operation_id="auth_register",
        tags=["auth"],
        request=RegisterSerializer,
        responses={201: RegisterResponseSerializer, **errors(400, 409, 429)},
    )
    def post(self, request):
        """Create an unverified account and email a verification link. Returns no tokens.

        409 `duplicate_email`: "An account with this email already exists."
        """
        data = self.valid(RegisterSerializer, request)
        body = mocks.register(data["email"], data["password"])
        return Response(RegisterResponseSerializer(body).data, status=status.HTTP_201_CREATED)


class VerifyEmailView(PublicView):
    @extend_schema(
        operation_id="auth_verify_email",
        tags=["auth"],
        request=EmailTokenSerializer,
        responses={200: TokenPairSerializer, **errors(400)},
    )
    def post(self, request):
        """Verify the email from the link and sign the user in.

        400 `token_expired` ("This link has expired.") or `token_invalid`.
        """
        data = self.valid(EmailTokenSerializer, request)
        return Response(TokenPairSerializer(mocks.verify_email(data["token"])).data)


class ResendVerificationView(PublicView):
    @extend_schema(
        operation_id="auth_resend_verification",
        tags=["auth"],
        request=EmailSerializer,
        responses={200: CooldownSerializer, **errors(400, 429)},
    )
    def post(self, request):
        """Send a new verification link. Always 200 for a well-formed email, so it
        cannot be used to discover accounts."""
        data = self.valid(EmailSerializer, request)
        return Response(CooldownSerializer(mocks.resend_verification(data["email"])).data)


class LoginView(PublicView):
    @extend_schema(
        operation_id="auth_login",
        tags=["auth"],
        request=LoginSerializer,
        responses={200: TokenPairSerializer, **errors(400, 401, 403, 423, 429)},
    )
    def post(self, request):
        """Exchange email and password for tokens.

        401 `invalid_credentials`: "Email or password is incorrect." (never says which).
        403 `email_not_verified`: route to VerifyEmailSent. 423 `account_locked`.
        429 `throttled`: "Too many attempts. Try again in {n} minutes."
        """
        data = self.valid(LoginSerializer, request)
        return Response(TokenPairSerializer(mocks.login(data["email"], data["password"])).data)


class RefreshView(PublicView):
    @extend_schema(
        operation_id="auth_refresh",
        tags=["auth"],
        request=RefreshSerializer,
        responses={200: TokenPairSerializer, **errors(400, 401)},
    )
    def post(self, request):
        """Exchange a refresh token for a new pair. The old refresh token stops working."""
        data = self.valid(RefreshSerializer, request)
        return Response(TokenPairSerializer(mocks.refresh(data["refresh"])).data)


class LogoutView(PublicView):
    @extend_schema(
        operation_id="auth_logout",
        tags=["auth"],
        request=RefreshSerializer,
        responses={204: NO_CONTENT, **errors(400)},
    )
    def post(self, request):
        """Revoke this device's refresh token. Works with an expired access token."""
        data = self.valid(RefreshSerializer, request)
        mocks.logout(data["refresh"])
        return Response(status=status.HTTP_204_NO_CONTENT)


class PasswordResetRequestView(PublicView):
    @extend_schema(
        operation_id="auth_password_reset_request",
        tags=["auth"],
        request=EmailSerializer,
        responses={200: CooldownSerializer, **errors(400, 429)},
    )
    def post(self, request):
        """Email a reset link if the account exists. Always 200: no account enumeration."""
        data = self.valid(EmailSerializer, request)
        return Response(CooldownSerializer(mocks.request_password_reset(data["email"])).data)


class PasswordResetConfirmView(PublicView):
    @extend_schema(
        operation_id="auth_password_reset_confirm",
        tags=["auth"],
        request=PasswordResetConfirmSerializer,
        responses={204: NO_CONTENT, **errors(400)},
    )
    def post(self, request):
        """Set a new password from the emailed token, then sign in again.

        400 `token_expired` ("This link has expired.") or `token_invalid`
        ("This link has already been used.").
        """
        data = self.valid(PasswordResetConfirmSerializer, request)
        mocks.confirm_password_reset(data["token"], data["password"])
        return Response(status=status.HTTP_204_NO_CONTENT)
