"""Shared plans on real storage (handoff 04 §6a, 11 §2.6).

Alex's Netflix plan comes from the seed: Alex and Jordan have paid October,
Sam (no email on file) has not.
"""

import random
from datetime import date, timedelta
from decimal import Decimal

import pytest
from django.core import mail
from rest_framework.test import APIClient

from accounts.models import User, settings_for
from subscriptions.models import (
    SharedPlan,
    SharedPlanParticipant,
    SharedPlanPayment,
    Subscription,
)

PLANS = "/api/v1/shared-plans"
REMIND = "/shared-plans/{plan_id}/payments/{payment_id}/remind"
PAID = "/shared-plans/{plan_id}/payments/{payment_id}/paid"


def usd(amount):
    return {"amount": amount, "currency": "USD"}


def signed_in(user):
    client = APIClient()
    client.force_authenticate(user)
    return client


def netflix_plan(api):
    (plan,) = api.get(PLANS).json()["results"]
    return plan


def remind(api, plan, person):
    return api.post(f"{PLANS}/{plan['id']}/payments/{person['payment_id']}/remind")


def mark(api, plan, person, paid=True):
    return api.post(
        f"{PLANS}/{plan['id']}/payments/{person['payment_id']}/paid", {"paid": paid}, format="json"
    )


def share(api, sub, people):
    return api.post(
        PLANS,
        {"subscription_id": str(sub.pk), "participants": [{"display_name": n} for n in people]},
        format="json",
    )


# Reading ----------------------------------------------------------------------------


def test_the_seeded_netflix_plan_splits_three_ways_to_the_cent(api, contract):
    body = contract(api.get(PLANS), "/shared-plans")

    (plan,) = body["results"]
    assert plan["price"] == usd("15.49")
    assert plan["split_mode"] == "equal"
    assert plan["period"] == "2026-10"
    assert (plan["participant_count"], plan["paid_count"]) == (3, 2)
    assert [
        (p["display_name"], p["email"], p["share"]["amount"], p["status"])
        for p in plan["participants"]
    ] == [
        ("Alex Kim", "alex.kim@example.com", "5.17", "paid"),
        ("Jordan Doe", "jordan.doe@example.com", "5.16", "paid"),
        ("Sam", None, "5.16", "pending"),
    ]
    assert plan["your_share"] == usd("5.17")
    assert [p["position"] for p in plan["participants"]] == [0, 1, 2]
    assert plan["participants"][0]["is_owner"] is True
    # Sam still owes Alex for Netflix (11 §2.6).
    assert body["outstanding"] == usd("5.16")


def test_shared_plans_do_not_change_the_totals(api, alex):
    before = api.get("/api/v1/analytics/summary").json()
    share(api, Subscription.objects.get(owner=alex, name="Spotify"), ["Jordan", "Sam"])

    after = api.get("/api/v1/analytics/summary").json()
    assert after == before
    assert after["monthly_total"] == usd("129.20")


def test_someone_else_sees_none_of_alexs_plans(alex):
    someone = User.objects.create_user(email="real.user@example.org", password="longenough1")

    body = signed_in(someone).get(PLANS).json()

    assert body["results"] == []
    assert body["outstanding"] == usd("0.00")


def test_a_deleted_subscriptions_plan_is_hidden_and_comes_back_on_undo(api, alex):
    netflix = Subscription.objects.get(owner=alex, name="Netflix")
    plan = netflix_plan(api)
    sam = plan["participants"][2]

    api.delete(f"/api/v1/subscriptions/{netflix.pk}")
    assert api.get(PLANS).json()["results"] == []
    assert remind(api, plan, sam).status_code == 404

    api.post(f"/api/v1/subscriptions/{netflix.pk}/restore")
    assert netflix_plan(api)["id"] == plan["id"]


