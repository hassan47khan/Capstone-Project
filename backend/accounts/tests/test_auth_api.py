"""/auth against the real rules (handoff 04 §5, §6; spec section 6; 05).

Every response is also checked against schema.yml. Emails go to Django's
test outbox, which is where the tests read the links from.
"""

import re
from datetime import timedelta

import pytest
from django.core import mail
from django.db import connection
from django.db.models import QuerySet
from django.utils import timezone
from rest_framework.test import APIClient

from accounts import auth, tokens
from accounts.models import EmailLinkToken, LoginFailures, RevokedRefreshToken, User
from accounts.serializers import PASSWORD_MESSAGE
from accounts.throttles import AuthEmailThrottle, AuthIPThrottle
from subscriptions.seed import DEMO_PASSWORD

ALEX = "alex.kim@example.com"
NEW = "new@example.com"
PASSWORD = "longenough"


@pytest.fixture
def anon(db):
    return APIClient()


def signed_in(tokens):
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {tokens['access']}")
    return client


def post(client, path, data):
    return client.post(f"/api/v1{path}", data)


def link_token(message, path):
    """The token from the link in an email the API sent."""
    found = re.search(rf"subtrak://{path}\?token=([\w-]+)", message.body)
    assert found, message.body
    return found[1]


def login(client, email=ALEX, password=DEMO_PASSWORD):
    return post(client, "/auth/login", {"email": email, "password": password})


@pytest.fixture
def registered(anon):
    """A new, unverified account, and the token from its verification email."""
    post(anon, "/auth/register", {"email": NEW, "password": PASSWORD})
    return link_token(mail.outbox[-1], "verify-email")


# Register ---------------------------------------------------------------------


def test_register_creates_an_unverified_account_and_emails_a_link(anon, contract):
    response = post(anon, "/auth/register", {"email": " New@Example.com ", "password": PASSWORD})

    assert response.status_code == 201
    assert contract(response, "/auth/register") == {"email": NEW, "verification_sent": True}
    user = User.objects.get(email=NEW)
    assert not user.email_verified and user.check_password(PASSWORD)
    assert mail.outbox[-1].to == [NEW]
    link_token(mail.outbox[-1], "verify-email")


def test_only_the_hash_of_a_link_token_is_stored(registered):
    stored = EmailLinkToken.objects.get(user__email=NEW)
    assert registered not in stored.digest
    assert len(stored.digest) == 64


def test_register_with_an_existing_email_is_409(anon, contract, alex):
    response = post(anon, "/auth/register", {"email": "Alex.Kim@example.com", "password": PASSWORD})

    assert response.status_code == 409
    assert contract(response, "/auth/register")["error"]["code"] == "duplicate_email"


def test_a_registration_that_races_past_the_check_is_still_409(anon, contract, alex, monkeypatch):
    # Both requests saw no account; the unique index stops the second.
    monkeypatch.setattr(QuerySet, "exists", lambda self: False)

    response = post(anon, "/auth/register", {"email": ALEX, "password": PASSWORD})

    assert response.status_code == 409
    assert contract(response, "/auth/register")["error"]["code"] == "duplicate_email"
    assert User.objects.filter(email=ALEX).count() == 1


@pytest.mark.parametrize(
    ("payload", "field", "message"),
    [
        ({"email": NEW, "password": "short"}, "password", PASSWORD_MESSAGE),
        ({"email": "not-an-email", "password": PASSWORD}, "email", "Enter a valid email address."),
        ({"email": NEW}, "password", "Use at least 8 characters."),
    ],
)
def test_register_validation(anon, contract, payload, field, message):
    response = post(anon, "/auth/register", payload)

    assert response.status_code == 400
    assert contract(response, "/auth/register")["error"]["fields"][field] == [message]


# Verify email -------------------------------------------------------------------


def test_verify_email_confirms_the_address_and_signs_in(anon, contract, registered):
    response = post(anon, "/auth/verify-email", {"token": registered})
    tokens = contract(response, "/auth/verify-email")

    assert User.objects.get(email=NEW).email_verified
    assert signed_in(tokens).get("/api/v1/auth/me").json()["email"] == NEW


