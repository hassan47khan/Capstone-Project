"""Contract tests for the AI-epic endpoints (handoff 04 §6a, 11 §2): extractions,
trials, shared plans and Gmail."""

import pytest

import mocks
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


# Shared plans --------------------------------------------------------------------


def test_shared_plans_split_netflix_three_ways_to_the_cent(api, contract):
    body = contract(api.get("/api/v1/shared-plans"), "/shared-plans")

    (plan,) = body["results"]
    assert plan["price"] == usd("15.49")
    assert plan["split_mode"] == "equal"
    assert plan["period"] == "2026-10"
    assert (plan["participant_count"], plan["paid_count"]) == (3, 2)
    assert [
        (p["display_name"], p["share"]["amount"], p["status"]) for p in plan["participants"]
    ] == [
        ("Alex Kim", "5.17", "paid"),
        ("Jordan Doe", "5.16", "paid"),
        ("Sam", "5.16", "pending"),
    ]
    assert plan["your_share"] == usd("5.17")
    assert plan["participants"][0]["is_owner"] is True
    # Sam still owes Alex for Netflix (11 §2.6).
    assert body["outstanding"] == usd("5.16")


def test_shared_plans_do_not_change_the_totals(api):
    api.get("/api/v1/shared-plans")

    assert api.get("/api/v1/analytics/summary").json()["monthly_total"] == usd("129.20")


def test_create_a_shared_plan(api, alex, contract):
    spotify = Subscription.objects.get(owner=alex, name="Spotify")

    response = api.post(
        "/api/v1/shared-plans",
        {"subscription_id": str(spotify.pk), "participants": [{"display_name": "Jordan"}]},
        format="json",
    )
    body = contract(response, "/shared-plans")

    assert response.status_code == 201
    assert [p["share"]["amount"] for p in body["participants"]] == ["5.50", "5.49"]
    assert [p["status"] for p in body["participants"]] == ["paid", "pending"]
    assert body["participants"][1]["email"] is None


@pytest.mark.parametrize(
    ("payload", "status", "code"),
    [
        (
            {"subscription_id": "netflix", "participants": [{"display_name": "Jo"}]},
            404,
            "not_found",
        ),
        ({"subscription_id": "x", "participants": []}, 400, "validation_error"),
    ],
)
def test_create_shared_plan_errors(api, contract, payload, status, code):
    response = api.post("/api/v1/shared-plans", payload, format="json")

    assert response.status_code == status
    assert contract(response, "/shared-plans")["error"]["code"] == code


def test_a_subscription_is_shared_once(api, alex, contract):
    netflix = Subscription.objects.get(owner=alex, name="Netflix")

    response = api.post(
        "/api/v1/shared-plans",
        {"subscription_id": str(netflix.pk), "participants": [{"display_name": "Jo"}]},
        format="json",
    )

    assert contract(response, "/shared-plans")["error"]["code"] == "already_shared"


REMIND = "/shared-plans/{plan_id}/payments/{payment_id}/remind"


def test_remind_sam_opens_the_share_sheet(api, contract):
    plan = api.get("/api/v1/shared-plans").json()["results"][0]
    sam = plan["participants"][2]

    response = api.post(f"/api/v1/shared-plans/{plan['id']}/payments/{sam['payment_id']}/remind")
    body = contract(response, REMIND)

    assert body["channel"] == "share_sheet"
    assert body["message"] == "Hi Sam, your share of Netflix for October 2026 is 5.16 USD."


def test_remind_by_email_when_there_is_an_address(api, monkeypatch):
    owner, jordan, sam = mocks._NETFLIX_SPLIT
    monkeypatch.setattr(mocks, "_NETFLIX_SPLIT", (owner, (*jordan[:4], False), sam))

    body = api.post(
        f"/api/v1/shared-plans/{mocks.SHARED_PLAN_ID}/payments/{jordan[1]}/remind"
    ).json()

    assert body["channel"] == "email"


@pytest.mark.parametrize(
    ("plan", "payment", "status"),
    [
        (mocks.SHARED_PLAN_ID, mocks._NETFLIX_SPLIT[1][1], 409),  # Jordan has paid
        (mocks.SHARED_PLAN_ID, "6a0b00000000000000000099", 404),
        ("6a0b00000000000000000999", mocks._NETFLIX_SPLIT[2][1], 404),
    ],
)
def test_remind_errors(api, contract, plan, payment, status):
    response = api.post(f"/api/v1/shared-plans/{plan}/payments/{payment}/remind")

    assert response.status_code == status
    contract(response, REMIND)


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