def test_a_cancelled_subscriptions_plan_is_hidden(api, alex):
    netflix = Subscription.objects.get(owner=alex, name="Netflix")
    plan = netflix_plan(api)

    api.post(f"/api/v1/subscriptions/{netflix.pk}/cancel")

    assert api.get(PLANS).json() == {
        "display_currency": "USD",
        "outstanding": usd("0.00"),
        "results": [],
    }
    assert mark(api, plan, plan["participants"][2]).status_code == 404


def test_a_new_month_starts_everyone_but_the_owner_pending(api, settings):
    october = netflix_plan(api)
    settings.SUBTRAK_TODAY = date(2026, 11, 3)

    body = api.get(PLANS).json()
    (november,) = body["results"]

    assert november["period"] == "2026-11"
    assert [p["status"] for p in november["participants"]] == ["paid", "pending", "pending"]
    assert body["outstanding"] == usd("10.32")
    # A new period has new payment ids; October's are kept.
    assert november["participants"][1]["payment_id"] != october["participants"][1]["payment_id"]
    assert SharedPlanPayment.objects.filter(period="2026-10").count() == 3


def test_reading_twice_opens_a_period_once(api, settings):
    settings.SUBTRAK_TODAY = date(2026, 11, 3)

    first = api.get(PLANS).json()
    second = api.get(PLANS).json()

    assert first == second
    assert SharedPlanPayment.objects.filter(period="2026-11").count() == 3


def test_outstanding_is_converted_to_the_display_currency(api, alex):
    prefs = settings_for(alex)
    prefs.display_currency = "EUR"
    prefs.save()

    body = api.get(PLANS).json()

    assert body["display_currency"] == "EUR"
    assert body["outstanding"]["currency"] == "EUR"
    # The plan itself stays in the billing currency.
    assert body["results"][0]["participants"][2]["share"] == usd("5.16")


# Creating ---------------------------------------------------------------------------


def test_create_a_shared_plan(api, alex, contract):
    spotify = Subscription.objects.get(owner=alex, name="Spotify")

    response = api.post(
        PLANS,
        {
            "subscription_id": str(spotify.pk),
            "participants": [{"display_name": " Jordan ", "email": "jordan@example.org"}],
        },
        format="json",
    )
    body = contract(response, "/shared-plans")

    assert response.status_code == 201
    assert body["subscription_id"] == str(spotify.pk)
    assert [p["display_name"] for p in body["participants"]] == ["Alex Kim", "Jordan"]
    assert [p["share"]["amount"] for p in body["participants"]] == ["5.50", "5.49"]
    assert [p["status"] for p in body["participants"]] == ["paid", "pending"]
    assert body["participants"][1]["email"] == "jordan@example.org"
    assert [p["name"] for p in api.get(PLANS).json()["results"]] == ["Netflix", "Spotify"]


def test_shares_always_sum_to_the_price(api, alex):
    rng = random.Random(325)
    sub = Subscription.objects.get(owner=alex, name="Spotify")
    for _ in range(25):
        SharedPlan.objects.filter(subscription=sub).delete()
        price = Decimal(rng.randint(100, 99_999)) / 100
        Subscription.objects.filter(pk=sub.pk).update(billing_price=price)
        others = rng.randint(1, 5)

        body = share(api, sub, [f"P{i}" for i in range(others)]).json()

        amounts = [Decimal(p["share"]["amount"]) for p in body["participants"]]
        assert len(amounts) == others + 1
        assert sum(amounts) == price
        assert max(amounts) - min(amounts) <= Decimal("0.01")
        assert amounts[0] == max(amounts)  # the owner absorbs the extra cent


def test_a_price_change_re_splits_the_plan(api, alex):
    netflix = Subscription.objects.get(owner=alex, name="Netflix")
    api.patch(f"/api/v1/subscriptions/{netflix.pk}", {"billing_price": "18.00"}, format="json")

    plan = netflix_plan(api)

    assert [p["share"]["amount"] for p in plan["participants"]] == ["6.00", "6.00", "6.00"]


