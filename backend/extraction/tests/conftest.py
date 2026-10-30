"""A fake Google for the extraction tests. Nothing here reaches the network."""

import json
from urllib.parse import parse_qs

import httpx
import pytest
from cryptography.fernet import Fernet

from extraction import gmail

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
        return httpx.Response(404, json={})

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
