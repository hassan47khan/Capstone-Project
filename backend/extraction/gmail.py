"""The Gmail and Google OAuth client (spec section 7, handoff 11 §2.1).

Checked against Google's current references rather than memory:

* the code exchange and refresh are `POST https://oauth2.googleapis.com/token`
  (form-encoded, `code_verifier` for PKCE), and revoking is
  `POST https://oauth2.googleapis.com/revoke?token=...`;
* `users.messages.list` takes Gmail's own search syntax in `q`, which is
  unavailable under the narrower metadata scope -- so `gmail.readonly` is the
  smallest scope that can run a search at all;
* `users.getProfile` is allowed under `gmail.readonly`, so the connected
  address the contract shows costs no extra permission;
* message bodies come back base64url-encoded.

Every call has spec section 12's 10-second budget and goes through
`core.http.build_client`, whose `transport` is the test seam. Like
`subscriptions.fx`, a call without a transport refuses to run under pytest.
"""

import base64
import os
from dataclasses import dataclass
from datetime import UTC, date, datetime
from email.utils import parseaddr
from html import unescape
from html.parser import HTMLParser

import httpx
from django.conf import settings

from core.http import build_client, call_with_retries

SCOPE = "https://www.googleapis.com/auth/gmail.readonly"
TOKEN_URL = "https://oauth2.googleapis.com/token"
REVOKE_URL = "https://oauth2.googleapis.com/revoke"
API_URL = "https://gmail.googleapis.com/gmail/v1/users/me"

TIMEOUT_SECONDS = 10

# Narrow on purpose (11 §2.1): receipts, trials and renewals from the last
# quarter, never the whole inbox. Promotions are left out because that is
# where "start your free trial" adverts live, and those are not subscriptions.
SEARCH_QUERY = (
    "newer_than:90d -category:promotions "
    "(subject:(receipt OR invoice OR subscription OR renewal OR renews "
    'OR "free trial" OR "trial ends" OR "your plan" OR "payment confirmation"))'
)
MAX_MESSAGES = 25


class GmailError(Exception):
    """Google answered, but not with what was needed."""


class GmailDenied(GmailError):
    """The code exchange failed, or the user did not grant Gmail access.

    The contract's 400 `gmail_denied`: "Access was denied or timed out."
    """


class GmailRevoked(GmailError):
    """The stored refresh token no longer works. Settings shows Reconnect."""


@dataclass(frozen=True)
class Tokens:
    access_token: str
    refresh_token: str
    scope: str


@dataclass(frozen=True)
class Email:
    """What the pipeline needs from one message. Held in memory only."""

    message_id: str
    sender: str
    subject: str
    text: str
    # "Ends in 18 days" counts from here.
    received_on: date | None = None


def _guard(transport: httpx.BaseTransport | None) -> None:
    if transport is None and os.environ.get("PYTEST_CURRENT_TEST"):
        raise RuntimeError("This would call Google for real. Tests must pass a transport.")


def _client(transport, access_token: str | None = None) -> httpx.Client:
    _guard(transport)
    headers = {"Authorization": f"Bearer {access_token}"} if access_token else None
    return build_client(timeout=TIMEOUT_SECONDS, headers=headers, transport=transport)


def _read(operation):
    """Reads are safe to repeat, so one retry on a dropped connection."""
    return call_with_retries(operation, retries=1, base_delay=0.5)


# OAuth ---------------------------------------------------------------------------


def exchange_code(
    code: str,
    redirect_uri: str,
    code_verifier: str | None = None,
    *,
    transport: httpx.BaseTransport | None = None,
) -> Tokens:
    """Trade the consent screen's code for tokens.

    Never retried: a code is single-use, so a retry after a timeout that had
    in fact succeeded would only come back `invalid_grant`.
    """
    if redirect_uri not in settings.GOOGLE_OAUTH_REDIRECT_URIS:
        # Exact match against the allowlist, so nobody can talk this backend
        # into redeeming a code against a URL the team never registered.
        raise GmailDenied("redirect_uri is not registered")
    form = {
        "client_id": settings.GOOGLE_OAUTH_CLIENT_ID,
        "client_secret": settings.GOOGLE_OAUTH_CLIENT_SECRET,
        "code": code,
        "grant_type": "authorization_code",
        "redirect_uri": redirect_uri,
    }
    if code_verifier:
        form["code_verifier"] = code_verifier
    try:
        with _client(transport) as client:
            response = client.post(TOKEN_URL, data=form)
    except httpx.TransportError as error:
        raise GmailDenied("timed out") from error
    if response.status_code != 200:
        raise GmailDenied(f"token endpoint answered {response.status_code}")
    body = response.json()
    scope = body.get("scope", "")
    # Google's consent screen lets a user untick a scope. Connected without
    # Gmail is not connected.
    if SCOPE not in scope.split():
        raise GmailDenied("Gmail access was not granted")
    # Only sent when the consent asked for offline access. Without it a scan
    # could run once and never again.
    if not body.get("refresh_token"):
        raise GmailDenied("no refresh token; request access_type=offline and prompt=consent")
    return Tokens(body["access_token"], body["refresh_token"], scope)


