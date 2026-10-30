"""A fake Google for the extraction tests. Nothing here reaches the network."""

import base64
import json
from datetime import UTC, datetime
from urllib.parse import parse_qs

import httpx
import pytest
from cryptography.fernet import Fernet

from extraction import evaluation, gmail, llm

REDIRECT_URI = "https://api.example.com/api/v1/integrations/gmail/callback"


class FakeGoogle:
    """Answers the OAuth and Gmail endpoints `extraction.gmail` calls.

    Each attribute is a knob a test turns to get the answer it needs, and
    `requests` records what was asked so a test can check what was sent.
    """

    def __init__(self):
        self.requests: list[httpx.Request] = []
        self.refuse_code = False
        self.scope = gmail.SCOPE
        self.refresh_token = "refresh-1"
        self.refresh_revoked = False
        self.profile_status = 200
        self.address = "alex.kim@gmail.example.com"
        self.revoked: list[str] = []
        # message id -> (sender, subject, text, received "YYYY-MM-DD")
        self.inbox: dict[str, tuple[str, str, str, str]] = {}
        self.search_status = 200

    def deliver(self, message_id, sender, subject, text, received="2026-10-01"):
        self.inbox[message_id] = (sender, subject, text, received)

    @property
    def transport(self) -> httpx.MockTransport:
        return httpx.MockTransport(self.handle)

    def form(self, index=-1) -> dict:
        return {k: v[0] for k, v in parse_qs(self.requests[index].content.decode()).items()}

    def handle(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        url = str(request.url)
        if url.startswith(gmail.TOKEN_URL):
            return self._token(request)
        if url.startswith(gmail.REVOKE_URL):
            self.revoked.append(request.url.params["token"])
            return httpx.Response(200)
        if url == f"{gmail.API_URL}/profile":
            if self.profile_status != 200:
                return httpx.Response(self.profile_status, json={})
            return httpx.Response(200, json={"emailAddress": self.address})
        if url.startswith(f"{gmail.API_URL}/messages/"):
            return self._message(url.rsplit("/", 1)[-1].split("?")[0])
        if url.startswith(f"{gmail.API_URL}/messages"):
            if self.search_status != 200:
                return httpx.Response(self.search_status, json={})
            return httpx.Response(200, json={"messages": [{"id": i} for i in self.inbox]})
        return httpx.Response(404, json={})

    def _message(self, message_id) -> httpx.Response:
        if message_id not in self.inbox:
            return httpx.Response(404, json={})
        sender, subject, text, received = self.inbox[message_id]
        day = datetime.fromisoformat(received).replace(hour=12, tzinfo=UTC)
        return httpx.Response(
            200,
            json={
                "id": message_id,
                "internalDate": str(int(day.timestamp() * 1000)),
                "payload": {
                    "mimeType": "text/plain",
                    "headers": [
                        {"name": "From", "value": sender},
                        {"name": "Subject", "value": subject},
                    ],
                    "body": {"data": base64.urlsafe_b64encode(text.encode()).decode().rstrip("=")},
                },
            },
        )

    def _token(self, request) -> httpx.Response:
        form = {k: v[0] for k, v in parse_qs(request.content.decode()).items()}
        if form["grant_type"] == "refresh_token":
            if self.refresh_revoked:
                return httpx.Response(400, json={"error": "invalid_grant"})
            return httpx.Response(200, json={"access_token": "access-fresh", "expires_in": 3599})
        if self.refuse_code:
            return httpx.Response(400, json={"error": "invalid_grant"})
        body = {"access_token": "access-1", "expires_in": 3599, "scope": self.scope}
        if self.refresh_token:
            body["refresh_token"] = self.refresh_token
        return httpx.Response(200, content=json.dumps(body))


@pytest.fixture
def gmail_settings(settings):
    settings.GOOGLE_OAUTH_CLIENT_ID = "client-id"
    settings.GOOGLE_OAUTH_CLIENT_SECRET = "client-secret"
    settings.GOOGLE_OAUTH_REDIRECT_URIS = [REDIRECT_URI]
    settings.GMAIL_TOKEN_ENCRYPTION_KEY = Fernet.generate_key().decode()
    return settings


@pytest.fixture
def google(gmail_settings, monkeypatch):
    """Routes every call `extraction.gmail` makes, even from a view, to a FakeGoogle."""
    fake = FakeGoogle()
    real = gmail.build_client

    def build_client(**kwargs):
        return real(**{**kwargs, "transport": kwargs.get("transport") or fake.transport})

    monkeypatch.setattr(gmail, "build_client", build_client)
    monkeypatch.setattr(gmail, "_guard", lambda transport: None)
    return fake


class FakeModel:
    """Stands in for `llm.read_email`, answering from the eval fixtures.

    An email the fixtures do not know gets `default`; set `error` to make
    every call fail the way the real client would.
    """

    def __init__(self):
        fixtures = evaluation.load()["emails"]
        self.answers = {c["text"]: c["model_output"] for c in fixtures if c["model_output"]}
        self.default = None
        self.error: Exception | None = None
        self.calls = 0

    def __call__(self, source, *, transport=None):
        self.calls += 1
        if self.error is not None:
            raise self.error
        data = self.answers.get(source.text, self.default)
        if data is None:
            raise llm.LLMUnusable("no answer for this email")
        return llm.Reply(data=data, model="claude-opus-5-5")


@pytest.fixture
def model(settings, monkeypatch):
    settings.LLM_API_KEY = "sk-test"
    settings.EXTRACTION_ENABLED = True
    fake = FakeModel()
    monkeypatch.setattr(llm, "read_email", fake)
    return fake


def fixture_email(case_id):
    """(sender, subject, text, received) of one eval fixture."""
    case = next(c for c in evaluation.load()["emails"] if c["id"] == case_id)
    return case["sender"], case["subject"], case["text"], case["received_on"]
