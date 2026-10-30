"""The Gmail and Google OAuth client, mapped against Google's documented shapes.

Every call is answered by `httpx.MockTransport`; nothing leaves the machine.
"""

import base64

import httpx
import pytest

from extraction import gmail

from .conftest import REDIRECT_URI, FakeGoogle


@pytest.fixture
def fake(gmail_settings):
    return FakeGoogle()


def b64url(text: str) -> str:
    # Gmail's encoding, with the padding stripped the way Gmail strips it.
    return base64.urlsafe_b64encode(text.encode()).decode().rstrip("=")


# The code exchange ------------------------------------------------------------------


def test_a_code_is_exchanged_with_its_pkce_verifier(fake):
    tokens = gmail.exchange_code("code-1", REDIRECT_URI, "verifier-1", transport=fake.transport)

    sent = fake.form()
    assert sent["grant_type"] == "authorization_code"
    assert sent["code_verifier"] == "verifier-1"
    assert sent["redirect_uri"] == REDIRECT_URI
    assert tokens.refresh_token == "refresh-1"


def test_an_unregistered_redirect_uri_is_refused_before_google_is_asked(fake):
    with pytest.raises(gmail.GmailDenied):
        gmail.exchange_code("code-1", "https://evil.example.com/cb", transport=fake.transport)

    assert fake.requests == []


def test_a_consent_with_gmail_unticked_is_not_a_connection(fake):
    # Google's consent screen lets a user untick one scope and keep the rest.
    fake.scope = "openid email"

    with pytest.raises(gmail.GmailDenied):
        gmail.exchange_code("code-1", REDIRECT_URI, transport=fake.transport)


def test_a_consent_without_offline_access_is_refused(fake):
    # No refresh token means the first scan would also be the last.
    fake.refresh_token = None

    with pytest.raises(gmail.GmailDenied):
        gmail.exchange_code("code-1", REDIRECT_URI, transport=fake.transport)


def test_a_code_google_refuses_is_denied(fake):
    fake.refuse_code = True

    with pytest.raises(gmail.GmailDenied):
        gmail.exchange_code("code-1", REDIRECT_URI, transport=fake.transport)


def test_a_timed_out_exchange_is_denied_and_never_retried(gmail_settings):
    calls = []

    def handle(request):
        calls.append(request)
        raise httpx.ConnectTimeout("slow")

    with pytest.raises(gmail.GmailDenied):
        gmail.exchange_code("code-1", REDIRECT_URI, transport=httpx.MockTransport(handle))

    # A code is single-use: a retry after a timeout that had in fact gone
    # through would only come back invalid_grant.
    assert len(calls) == 1


# Refresh and revoke -------------------------------------------------------------------


def test_a_refresh_token_gets_a_fresh_access_token(fake):
    assert gmail.refresh_access_token("refresh-1", transport=fake.transport) == "access-fresh"
    assert fake.form()["grant_type"] == "refresh_token"


def test_a_refresh_token_google_refuses_is_reported_as_revoked(fake):
    fake.refresh_revoked = True

    with pytest.raises(gmail.GmailRevoked):
        gmail.refresh_access_token("refresh-1", transport=fake.transport)


def test_a_refresh_survives_one_dropped_connection(gmail_settings, monkeypatch):
    monkeypatch.setattr("core.http.time.sleep", lambda seconds: None)
    attempts = []

    def handle(request):
        attempts.append(request)
        if len(attempts) == 1:
            raise httpx.ConnectError("dropped")
        return httpx.Response(200, json={"access_token": "access-fresh"})

    token = gmail.refresh_access_token("refresh-1", transport=httpx.MockTransport(handle))

    assert token == "access-fresh"
    assert len(attempts) == 2


def test_revoking_reports_whether_google_confirmed(fake):
    assert gmail.revoke("refresh-1", transport=fake.transport) is True
    assert fake.revoked == ["refresh-1"]


def test_revoking_while_google_is_unreachable_is_not_an_error(gmail_settings):
    def handle(request):
        raise httpx.ConnectError("down")

    assert gmail.revoke("refresh-1", transport=httpx.MockTransport(handle)) is False


# Reading the mailbox -----------------------------------------------------------------------


