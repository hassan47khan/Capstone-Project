"""Contract tests for the AI-epic endpoints (handoff 04 §6a, 11 §2): extractions,
trials and Gmail. Shared plans are in test_shared_plans.py."""

from subscriptions.models import Subscription


def usd(amount):
    return {"amount": amount, "currency": "USD"}


# Trials -----------------------------------------------------------------------


def test_trials_with_server_computed_progress(api, contract):
    body = contract(api.get("/api/v1/trials"), "/trials")

    rows = [
        (t["name"], t["days_left"], t["elapsed_days"], t["progress"], t["urgency"], t["at_risk"])
        for t in body["results"]
    ]
    # 29/31, 21/30, 9/30 days elapsed: the frame's 93.6% / 70.4% / 30.2% fills (11 §2.5).
    assert rows == [
        ("Hulu", 2, 29, 0.9355, "soon", True),
        ("Notion AI", 9, 21, 0.7, "later", False),
        ("Duolingo Max", 21, 9, 0.3, "far", False),
    ]
    assert body["alert_days_before"] == 2
    assert body["at_risk"] == {"count": 1, "amount": usd("17.99")}
    hulu = body["results"][0]
    assert hulu["price"] == usd("17.99")
    assert hulu["trial_ends_on"] == "2026-10-03"
    assert hulu["reminder_on"] == "2026-10-01"
    assert hulu["billing_cycle"] == "monthly"


def test_keep_takes_a_trial_out_of_at_risk_and_is_remembered(api, alex, contract):
    # The mock used to answer without saving. Now the decision persists,
    # which is the point of it: "Keep it" has to stop the nagging (11 §2.5).
    hulu = Subscription.objects.get(owner=alex, name="Hulu")

    response = api.post(f"/api/v1/trials/{hulu.pk}/decision", {"decision": "keep"}, format="json")
    body = contract(response, "/trials/{subscription_id}/decision")

    assert body["decision"] == "keep"
    assert body["at_risk"] is False
    assert Subscription.objects.get(pk=hulu.pk).trial_decision == "keep"


def test_remind_turns_the_reminder_on(api, alex):
    notion = Subscription.objects.get(owner=alex, name="Notion AI")
    Subscription.objects.filter(pk=notion.pk).update(trial_reminder_enabled=False)

    body = api.post(
        f"/api/v1/trials/{notion.pk}/decision", {"decision": "remind"}, format="json"
    ).json()

    assert (body["decision"], body["reminder_enabled"]) == ("remind", True)


def test_decision_on_a_subscription_that_is_not_a_trial_is_404(api, alex, contract):
    netflix = Subscription.objects.get(owner=alex, name="Netflix")

    response = api.post(
        f"/api/v1/trials/{netflix.pk}/decision", {"decision": "keep"}, format="json"
    )

    assert contract(response, "/trials/{subscription_id}/decision")["error"]["code"] == "not_found"


def test_decision_must_be_known(api, alex, contract):
    hulu = Subscription.objects.get(owner=alex, name="Hulu")

    response = api.post(f"/api/v1/trials/{hulu.pk}/decision", {"decision": "maybe"}, format="json")

    assert contract(response, "/trials/{subscription_id}/decision")["error"]["fields"]["decision"]


# Extractions ------------------------------------------------------------------------


# The scan, the review queue, confirm and discard run for real against a fake
# Google and a fake model in extraction/tests/test_reviews.py. These two
# check what holds before any of that: the body is validated like create,
# and an id that is not the caller's is a 404.


def test_confirm_validates_like_create(api, contract):
    response = api.post(
        "/api/v1/extractions/6a0c00000000000000000001/confirm", {"name": "Figma"}, format="json"
    )

    assert (
        contract(response, "/extractions/{extraction_id}/confirm")["error"]["code"]
        == "price_invalid"
    )


def test_confirm_or_discard_an_unknown_extraction_is_404(api, contract):
    payload = {
        "name": "X",
        "billing_price": "1.00",
        "start_date": "2026-10-01",
        "category": "other",
    }
    confirm = api.post("/api/v1/extractions/nope/confirm", payload, format="json")
    discard = api.delete("/api/v1/extractions/nope")

    assert confirm.status_code == discard.status_code == 404
    contract(discard, "/extractions/{extraction_id}")


# Gmail --------------------------------------------------------------------------------


# Connecting for real, against a fake Google, is covered in
# extraction/tests/test_api.py. This one checks only the request validation,
# which runs before anything is sent to Google.


def test_connect_needs_a_code(api, contract):
    response = api.post("/api/v1/integrations/gmail/connect", {}, format="json")

    assert set(contract(response, "/integrations/gmail/connect")["error"]["fields"]) == {
        "code",
        "redirect_uri",
    }


def test_a_trial_decision_on_a_nonsense_id_is_not_found(api, alex):
    response = api.post("/api/v1/trials/not-an-objectid/decision", {"decision": "keep"})

    # 404 rather than 400, so a malformed id tells an attacker nothing more
    # than a well-formed one that is not theirs.
    assert response.status_code == 404
