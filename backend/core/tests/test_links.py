"""The HTTPS link bridge (phase 1) and the URLs that go into emails.

The bridge carries a single-use token in its query string, so most of what
is asserted here is what it must *not* do: validate the token, log it, cache
it, leak it through a Referer header, or let a crafted query string smuggle
anything extra into the deep link.
"""

import logging
from pathlib import Path

import pytest
from django.core import mail

from accounts import auth
from accounts.auth import LINK_PATHS
from accounts.models import EmailLinkToken
from core.links import HANDOFFS, app_link

Purpose = EmailLinkToken.Purpose

TOKEN = "tok-abc123_-"
BRIDGE = "https://api.test"
TEMPLATES = Path(__file__).resolve().parents[1] / "templates" / "core"


@pytest.fixture
def public(settings):
    settings.PUBLIC_BASE_URL = BRIDGE
    return settings


# Which URL goes into an email ------------------------------------------------


def test_an_email_links_straight_into_the_app_when_there_is_no_public_url(settings):
    settings.PUBLIC_BASE_URL = ""

    assert app_link("verify-email", token=TOKEN) == f"subtrak://verify-email?token={TOKEN}"


def test_an_email_links_at_the_bridge_once_a_public_url_is_configured(public):
    assert app_link("reset-password", token=TOKEN) == f"{BRIDGE}/links/reset-password?token={TOKEN}"


def test_every_purpose_the_auth_flow_mails_has_a_handoff():
    # LINK_PATHS and HANDOFFS are two tables that have to agree; if a purpose
    # is added to one and not the other, _send_link raises at send time.
    assert set(LINK_PATHS.values()) <= set(HANDOFFS)


@pytest.mark.django_db
def test_a_verification_email_carries_the_bridge_url(public):
    auth.register("bridge@example.com", "longenough")

    assert f"{BRIDGE}/links/verify-email?token=" in mail.outbox[-1].body
    assert "subtrak://" not in mail.outbox[-1].body


@pytest.mark.django_db
def test_a_password_reset_email_carries_the_bridge_url(alex, public):
    auth.request_password_reset(alex.email)

    assert f"{BRIDGE}/links/reset-password?token=" in mail.outbox[-1].body


# The bridge page --------------------------------------------------------------


def test_the_page_offers_the_deep_link_with_the_token(client):
    page = client.get("/links/verify-email", {"token": TOKEN})

    assert page.status_code == 200
    assert f'href="subtrak://verify-email?token={TOKEN}"' in page.text


def test_an_unknown_link_kind_is_not_served(client):
    assert client.get("/links/transfer-funds", {"token": TOKEN}).status_code == 404


def test_only_the_parameters_a_kind_declares_reach_the_app(client):
    page = client.get("/links/verify-email", {"token": TOKEN, "next": "https://evil.test"})

    assert f'href="subtrak://verify-email?token={TOKEN}"' in page.text
    assert "evil.test" not in page.text


def test_a_link_with_no_token_still_renders_rather_than_validating(client):
    page = client.get("/links/reset-password")

    assert page.status_code == 200
    assert 'href="subtrak://reset-password"' in page.text


def test_the_page_is_never_cached_and_sends_no_referrer(client):
    page = client.get("/links/verify-email", {"token": TOKEN})

    assert page["Cache-Control"] == "no-store"
    assert page["Referrer-Policy"] == "no-referrer"


@pytest.mark.parametrize(
    "hostile",
    [
        '"><script>alert(1)</script>',
        "' onmouseover='alert(1)",
        "javascript:alert(1)",
    ],
)
def test_a_hostile_token_cannot_break_out_of_the_page(client, hostile):
    page = client.get("/links/verify-email", {"token": hostile})

    assert page.status_code == 200
    assert "<script>alert(1)</script>" not in page.text
    assert "onmouseover=" not in page.text
    # Whatever was sent is percent-encoded inside the one href, never raw.
    assert "javascript:alert(1)" not in page.text


def test_the_token_is_never_written_into_the_page_script():
    # The script reads the URL back out of the DOM. If someone ever
    # interpolates it instead, escaping becomes a JavaScript problem.
    template = (TEMPLATES / "app_handoff.html").read_text(encoding="utf-8")
    script = template.split("<script>")[1]

    assert "{{" not in script


@pytest.mark.django_db
def test_the_bridge_does_not_look_the_token_up(client):
    # A token that was never issued still renders: redeeming it is the API's
    # job, and a bridge that answered differently would say which tokens exist.
    page = client.get("/links/verify-email", {"token": "never-issued"})

    assert page.status_code == 200
    assert EmailLinkToken.objects.count() == 0


def test_the_bridge_logs_nothing_containing_the_token(client, caplog):
    with caplog.at_level(logging.DEBUG):
        client.get("/links/verify-email", {"token": TOKEN})

    assert not [r for r in caplog.records if TOKEN in r.getMessage()]


def test_the_bridge_stays_out_of_the_api_contract(openapi):
    assert not [path for path in openapi["paths"] if "links" in path]