def test_a_verification_link_works_once(anon, contract, registered):
    post(anon, "/auth/verify-email", {"token": registered})
    again = post(anon, "/auth/verify-email", {"token": registered})

    assert again.status_code == 400
    assert contract(again, "/auth/verify-email")["error"]["code"] == "token_invalid"


def test_an_expired_verification_link_says_so(anon, registered):
    EmailLinkToken.objects.update(expires_at=timezone.now() - timedelta(seconds=1))

    error = post(anon, "/auth/verify-email", {"token": registered}).json()["error"]

    assert error == {"code": "token_expired", "message": "This link has expired."}


def test_an_unknown_verification_token_is_invalid(anon, db):
    response = post(anon, "/auth/verify-email", {"token": "made-up"})

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "token_invalid"


def test_a_new_link_ends_the_old_one(anon, registered):
    post(anon, "/auth/resend-verification", {"email": NEW})
    newer = link_token(mail.outbox[-1], "verify-email")

    assert post(anon, "/auth/verify-email", {"token": registered}).status_code == 400
    assert post(anon, "/auth/verify-email", {"token": newer}).status_code == 200


# Resend and password reset request ----------------------------------------------


@pytest.mark.parametrize("path", ["/auth/resend-verification", "/auth/password-reset/request"])
def test_resend_endpoints_return_the_cooldown(anon, contract, path, db):
    response = post(anon, path, {"email": "anyone@example.com"})

    assert contract(response, path) == {"cooldown_seconds": auth.RESEND_COOLDOWN_SECONDS}


@pytest.mark.parametrize("path", ["/auth/resend-verification", "/auth/password-reset/request"])
def test_resending_inside_the_cooldown_is_429_with_retry_after(anon, contract, path, db):
    post(anon, path, {"email": "anyone@example.com"})
    again = post(anon, path, {"email": "Anyone@example.com"})

    assert again.status_code == 429
    assert contract(again, path)["error"]["code"] == "throttled"
    assert 0 < int(again["Retry-After"]) <= auth.RESEND_COOLDOWN_SECONDS


def test_resend_verification_mails_only_an_unverified_account(anon, alex, registered):
    sent = len(mail.outbox)
    for email in [NEW, ALEX, "nobody@example.com"]:
        assert post(anon, "/auth/resend-verification", {"email": email}).status_code == 200

    assert [m.to for m in mail.outbox[sent:]] == [[NEW]]


def test_password_reset_request_is_enumeration_resistant(anon, alex):
    known = post(anon, "/auth/password-reset/request", {"email": ALEX})
    unknown = post(anon, "/auth/password-reset/request", {"email": "nobody@example.com"})

    assert (known.status_code, known.json()) == (unknown.status_code, unknown.json())
    assert [m.to for m in mail.outbox] == [[ALEX]]
    link_token(mail.outbox[0], "reset-password")


# Login --------------------------------------------------------------------------


def test_login_gives_tokens_that_open_the_api(anon, contract, alex):
    tokens = contract(login(anon), "/auth/login")

    me = signed_in(tokens).get("/api/v1/auth/me")

    assert contract(me, "/auth/me")["email"] == ALEX
    # Seed, log in, read: the canonical figure through the real endpoints (04 §4).
    summary = signed_in(tokens).get("/api/v1/analytics/summary").json()
    assert summary["monthly_total"] == {"amount": "129.20", "currency": "USD"}


@pytest.mark.parametrize("email", ["Alex.Kim@Example.com", " alex.kim@example.com "])
def test_login_email_is_case_insensitive(anon, alex, email):
    assert login(anon, email).status_code == 200


@pytest.mark.parametrize(
    ("email", "password"), [("nobody@example.com", DEMO_PASSWORD), (ALEX, "wrong-password")]
)
def test_unknown_email_and_wrong_password_look_the_same(anon, contract, alex, email, password):
    response = login(anon, email, password)

    assert response.status_code == 401
    assert contract(response, "/auth/login")["error"] == {
        "code": "invalid_credentials",
        "message": "Email or password is incorrect.",
    }


def test_unverified_is_revealed_only_after_the_right_password(anon, contract, registered):
    assert login(anon, NEW, "wrong-password").status_code == 401

    response = login(anon, NEW, PASSWORD)

    assert response.status_code == 403
    assert contract(response, "/auth/login")["error"]["code"] == "email_not_verified"