def test_the_profile_gives_the_connected_address(fake):
    assert gmail.profile_email("access-1", transport=fake.transport) == fake.address
    assert fake.requests[0].headers["Authorization"] == "Bearer access-1"


def test_the_search_asks_only_for_receipts_trials_and_renewals(gmail_settings):
    seen = []

    def handle(request):
        seen.append(request)
        return httpx.Response(200, json={"messages": [{"id": "m1"}, {"id": "m2"}]})

    ids = gmail.search("access-1", transport=httpx.MockTransport(handle))

    assert ids == ["m1", "m2"]
    assert seen[0].url.params["q"] == gmail.SEARCH_QUERY
    assert seen[0].url.params["maxResults"] == str(gmail.MAX_MESSAGES)


def test_an_empty_search_is_an_empty_list(gmail_settings):
    transport = httpx.MockTransport(lambda request: httpx.Response(200, json={}))

    assert gmail.search("access-1", transport=transport) == []


def test_a_message_is_fetched_whole_and_parsed(gmail_settings):
    message = {
        "id": "m1",
        "payload": {
            "mimeType": "text/plain",
            "headers": [{"name": "Subject", "value": "Your receipt"}],
            "body": {"data": b64url("Thanks for paying.")},
        },
    }
    seen = []

    def handle(request):
        seen.append(request)
        return httpx.Response(200, json=message)

    email = gmail.fetch("access-1", "m1", transport=httpx.MockTransport(handle))

    assert seen[0].url.params["format"] == "full"
    assert email.text == "Thanks for paying."


def test_no_test_can_reach_google_by_accident(gmail_settings):
    with pytest.raises(RuntimeError, match="transport"):
        gmail.profile_email("access-1")


def test_every_call_gives_up_after_the_ten_seconds_section_12_allows():
    assert gmail.TIMEOUT_SECONDS == 10


# Parsing -------------------------------------------------------------------------------------


def multipart(*parts, headers=None):
    return {
        "id": "m1",
        "payload": {"mimeType": "multipart/alternative", "headers": headers or [], "parts": parts},
    }


def part(kind, text):
    return {"mimeType": kind, "body": {"data": b64url(text)}}


def test_plain_text_is_preferred_over_html():
    email = gmail.parse_message(
        multipart(part("text/plain", "Plain copy."), part("text/html", "<p>HTML copy.</p>"))
    )

    assert email.text == "Plain copy."


def test_an_html_only_email_is_read_without_its_tags_scripts_or_styles():
    html = (
        "<html><head><title>t</title><style>p{}</style></head><body>"
        "<script>track()</script><p>Your trial ends</p><p>on Oct&nbsp;19, 2026.</p>"
        "</body></html>"
    )

    email = gmail.parse_message(multipart(part("text/html", html)))

    assert email.text == "Your trial ends on Oct 19, 2026."


def test_nested_parts_are_found():
    inner = {"mimeType": "multipart/alternative", "parts": [part("text/plain", "Deep.")]}

    assert gmail.parse_message(multipart(inner)).text == "Deep."


def test_sender_and_subject_come_from_the_headers():
    headers = [
        {"name": "From", "value": "Hulu <hulu@hulumail.com>"},
        {"name": "Subject", "value": "Your Hulu free trial"},
    ]

    email = gmail.parse_message(multipart(part("text/plain", "x"), headers=headers))

    assert email.sender == "Hulu <hulu@hulumail.com>"
    assert email.subject == "Your Hulu free trial"


def test_a_bare_sender_address_is_kept_as_is():
    headers = [{"name": "From", "value": "billing@figma.com"}]

    assert gmail.parse_message(multipart(headers=headers)).sender == "billing@figma.com"


def test_a_message_with_no_body_is_empty_text_not_an_error():
    assert gmail.parse_message({"id": "m1"}).text == ""


def test_the_received_date_comes_from_gmails_internal_date():
    # 2026-10-01T12:00:00Z. "Ends in 18 days" is counted from this.
    message = {**multipart(part("text/plain", "x")), "internalDate": "1790856000000"}

    assert str(gmail.parse_message(message).received_on) == "2026-10-01"


def test_no_internal_date_means_no_received_date():
    assert gmail.parse_message(multipart(part("text/plain", "x"))).received_on is None