@pytest.mark.parametrize(
    ("payload", "status", "code"),
    [
        (
            {"subscription_id": "netflix", "participants": [{"display_name": "Jo"}]},
            404,
            "not_found",
        ),
        (
            {
                "subscription_id": "6a0000000000000000000000",
                "participants": [{"display_name": "J"}],
            },
            404,
            "not_found",
        ),
        ({"subscription_id": "x", "participants": []}, 400, "validation_error"),
        (
            {"subscription_id": "x", "participants": [{"display_name": "J"}] * 20},
            400,
            "validation_error",
        ),
    ],
)
def test_create_shared_plan_errors(api, contract, payload, status, code):
    response = api.post(PLANS, payload, format="json")

    assert response.status_code == status
    assert contract(response, "/shared-plans")["error"]["code"] == code


def test_a_subscription_is_shared_once(api, alex, contract):
    netflix = Subscription.objects.get(owner=alex, name="Netflix")

    response = share(api, netflix, ["Jo"])

    assert response.status_code == 409
    assert contract(response, "/shared-plans")["error"]["code"] == "already_shared"


def test_a_lost_race_to_share_is_also_409(api, alex, monkeypatch):
    spotify = Subscription.objects.get(owner=alex, name="Spotify")
    # The other request's plan lands between the check and the insert.
    SharedPlan.objects.create(owner=alex, subscription=spotify)
    monkeypatch.setattr(
        "subscriptions.sharing.SharedPlan.objects.filter",
        lambda **kw: SharedPlan.objects.none(),
    )

    response = share(api, spotify, ["Jo"])

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "already_shared"


def test_someone_elses_subscription_is_404(alex):
    jordan = User.objects.get(email="jordan.doe@example.com")
    alexs_spotify = Subscription.objects.get(owner=alex, name="Spotify")

    response = share(signed_in(jordan), alexs_spotify, ["Jo"])

    assert response.status_code == 404
    assert not SharedPlan.objects.filter(subscription=alexs_spotify).exists()


def test_only_an_active_subscription_can_be_shared(api, alex):
    spotify = Subscription.objects.get(owner=alex, name="Spotify")
    api.post(f"/api/v1/subscriptions/{spotify.pk}/cancel")

    response = share(api, spotify, ["Jo"])

    assert response.status_code == 400
    assert "subscription_id" in response.json()["error"]["fields"]


def test_a_price_too_small_to_split_is_400(api, alex):
    spotify = Subscription.objects.get(owner=alex, name="Spotify")
    Subscription.objects.filter(pk=spotify.pk).update(billing_price=Decimal("0.03"))

    response = share(api, spotify, ["A", "B", "C"])

    assert response.status_code == 400
    assert "participants" in response.json()["error"]["fields"]
    assert share(api, spotify, ["A", "B"]).status_code == 201


# Reminding --------------------------------------------------------------------------


def test_remind_sam_opens_the_share_sheet(api, contract):
    plan = netflix_plan(api)
    sam = plan["participants"][2]

    body = contract(remind(api, plan, sam), REMIND)

    assert body["channel"] == "share_sheet"
    assert body["payment_id"] == sam["payment_id"]
    assert body["message"] == "Hi Sam, your share of Netflix for October 2026 is 5.16 USD."
    assert mail.outbox == []
    assert netflix_plan(api)["participants"][2]["last_reminded_at"] is not None


def test_remind_by_email_when_there_is_an_address(api, contract):
    plan = netflix_plan(api)
    jordan = plan["participants"][1]
    mark(api, plan, jordan, paid=False)

    body = contract(remind(api, plan, jordan), REMIND)

    assert body["channel"] == "email"
    (sent,) = mail.outbox
    assert sent.to == ["jordan.doe@example.com"]
    assert "Alex Kim" in sent.subject
    assert "your share of Netflix for October 2026 is 5.16 USD" in sent.body


