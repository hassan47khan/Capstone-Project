"""Contract tests for /auth (handoff 04 §5, 05). The mock signs every login in as
Alex with a real JWT, so the token round trip is exercised end to end."""

import pytest
from rest_framework.test import APIClient

import mocks
from accounts.serializers import PASSWORD_MESSAGE


@pytest.fixture
def anon(db):
    return APIClient()


def signed_in(tokens):
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {tokens['access']}")
    return client


def test_register_returns_no_tokens(anon, contract):
    response = anon.post(
        "/api/v1/auth/register", {"email": "new@example.com", "password": "longenough"}
    )
    body = contract(response, "/auth/register")

    assert response.status_code == 201
    assert body == {"email": "new@example.com", "verification_sent": True}


@pytest.mark.parametrize(
    ("payload", "field", "message"),
    [
        ({"email": "new@example.com", "password": "short"}, "password", PASSWORD_MESSAGE),
        (
            {"email": "not-an-email", "password": "longenough"},
            "email",
            "Enter a valid email address.",
        ),
        ({"email": "new@example.com"}, "password", "Use at least 8 characters."),
    ],
)
def test_register_validation(anon, contract, payload, field, message):
    response = anon.post("/api/v1/auth/register", payload)
    body = contract(response, "/auth/register")

    assert response.status_code == 400
    assert body["error"]["fields"][field] == [message]


def test_login_gives_tokens_that_open_the_api(anon, contract):
    response = anon.post("/api/v1/auth/login", {"email": "alex.kim@example.com", "password": "x"})
    tokens = contract(response, "/auth/login")

    me = signed_in(tokens).get("/api/v1/auth/me")

    assert contract(me, "/auth/me")["email"] == "alex.kim@example.com"
    assert signed_in(tokens).get("/api/v1/analytics/summary").status_code == 200


def test_login_needs_a_password(anon, contract):
    response = anon.post("/api/v1/auth/login", {"email": "alex.kim@example.com"})

    assert contract(response, "/auth/login")["error"]["fields"]["password"] == [
        "Enter your password."
    ]


def test_auth_endpoints_ignore_a_stale_token(anon):
    anon.credentials(HTTP_AUTHORIZATION="Bearer expired.or.garbage")

    response = anon.post("/api/v1/auth/login", {"email": "alex.kim@example.com", "password": "x"})

    assert response.status_code == 200


def test_verify_email_signs_the_user_in(anon, contract):
    tokens = contract(
        anon.post("/api/v1/auth/verify-email", {"token": "abc"}), "/auth/verify-email"
    )

    assert signed_in(tokens).get("/api/v1/auth/me").status_code == 200


@pytest.mark.parametrize("path", ["/auth/resend-verification", "/auth/password-reset/request"])
def test_resend_endpoints_return_the_cooldown(anon, contract, path):
    response = anon.post(f"/api/v1{path}", {"email": "anyone@example.com"})

    assert contract(response, path) == {"cooldown_seconds": mocks.RESEND_COOLDOWN_SECONDS}


def test_refresh_rotates_the_pair(anon, contract):
    tokens = anon.post("/api/v1/auth/login", {"email": "a@example.com", "password": "x"}).json()

    response = anon.post("/api/v1/auth/refresh", {"refresh": tokens["refresh"]})
    fresh = contract(response, "/auth/refresh")

    assert set(fresh) == {"access", "refresh"}
    assert signed_in(fresh).get("/api/v1/auth/me").status_code == 200


def test_refresh_with_a_bad_token_is_401(anon, contract):
    response = anon.post("/api/v1/auth/refresh", {"refresh": "garbage"})

    assert response.status_code == 401
    assert contract(response, "/auth/refresh")["error"] == {
        "code": "token_invalid",
        "message": "Your session has expired. Log in again.",
    }


def test_refresh_for_a_user_who_is_gone_is_401(anon):
    tokens = anon.post("/api/v1/auth/login", {"email": "a@example.com", "password": "x"}).json()
    mocks.demo_user().delete()

    assert anon.post("/api/v1/auth/refresh", {"refresh": tokens["refresh"]}).status_code == 401


def test_logout_and_password_reset_confirm_have_no_body(anon, contract):
    logout = anon.post("/api/v1/auth/logout", {"refresh": "anything"})
    reset = anon.post(
        "/api/v1/auth/password-reset/confirm", {"token": "abc", "password": "longenough"}
    )

    assert logout.status_code == reset.status_code == 204
    contract(logout, "/auth/logout")
    contract(reset, "/auth/password-reset/confirm")


def test_password_reset_confirm_applies_the_length_rule(anon, contract):
    response = anon.post(
        "/api/v1/auth/password-reset/confirm", {"token": "abc", "password": "short"}
    )

    assert contract(response, "/auth/password-reset/confirm")["error"]["fields"]["password"] == [
        PASSWORD_MESSAGE
    ]


def test_auth_me_needs_a_token(anon, contract):
    response = anon.get("/api/v1/auth/me")

    assert response.status_code == 401
    assert contract(response, "/auth/me")["error"]["code"] == "not_authenticated"


def test_a_bad_token_is_token_invalid(anon):
    anon.credentials(HTTP_AUTHORIZATION="Bearer not.a.jwt")

    assert anon.get("/api/v1/auth/me").json()["error"]["code"] == "token_invalid"
