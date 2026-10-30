"""Connecting and disconnecting Gmail through the API (04 §6a, 11 §2.1, §2.9).

The two endpoints keep the shapes `mocks.py` froze; what is new is that a
real grant is redeemed, stored encrypted, and revoked again on disconnect.
"""

from datetime import timedelta

import pytest
from django.core.exceptions import ImproperlyConfigured
from django.db import connection as mongo
from django.utils import timezone
from rest_framework.test import APIClient

from core.contract import ApiError
from extraction import crypto, service
from extraction.models import GmailConnection, PendingExtraction

from .conftest import REDIRECT_URI

CONNECT = "/api/v1/integrations/gmail/connect"
DISCONNECT = "/api/v1/integrations/gmail"
CALLBACK = "/api/v1/integrations/gmail/callback"


def connect(api, **extra):
    body = {"code": "code-1", "redirect_uri": REDIRECT_URI, "code_verifier": "v", **extra}
    return api.post(CONNECT, body, format="json")


@pytest.fixture
def other(db, django_user_model):
    return django_user_model.objects.create_user(email="jordan@example.com", password="longenough")


def pending_for(user, message_hash="h1"):
    return PendingExtraction.objects.create(
        owner=user,
        sender="Hulu <hulu@hulumail.com>",
        subject="Your Hulu free trial",
        snippet="Your free trial ends on Oct 19, 2026.",
        fields={},
        confidence={},
        message_hash=message_hash,
        expires_at=timezone.now() + timedelta(hours=24),
    )


# Connect -------------------------------------------------------------------------------


@pytest.mark.django_db
def test_connecting_returns_the_gmail_address_in_the_contract_shape(api, google, contract):
    body = contract(connect(api), "/integrations/gmail/connect")

    assert body["provider"] == "gmail"
    # The Gmail address, which can differ from the SubTrak login.
    assert body["email"] == google.address


@pytest.mark.django_db
def test_only_the_refresh_token_is_kept_and_only_encrypted(api, alex, google):
    connect(api)

    row = GmailConnection.objects.get(user=alex)
    stored = " ".join(str(value) for value in row.__dict__.values())
    assert "refresh-1" not in stored
    # Access tokens last an hour and are fetched per scan, never stored.
    assert "access-1" not in stored
    assert crypto.decrypt(row.refresh_token_encrypted) == "refresh-1"


@pytest.mark.django_db
def test_a_refused_consent_is_gmail_denied(api, google, contract):
    google.refuse_code = True

    response = connect(api)

    assert response.status_code == 400
    error = contract(response, "/integrations/gmail/connect")["error"]
    assert error["code"] == "gmail_denied"
    assert error["message"] == "Access was denied or timed out."


@pytest.mark.django_db
def test_an_unregistered_redirect_uri_is_gmail_denied(api, google):
    response = connect(api, redirect_uri="https://evil.example.com/cb")

    assert response.json()["error"]["code"] == "gmail_denied"
    assert google.requests == []


@pytest.mark.django_db
def test_a_grant_that_cannot_read_the_profile_is_handed_back(api, alex, google):
    google.profile_status = 503

    response = connect(api)

    assert response.status_code == 400
    # We held a grant we could not use, so Google is told to forget it.
    assert google.revoked == ["refresh-1"]
    assert not GmailConnection.objects.filter(user=alex).exists()


@pytest.mark.django_db
def test_reconnecting_keeps_one_row_and_revokes_the_old_token(api, alex, google):
    connect(api)
    google.refresh_token = "refresh-2"

    connect(api)

    assert GmailConnection.objects.filter(user=alex).count() == 1
    assert crypto.decrypt(GmailConnection.objects.get(user=alex).refresh_token_encrypted) == (
        "refresh-2"
    )
    assert google.revoked == ["refresh-1"]


@pytest.mark.django_db
def test_an_unconfigured_server_fails_before_spending_the_code(alex, gmail_settings, google):
    gmail_settings.GMAIL_TOKEN_ENCRYPTION_KEY = None

    with pytest.raises(ImproperlyConfigured):
        service.connect(alex, "code-1", REDIRECT_URI)

    # The code is single-use; failing after redeeming it would waste it.
    assert google.requests == []


# Disconnect ---------------------------------------------------------------------------------


@pytest.mark.django_db
def test_disconnecting_revokes_at_google_and_forgets_the_token(api, alex, google, contract):
    connect(api)

    response = api.delete(DISCONNECT)

    assert response.status_code == 204
    contract(response, "/integrations/gmail")
    assert google.revoked == ["refresh-1"]
    assert not GmailConnection.objects.filter(user=alex).exists()