def test_remind_is_throttled_to_once_a_day(api, contract):
    plan = netflix_plan(api)
    sam = plan["participants"][2]
    remind(api, plan, sam)

    again = remind(api, plan, sam)
    assert again.status_code == 429
    assert contract(again, REMIND)["error"]["code"] == "throttled"
    assert 0 < int(again["Retry-After"]) <= 24 * 3600

    payment = SharedPlanPayment.objects.get(pk=sam["payment_id"])
    payment.last_reminded_at -= timedelta(hours=24, seconds=1)
    payment.save()
    assert remind(api, plan, sam).status_code == 200


@pytest.mark.parametrize(
    ("plan_id", "who", "status", "code"),
    [
        (None, 1, 409, "already_paid"),  # Jordan has paid
        (None, 0, 409, "already_paid"),  # the owner always has
        (None, "6a0b00000000000000000099", 404, "not_found"),
        (None, "nonsense", 404, "not_found"),
        ("6a0b00000000000000000999", 2, 404, "not_found"),
        ("nonsense", 2, 404, "not_found"),
    ],
)
def test_remind_errors(api, contract, plan_id, who, status, code):
    plan = netflix_plan(api)
    payment = plan["participants"][who]["payment_id"] if isinstance(who, int) else who

    response = api.post(f"{PLANS}/{plan_id or plan['id']}/payments/{payment}/remind")

    assert response.status_code == status
    assert contract(response, REMIND)["error"]["code"] == code


def test_someone_else_cannot_remind_on_alexs_plan(api, alex):
    plan = netflix_plan(api)
    jordan = User.objects.get(email="jordan.doe@example.com")

    assert remind(signed_in(jordan), plan, plan["participants"][2]).status_code == 404


def test_last_months_payment_id_is_404(api, settings):
    plan = netflix_plan(api)
    settings.SUBTRAK_TODAY = date(2026, 11, 3)

    assert remind(api, plan, plan["participants"][2]).status_code == 404


# Marking paid -----------------------------------------------------------------------


def test_mark_sam_paid_and_undo_it(api, contract):
    plan = netflix_plan(api)
    sam = plan["participants"][2]

    paid = contract(mark(api, plan, sam), PAID)
    assert paid["paid_count"] == 3
    assert paid["participants"][2]["status"] == "paid"
    assert paid["participants"][2]["paid_at"] is not None
    assert api.get(PLANS).json()["outstanding"] == usd("0.00")
    assert remind(api, plan, sam).status_code == 409

    undone = contract(mark(api, plan, sam, paid=False), PAID)
    assert undone["participants"][2]["status"] == "pending"
    assert undone["participants"][2]["paid_at"] is None
    assert api.get(PLANS).json()["outstanding"] == usd("5.16")


def test_paid_defaults_to_true(api):
    plan = netflix_plan(api)
    sam = plan["participants"][2]

    response = api.post(f"{PLANS}/{plan['id']}/payments/{sam['payment_id']}/paid")

    assert response.json()["participants"][2]["status"] == "paid"


def test_the_owners_share_cannot_be_changed(api, contract):
    plan = netflix_plan(api)

    response = mark(api, plan, plan["participants"][0], paid=False)

    assert response.status_code == 409
    assert contract(response, PAID)["error"]["code"] == "owner_share"


def test_someone_else_cannot_mark_alexs_plan(api):
    plan = netflix_plan(api)
    jordan = User.objects.get(email="jordan.doe@example.com")

    assert mark(signed_in(jordan), plan, plan["participants"][2]).status_code == 404
    assert netflix_plan(api)["participants"][2]["status"] == "pending"


# Lifecycle --------------------------------------------------------------------------


def test_deleting_the_account_deletes_its_plans(alex):
    alex.delete()

    assert SharedPlan.objects.count() == 0
    assert SharedPlanParticipant.objects.count() == 0
    assert SharedPlanPayment.objects.count() == 0


def test_seeding_again_leaves_one_plan(alex):
    from subscriptions import seed

    seed.load_demo(today=seed.SEED_TODAY)

    assert SharedPlan.objects.count() == 1
    assert SharedPlanParticipant.objects.count() == 3
