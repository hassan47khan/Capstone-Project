"""The 11 §3.6 smoke test, end to end through the API the app calls.

register → verify → add → correct total on Home → edit price → history event
appears → cancel → leaves the total.

Nothing here is seeded or forced: a brand-new account signs up, reads its
verification link out of the outbox, and from then on every request carries
the access token the API handed back, exactly as the app does. Home's figure is
`monthly_total` from /analytics/summary (06 §2.2), and every response is also
checked against schema.yml.
"""

import re

from django.core import mail
from rest_framework.test import APIClient

EMAIL = "smoke@example.com"
PASSWORD = "smoke-test-pass"


def usd(amount):
    return {"amount": amount, "currency": "USD"}


def verify_token():
    found = re.search(r"subtrak://verify-email\?token=([\w-]+)", mail.outbox[-1].body)
    assert found, mail.outbox[-1].body
    return found[1]


def home_total(client, contract):
    body = contract(client.get("/api/v1/analytics/summary"), "/analytics/summary")
    return body["monthly_total"], body["active_count"]


def test_register_verify_add_total_edit_history_cancel(db, categories, contract):
    anon = APIClient()

    # Register: an unverified account and an emailed link, no tokens yet.
    registered = anon.post("/api/v1/auth/register", {"email": EMAIL, "password": PASSWORD})
    assert contract(registered, "/auth/register") == {"email": EMAIL, "verification_sent": True}

    # Verify: the link's token signs the user in.
    verified = anon.post("/api/v1/auth/verify-email", {"token": verify_token()})
    tokens = contract(verified, "/auth/verify-email")
    app = APIClient()
    app.credentials(HTTP_AUTHORIZATION=f"Bearer {tokens['access']}")
    me = contract(app.get("/api/v1/me"), "/me")
    assert me["email"] == EMAIL and me["email_verified"] is True

    # A new account's Home has nothing to total.
    assert home_total(app, contract) == (usd("0.00"), 0)

    # Add two monthly subscriptions.
    def add(name, price, category):
        response = app.post(
            "/api/v1/subscriptions",
            {
                "name": name,
                "billing_price": price,
                "start_date": "2026-09-20",
                "category": category,
            },
            format="json",
        )
        assert response.status_code == 201, response.json()
        return contract(response, "/subscriptions")["id"]

    figma = add("Figma", "15.00", "productivity")
    add("Spotify", "11.99", "entertainment")

    # Home's total is the server's sum of the two.
    assert home_total(app, contract) == (usd("26.99"), 2)

    # Edit the price: the total follows, and a price_change event is written.
    edited = app.patch(f"/api/v1/subscriptions/{figma}", {"billing_price": "16.50"}, format="json")
    assert contract(edited, "/subscriptions/{subscription_id}")["billing_price"] == "16.50"
    assert home_total(app, contract) == (usd("28.49"), 2)

    newest = contract(
        app.get(f"/api/v1/subscriptions/{figma}/history"),
        "/subscriptions/{subscription_id}/history",
    )[0]
    assert newest["event_type"] == "price_change"
    assert newest["old_value"] == {"price": "15.00", "currency": "USD"}
    assert newest["new_value"] == {"price": "16.50", "currency": "USD"}

    # Cancel: it leaves the total, and only Spotify is left in it.
    cancelled = app.post(f"/api/v1/subscriptions/{figma}/cancel")
    body = contract(cancelled, "/subscriptions/{subscription_id}/cancel")
    assert body["status"] == "cancelled" and body["counts_toward_totals"] is False
    assert home_total(app, contract) == (usd("11.99"), 1)