@pytest.mark.django_db
def test_disconnecting_purges_the_callers_pending_reviews_and_nobody_elses(
    api, alex, other, google
):
    connect(api)
    pending_for(alex)
    pending_for(other)

    api.delete(DISCONNECT)

    # 11 §2.9: "Disconnect ... revokes it and deletes pending extractions."
    assert not PendingExtraction.objects.filter(owner=alex).exists()
    assert PendingExtraction.objects.filter(owner=other).count() == 1


@pytest.mark.django_db
def test_disconnecting_without_a_connection_is_fine(api, google):
    assert api.delete(DISCONNECT).status_code == 204
    assert google.revoked == []


@pytest.mark.django_db
def test_a_token_unreadable_under_the_current_key_is_still_forgotten(api, alex, google):
    connect(api)
    GmailConnection.objects.filter(user=alex).update(refresh_token_encrypted="not-fernet")

    assert api.delete(DISCONNECT).status_code == 204
    assert not GmailConnection.objects.filter(user=alex).exists()


@pytest.mark.django_db
@pytest.mark.parametrize(("method", "path"), [("post", CONNECT), ("delete", DISCONNECT)])
def test_both_endpoints_need_a_token(db, method, path):
    assert getattr(APIClient(), method)(path).status_code == 401


# Access tokens for a scan ---------------------------------------------------------------------


@pytest.mark.django_db
def test_a_scan_gets_a_fresh_access_token(api, alex, google):
    connect(api)

    assert service.access_token_for(alex) == "access-fresh"


@pytest.mark.django_db
def test_no_connection_is_gmail_not_connected(alex, google):
    with pytest.raises(ApiError) as caught:
        service.access_token_for(alex)

    assert (caught.value.status_code, caught.value.code) == (409, "gmail_not_connected")


@pytest.mark.django_db
def test_a_grant_revoked_at_google_is_marked_for_reconnect(api, alex, google):
    connect(api)
    google.refresh_revoked = True

    with pytest.raises(ApiError) as caught:
        service.access_token_for(alex)

    assert caught.value.code == "gmail_not_connected"
    assert GmailConnection.objects.get(user=alex).revoked_at is not None
    # And the next scan does not ask Google again.
    asked = len(google.requests)
    with pytest.raises(ApiError):
        service.access_token_for(alex)
    assert len(google.requests) == asked


@pytest.mark.django_db
def test_reconnecting_clears_the_revoked_mark(api, alex, google):
    connect(api)
    GmailConnection.objects.filter(user=alex).update(revoked_at=timezone.now())

    connect(api)

    assert GmailConnection.objects.get(user=alex).revoked_at is None


# The OAuth callback bridge ---------------------------------------------------------------------


def test_the_callback_hands_the_code_and_state_to_the_app(client):
    response = client.get(CALLBACK, {"code": "4/abc", "state": "s1", "scope": "x", "evil": "1"})

    page = response.content.decode()
    assert response.status_code == 200
    assert "subtrak://gmail-callback?code=4%2Fabc&amp;state=s1" in page
    # Only the declared params travel; anything else is dropped.
    assert "evil" not in page
    assert "scope" not in page


def test_a_denied_consent_reaches_the_app_as_an_error(client):
    response = client.get(CALLBACK, {"error": "access_denied", "state": "s1"})

    assert "error=access_denied" in response.content.decode()


def test_the_callback_page_is_never_cached_or_referred(client):
    response = client.get(CALLBACK, {"code": "4/abc"})

    # The code is single-use and sits in the address bar.
    assert response["Cache-Control"] == "no-store"
    assert response["Referrer-Policy"] == "no-referrer"


def test_the_callback_stays_out_of_the_contract(openapi):
    assert not any(path.endswith("/gmail/callback") for path in openapi["paths"])


# Retention -----------------------------------------------------------------------------------


@pytest.mark.django_db
def test_pending_reviews_expire_by_themselves():
    # 11 §2.9: deleted on confirm, discard *or expiry*. The TTL index is what
    # makes "or expiry" true when nobody ever opens the review again.
    indexes = mongo.get_collection("pending_extractions").index_information()

    ttl = indexes["pending_extractions_expires_at_ttl"]
    assert ttl["key"] == [("expires_at", 1)]
    assert ttl["expireAfterSeconds"] == 0