def test_login_needs_a_password(anon, contract):
    response = post(anon, "/auth/login", {"email": ALEX})

    assert contract(response, "/auth/login")["error"]["fields"]["password"] == [
        "Enter your password."
    ]


def test_demo_users_loaded_by_a_request_cannot_log_in(anon, db):
    # A fresh database: the 04 §6a mocks seed the demo dataset on first use.
    someone = User.objects.create_user(email=NEW, password=PASSWORD)
    client = APIClient()
    client.force_authenticate(someone)
    assert client.get("/api/v1/trials").status_code == 200
    assert User.objects.filter(email=ALEX).exists()

    assert login(anon, ALEX, DEMO_PASSWORD).status_code == 401


def test_auth_endpoints_ignore_a_stale_token(anon, alex):
    anon.credentials(HTTP_AUTHORIZATION="Bearer expired.or.garbage")

    assert login(anon).status_code == 200


# Lockout (spec section 6: five failures in 10 minutes lock for 15) ---------------


def fail(client, times, email=ALEX):
    return [login(client, email, "wrong-password").status_code for _ in range(times)]


def failures(email=ALEX):
    return LoginFailures.objects.filter(email_digest=auth._digest(email))


def test_five_failures_lock_the_account_even_for_the_right_password(anon, contract, alex):
    assert fail(anon, 5) == [401] * 5

    response = login(anon)

    assert response.status_code == 423
    assert contract(response, "/auth/login")["error"] == {
        "code": "account_locked",
        "message": "Too many failed attempts. Try again in 15 minutes.",
    }


def test_an_unknown_email_locks_exactly_like_a_known_one(anon, contract, alex):
    known, unknown = fail(anon, 6), fail(anon, 6, "nobody@example.com")

    assert known == unknown == [401] * 5 + [423]
    assert contract(login(anon, "Nobody@Example.com", "x"), "/auth/login")["error"] == {
        "code": "account_locked",
        "message": "Too many failed attempts. Try again in 15 minutes.",
    }


def test_the_lockout_is_per_email(anon, alex):
    fail(anon, 5, "nobody@example.com")

    assert login(anon).status_code == 200


def test_the_lock_ends_after_15_minutes(anon, alex):
    fail(anon, 5)
    failures().update(locked_until=timezone.now() - timedelta(seconds=1))

    assert login(anon).status_code == 200


def test_failures_older_than_10_minutes_do_not_count(anon, alex):
    ended = timezone.now() - timedelta(minutes=1)
    LoginFailures.objects.create(
        email_digest=auth._digest(ALEX), count=4, window_ends=ended, expires_at=ended
    )

    assert fail(anon, 1) == [401]
    assert login(anon).status_code == 200


def test_a_success_clears_the_failures(anon, alex):
    fail(anon, 4)
    login(anon)

    assert fail(anon, 4) == [401] * 4
    assert login(anon).status_code == 200


def test_a_failure_racing_to_create_the_row_still_counts(anon, alex, monkeypatch):
    # A parallel failure inserted the row between our check and our insert.
    fail(anon, 1)
    monkeypatch.setattr(QuerySet, "exists", lambda self: False)

    assert fail(anon, 1) == [401]
    assert failures().get().count == 2