def refresh_access_token(
    refresh_token: str, *, transport: httpx.BaseTransport | None = None
) -> str:
    """A fresh hour-long access token, or GmailRevoked if Google says no."""
    form = {
        "client_id": settings.GOOGLE_OAUTH_CLIENT_ID,
        "client_secret": settings.GOOGLE_OAUTH_CLIENT_SECRET,
        "grant_type": "refresh_token",
        "refresh_token": refresh_token,
    }

    def post():
        with _client(transport) as client:
            return client.post(TOKEN_URL, data=form)

    response = _read(post)
    if response.status_code == 400 and response.json().get("error") == "invalid_grant":
        raise GmailRevoked("refresh token revoked or expired")
    response.raise_for_status()
    return response.json()["access_token"]


def revoke(token: str, *, transport: httpx.BaseTransport | None = None) -> bool:
    """Ask Google to forget the grant. True if Google confirmed it.

    Best effort: disconnect deletes our copy either way, and a token Google
    already considers dead answers 400, which is the outcome we wanted.
    """
    try:
        with _client(transport) as client:
            response = client.post(REVOKE_URL, params={"token": token})
    except httpx.TransportError:
        return False
    return response.status_code == 200


# Gmail ---------------------------------------------------------------------------


def profile_email(access_token: str, *, transport: httpx.BaseTransport | None = None) -> str:
    def get():
        with _client(transport, access_token) as client:
            response = client.get(f"{API_URL}/profile")
            response.raise_for_status()
            return response.json()["emailAddress"]

    return _read(get)


def search(
    access_token: str,
    *,
    query: str = SEARCH_QUERY,
    limit: int = MAX_MESSAGES,
    transport: httpx.BaseTransport | None = None,
) -> list[str]:
    """Message ids matching `query`, newest first, at most `limit`."""

    def get():
        with _client(transport, access_token) as client:
            response = client.get(f"{API_URL}/messages", params={"q": query, "maxResults": limit})
            response.raise_for_status()
            return [row["id"] for row in response.json().get("messages") or []]

    return _read(get)


def fetch(
    access_token: str, message_id: str, *, transport: httpx.BaseTransport | None = None
) -> Email:
    def get():
        with _client(transport, access_token) as client:
            response = client.get(f"{API_URL}/messages/{message_id}", params={"format": "full"})
            response.raise_for_status()
            return response.json()

    return parse_message(_read(get))


# Parsing ---------------------------------------------------------------------------


def _decode(data: str) -> str:
    # base64url, and Gmail drops the padding.
    raw = base64.urlsafe_b64decode(data + "=" * (-len(data) % 4))
    return raw.decode("utf-8", errors="replace")


class _TextOnly(HTMLParser):
    """The visible text of an HTML body: no tags, scripts or styles."""

    _SKIP = frozenset({"script", "style", "head", "title"})
    _BREAKS = frozenset({"br", "p", "div", "tr", "td", "li", "h1", "h2", "h3"})

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self._skipping = 0

    def handle_starttag(self, tag, attrs):
        if tag in self._SKIP:
            self._skipping += 1
        elif tag in self._BREAKS:
            self.parts.append(" ")

    def handle_endtag(self, tag):
        if tag in self._SKIP and self._skipping:
            self._skipping -= 1

    def handle_data(self, data):
        if not self._skipping:
            self.parts.append(data)


def html_to_text(html: str) -> str:
    parser = _TextOnly()
    parser.feed(html)
    return unescape("".join(parser.parts))


def _bodies(part: dict, kind: str) -> list[str]:
    """Every body of MIME type `kind` in the part tree, in document order."""
    found = []
    if part.get("mimeType") == kind and (part.get("body") or {}).get("data"):
        found.append(_decode(part["body"]["data"]))
    for child in part.get("parts") or []:
        found.extend(_bodies(child, kind))
    return found


def parse_message(message: dict) -> Email:
    """A Gmail `format=full` message as plain text. Plain beats HTML when both exist."""
    payload = message.get("payload") or {}
    headers = {h["name"].lower(): h["value"] for h in payload.get("headers") or []}
    plain = _bodies(payload, "text/plain")
    text = "\n".join(plain) if plain else html_to_text("\n".join(_bodies(payload, "text/html")))
    name, address = parseaddr(headers.get("from", ""))
    sender = f"{name} <{address}>" if name and address else (address or name)
    # internalDate is when Google accepted the message, in epoch milliseconds.
    millis = message.get("internalDate")
    received = datetime.fromtimestamp(int(millis) / 1000, tz=UTC).date() if millis else None
    return Email(
        message_id=message["id"],
        sender=sender,
        subject=headers.get("subject", ""),
        text=" ".join(text.split()),
        received_on=received,
    )
