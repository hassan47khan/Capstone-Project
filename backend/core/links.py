"""The HTTPS bridge between a link someone taps and the app.

Why it exists: a verification link has to survive a mail client, and many of
them will not open a `subtrak://` URL -- some strip it, some render it as
plain text, some route it through a scanner first. So when this backend has
a public HTTPS origin the email points here, and this page hands off to the
app. With no public origin configured, which is local development, links
stay as they were and nothing changes.

What this page is not allowed to do. It never validates a token, never looks
one up and never logs one: it is a redirector, and the endpoint that redeems
the token is the one that decides whether it is good. It answers only for
the kinds in `HANDOFFS` and forwards only the parameters each kind declares,
so a crafted query string cannot smuggle anything into the deep link. It is
served `no-store` with no referrer, so a single-use token does not end up in
a cache, a shared history entry or the next site's `Referer` header.

Phase 5's Gmail OAuth callback is another row in the same table.
"""

from dataclasses import dataclass
from urllib.parse import urlencode

from django.conf import settings
from django.http import Http404, HttpResponse
from django.shortcuts import render


@dataclass(frozen=True)
class Handoff:
    """One kind of link: where it sends the app, and what it may carry."""

    app_path: str
    # Forwarded in this order; anything else in the query string is dropped.
    params: tuple[str, ...]
    title: str
    message: str


HANDOFFS = {
    "verify-email": Handoff(
        app_path="verify-email",
        params=("token",),
        title="Confirm your email",
        message="Open SubTrak to finish confirming your email address.",
    ),
    "reset-password": Handoff(
        app_path="reset-password",
        params=("token",),
        title="Reset your password",
        message="Open SubTrak to choose a new password.",
    ),
}


def deep_link(kind: str, params) -> str:
    """The `subtrak://` URL for `kind`, carrying only the params it declares."""
    handoff = HANDOFFS[kind]
    query = urlencode([(name, params[name]) for name in handoff.params if name in params])
    url = f"{settings.APP_LINK_PREFIX}{handoff.app_path}"
    return f"{url}?{query}" if query else url


def app_link(kind: str, **params: str) -> str:
    """The URL to put in an email.

    The bridge page when this backend has a public HTTPS origin, the deep
    link itself when it does not.
    """
    if not settings.PUBLIC_BASE_URL:
        return deep_link(kind, params)
    handoff = HANDOFFS[kind]
    query = urlencode([(name, params[name]) for name in handoff.params if name in params])
    url = f"{settings.PUBLIC_BASE_URL}/links/{kind}"
    return f"{url}?{query}" if query else url


def handoff_page(request, kind: str) -> HttpResponse:
    """Public page that hands a tapped link off to the app.

    Unknown kinds are 404. The token is passed straight through, unread.
    """
    if kind not in HANDOFFS:
        raise Http404("Unknown link")
    response = render(
        request,
        "core/app_handoff.html",
        {"handoff": HANDOFFS[kind], "app_url": deep_link(kind, request.GET)},
    )
    # The URL in the address bar carries a single-use token.
    response["Cache-Control"] = "no-store"
    response["Referrer-Policy"] = "no-referrer"
    return response