def test_a_row_expires_when_its_window_or_its_lock_ends(anon, alex):
    now = timezone.now()
    before = now.replace(microsecond=now.microsecond // 1000 * 1000)  # BSON keeps ms
    fail(anon, 1)
    row = failures().get()
    assert row.expires_at == row.window_ends
    assert timedelta(minutes=10) <= row.window_ends - before < timedelta(minutes=11)

    fail(anon, 4)

    row = failures().get()
    assert row.expires_at == row.locked_until
    assert timedelta(minutes=15) <= row.locked_until - before < timedelta(minutes=16)


def test_mongodb_deletes_rows_past_expires_at(db):
    indexes = connection.get_collection("login_failures").index_information()

    ttl = [i for i in indexes.values() if i["key"] == [("expires_at", 1)]]
    assert len(ttl) == 1 and ttl[0]["expireAfterSeconds"] == 0


def test_failed_logins_store_only_a_digest_of_the_email(anon, db):
    fail(anon, 1, "nobody@example.com")

    stored = LoginFailures.objects.get()
    assert stored.email_digest == auth._digest("nobody@example.com")
    assert "nobody" not in str(LoginFailures.objects.values().get())


# Rate limits (handoff 04 §5) -----------------------------------------------------


@pytest.mark.parametrize(
    ("throttle", "emails"),
    [
        (AuthIPThrottle, ["a@example.com", "b@example.com", "c@example.com"]),
        (AuthEmailThrottle, ["a@example.com", "A@example.com", "a@example.com"]),
    ],
)
def test_login_trips_the_rate_limit(anon, contract, monkeypatch, throttle, emails):
    monkeypatch.setattr(throttle, "THROTTLE_RATES", {throttle.scope: "2/min"})

    codes = [login(anon, email, "x").status_code for email in emails]

    assert codes == [401, 401, 429]
    response = login(anon, emails[0], "x")
    assert contract(response, "/auth/login")["error"] == {
        "code": "throttled",
        "message": "Too many attempts. Try again in 1 minute.",
    }
    assert response["Retry-After"]


def test_rotating_x_forwarded_for_does_not_reset_the_ip_limit(anon, monkeypatch):
    monkeypatch.setattr(AuthIPThrottle, "THROTTLE_RATES", {"auth_ip": "2/min"})

    codes = [
        anon.post(
            "/api/v1/auth/login",
            {"email": f"{n}@example.com", "password": "x"},
            HTTP_X_FORWARDED_FOR=f"203.0.113.{n}",
        ).status_code
        for n in range(3)
    ]

    assert codes == [401, 401, 429]


def test_register_is_rate_limited_too(anon, monkeypatch):
    monkeypatch.setattr(AuthIPThrottle, "THROTTLE_RATES", {"auth_ip": "1/min"})
    post(anon, "/auth/register", {"email": NEW, "password": PASSWORD})

    response = post(anon, "/auth/register", {"email": "other@example.com", "password": PASSWORD})

    assert response.status_code == 429


# Refresh and logout -------------------------------------------------------------


def test_refresh_rotates_the_pair_and_the_old_token_stops_working(anon, contract, alex):
    tokens = login(anon).json()

    fresh = contract(post(anon, "/auth/refresh", {"refresh": tokens["refresh"]}), "/auth/refresh")
    reused = post(anon, "/auth/refresh", {"refresh": tokens["refresh"]})

    assert signed_in(fresh).get("/api/v1/auth/me").status_code == 200
    assert fresh["refresh"] != tokens["refresh"]
    assert reused.status_code == 401
    assert post(anon, "/auth/refresh", {"refresh": fresh["refresh"]}).status_code == 200


def test_refresh_with_a_bad_token_is_401(anon, contract, db):
    response = post(anon, "/auth/refresh", {"refresh": "garbage"})

    assert response.status_code == 401
    assert contract(response, "/auth/refresh")["error"] == {
        "code": "token_invalid",
        "message": "Your session has expired. Log in again.",
    }


def test_refresh_for_a_user_who_is_gone_is_401(anon, alex):
    tokens = login(anon).json()
    alex.delete()

    assert post(anon, "/auth/refresh", {"refresh": tokens["refresh"]}).status_code == 401


def test_logout_revokes_this_devices_refresh_token(anon, contract, alex):
    phone, tablet = login(anon).json(), login(anon).json()

    response = post(anon, "/auth/logout", {"refresh": phone["refresh"]})

    assert response.status_code == 204
    contract(response, "/auth/logout")
    assert post(anon, "/auth/refresh", {"refresh": phone["refresh"]}).status_code == 401
    assert post(anon, "/auth/refresh", {"refresh": tablet["refresh"]}).status_code == 200
    assert RevokedRefreshToken.objects.filter(user=alex).count() == 2  # phone, and tablet's old


def test_logout_with_a_token_that_does_not_work_is_still_204(anon, alex):
    tokens = login(anon).json()
    post(anon, "/auth/logout", {"refresh": tokens["refresh"]})

    assert post(anon, "/auth/logout", {"refresh": tokens["refresh"]}).status_code == 204
    assert post(anon, "/auth/logout", {"refresh": "garbage"}).status_code == 204


# Password reset confirm ----------------------------------------------------------


@pytest.fixture
def reset_link(anon, alex):
    post(anon, "/auth/password-reset/request", {"email": ALEX})
    return link_token(mail.outbox[-1], "reset-password")


def test_password_reset_sets_the_password_and_ends_every_session(anon, contract, reset_link):
    before = login(anon).json()

    response = post(
        anon, "/auth/password-reset/confirm", {"token": reset_link, "password": "a-new-password"}
    )

    assert response.status_code == 204
    contract(response, "/auth/password-reset/confirm")
    assert signed_in(before).get("/api/v1/auth/me").status_code == 401
    assert post(anon, "/auth/refresh", {"refresh": before["refresh"]}).status_code == 401
    assert login(anon).status_code == 401
    after = login(anon, password="a-new-password").json()
    assert signed_in(after).get("/api/v1/auth/me").status_code == 200


def test_a_reset_link_works_once(anon, reset_link):
    post(anon, "/auth/password-reset/confirm", {"token": reset_link, "password": "a-new-password"})

    again = post(
        anon, "/auth/password-reset/confirm", {"token": reset_link, "password": "another-one"}
    )

    assert again.json()["error"] == {
        "code": "token_invalid",
        "message": "This link has already been used.",
    }


def test_a_reset_link_expires_after_an_hour(anon, reset_link):
    link = EmailLinkToken.objects.get(purpose=EmailLinkToken.Purpose.PASSWORD_RESET)
    assert timedelta(minutes=59) < link.expires_at - link.created_at <= timedelta(hours=1)
    EmailLinkToken.objects.update(expires_at=timezone.now() - timedelta(seconds=1))

    response = post(
        anon, "/auth/password-reset/confirm", {"token": reset_link, "password": "a-new-password"}
    )

    assert response.json()["error"]["code"] == "token_expired"


def test_a_verification_link_cannot_reset_a_password(anon, registered):
    response = post(
        anon, "/auth/password-reset/confirm", {"token": registered, "password": "a-new-password"}
    )

    assert response.json()["error"]["code"] == "token_invalid"


def test_password_reset_ends_a_lockout(anon, reset_link):
    fail(anon, 5)
    post(anon, "/auth/password-reset/confirm", {"token": reset_link, "password": "a-new-password"})

    assert login(anon, password="a-new-password").status_code == 200


def test_password_reset_confirm_applies_the_length_rule(anon, contract, db):
    response = post(anon, "/auth/password-reset/confirm", {"token": "abc", "password": "short"})

    assert contract(response, "/auth/password-reset/confirm")["error"]["fields"]["password"] == [
        PASSWORD_MESSAGE
    ]


# Signed in -----------------------------------------------------------------------


def test_auth_me_needs_a_token(anon, contract):
    response = anon.get("/api/v1/auth/me")

    assert response.status_code == 401
    assert contract(response, "/auth/me")["error"]["code"] == "not_authenticated"


def test_a_bad_token_is_token_invalid(anon):
    anon.credentials(HTTP_AUTHORIZATION="Bearer not.a.jwt")

    assert anon.get("/api/v1/auth/me").json()["error"]["code"] == "token_invalid"


def test_an_access_token_from_before_a_version_bump_is_rejected(anon, alex):
    tokens = login(anon).json()
    User.objects.filter(pk=alex.pk).update(token_version=alex.token_version + 1)

    error = signed_in(tokens).get("/api/v1/auth/me").json()["error"]

    assert error == {"code": "token_invalid", "message": "Your session has expired. Log in again."}


def test_two_refreshes_racing_on_one_token_give_one_pair(anon, alex, monkeypatch):
    """Both pass the revoked check; the unique jti lets only the first rotate."""
    refresh = login(anon).json()["refresh"]
    checked = tokens._current(refresh)
    tokens._revoke(*checked)  # the other request got there first
    monkeypatch.setattr(tokens, "_current", lambda token: checked)

    response = post(anon, "/auth/refresh", {"refresh": refresh})

    assert response.status_code == 401
