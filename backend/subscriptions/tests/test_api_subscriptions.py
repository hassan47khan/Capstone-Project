"""Contract tests for /subscriptions (handoff 04 §5): each response matches
schema.yml and carries the canonical figures, and writes are kept."""

from datetime import date
from decimal import Decimal

import pytest
from rest_framework.test import APIClient

from accounts.models import User
from subscriptions import operations
from subscriptions.models import PriceHistoryEvent, Subscription
from subscriptions.seed import SEED_TODAY

TODAY = "2026-10-01"


def usd(amount):
    return {"amount": amount, "currency": "USD"}


def sub_id(alex, name):
    return str(Subscription.objects.get(owner=alex, name=name).pk)


def new_subscription(**overrides):
    return {
        "name": "  Figma  ",
        "billing_price": "15.00",
        "start_date": "2026-09-20",
        "category": "productivity",
        **overrides,
    }


# List ---------------------------------------------------------------------


def test_list_is_every_subscription_soonest_bill_first(api, contract):
    body = contract(api.get("/api/v1/subscriptions"), "/subscriptions")

    assert body["count"] == 11
    assert body["next"] is None
    names = [row["name"] for row in body["results"]]
    assert names[:4] == ["iCloud+", "Hulu", "Spotify", "New York Times"]
    dates = [row["next_bill_date"] for row in body["results"]]
    assert dates == sorted(dates)


def test_list_rows_carry_server_computed_monthly_equivalents(api, contract):
    rows = {
        r["name"]: r
        for r in contract(api.get("/api/v1/subscriptions"), "/subscriptions")["results"]
    }

    headspace = rows["Headspace"]
    assert headspace["billing_price"] == "12.99"
    assert (headspace["billing_cycle"], headspace["custom_cycle_count"]) == ("custom", 2)
    assert headspace["custom_cycle_unit"] == "months"
    # 6.495 unrounded, 6.50 displayed (04 §6).
    assert headspace["normalized_monthly"] == usd("6.50")
    assert rows["Netflix"]["service_mark"] == {
        "mark": "N",
        "brand_hex": "#e50914",
        "tint_hex": "#ffecee",
    }
    assert rows["Netflix"]["category"] == {
        "slug": "entertainment",
        "display_name": "Entertainment",
        "color_token_key": "entertainment",
    }


def test_trials_are_listed_but_do_not_count_toward_totals(api):
    rows = {r["name"]: r for r in api.get("/api/v1/subscriptions").json()["results"]}

    assert rows["Hulu"]["is_trial"] is True
    assert rows["Hulu"]["trial_ends_on"] == "2026-10-03"
    assert rows["Hulu"]["counts_toward_totals"] is False
    assert rows["Netflix"]["counts_toward_totals"] is True


def test_list_filters_by_category_and_status(api, contract):
    entertainment = contract(
        api.get("/api/v1/subscriptions?category=entertainment"), "/subscriptions"
    )
    assert sorted(r["name"] for r in entertainment["results"]) == [
        "Hulu",
        "Netflix",
        "Spotify",
        "YouTube Premium",
    ]
    assert api.get("/api/v1/subscriptions?status=cancelled").json()["count"] == 0
    assert api.get("/api/v1/subscriptions?category=no-such-slug").json()["count"] == 0


def test_list_puts_cancelled_last(api, alex):
    operations.cancel_subscription(
        Subscription.objects.get(owner=alex, name="iCloud+"), today=SEED_TODAY
    )

    rows = api.get("/api/v1/subscriptions").json()["results"]

    assert rows[-1]["name"] == "iCloud+"
    assert rows[-1]["status"] == "cancelled"
    assert rows[-1]["next_bill_date"] is None


def test_list_rejects_an_unknown_status(api, contract):
    body = contract(api.get("/api/v1/subscriptions?status=paused"), "/subscriptions")

    assert body["error"]["code"] == "validation_error"
    assert "status" in body["error"]["fields"]


def test_every_endpoint_needs_a_token(db, contract):
    body = contract(APIClient().get("/api/v1/subscriptions"), "/subscriptions")

    assert body == {
        "error": {
            "code": "not_authenticated",
            "message": "Authentication credentials were not provided.",
        }
    }


# Detail ---------------------------------------------------------------------


def test_detail_has_total_spent_and_history(api, alex, contract):
    netflix = sub_id(alex, "Netflix")
    body = contract(api.get(f"/api/v1/subscriptions/{netflix}"), "/subscriptions/{subscription_id}")

    assert body["id"] == netflix
    assert body["normalized_monthly"] == usd("15.49")
    # 31 bills at $13.99 (04 §4.4).
    assert body["total_spent_to_date"] == usd("433.69")
    assert body["saved_per_year"] is None
    assert body["payment_label"] == "Visa ••4242"
    assert body["next_bill_date"] == "2026-10-12"
    assert [e["event_type"] for e in body["history"]] == [
        "price_change",
        "category_change",
        "created",
    ]
    assert body["history"][0]["old_value"] == {"price": "13.99", "currency": "USD"}
    assert body["history"][0]["new_value"] == {"price": "15.49", "currency": "USD"}
    assert body["history"][0]["occurred_at"].startswith(TODAY)


@pytest.fixture
def switched(alex, categories):
    """$10.00 on the 12th from January, then 9.00 in another currency from July."""

    def switched(currency):
        sub = operations.create_subscription(
            today=SEED_TODAY,
            at=operations.at_start_of(date(2026, 1, 12)),
            owner=alex,
            name="Figma",
            billing_price=Decimal("10.00"),
            start_date=date(2026, 1, 12),
            category=categories["productivity"],
        )
        operations.update_subscription(
            sub,
            today=SEED_TODAY,
            at=operations.at_start_of(date(2026, 7, 1)),
            billing_price=Decimal("9.00"),
            billing_currency=currency,
        )
        return str(sub.pk)

    return switched


def test_total_spent_converts_each_period_from_its_own_currency(api, contract, switched):
    body = contract(
        api.get(f"/api/v1/subscriptions/{switched('EUR')}"), "/subscriptions/{subscription_id}"
    )

    # Six bills of $10.00, then three of EUR 9.00 at 0.9177 EUR per dollar.
    assert body["total_spent_to_date"] == usd("89.42")
    assert [e["event_type"] for e in body["history"]] == [
        "price_change",
        "currency_change",
        "created",
    ]


def test_total_spent_is_null_when_a_period_has_no_rate(api, switched):
    body = api.get(f"/api/v1/subscriptions/{switched('GBP')}").json()

    assert body["total_spent_to_date"] is None


def test_history_from_before_currency_was_recorded_still_serializes(api, alex, contract):
    event = PriceHistoryEvent.objects.get(subscription__name="Netflix", event_type="price_change")
    event.old_value, event.new_value = {"price": "13.99"}, {"price": "15.49"}
    event.save()

    body = contract(
        api.get(f"/api/v1/subscriptions/{sub_id(alex, 'Netflix')}"),
        "/subscriptions/{subscription_id}",
    )

    assert body["history"][0]["old_value"] == {"price": "13.99"}
    assert body["history"][0]["new_value"] == {"price": "15.49"}


@pytest.mark.parametrize("bad_id", ["not-an-id", "6a0000000000000000000000"])
def test_detail_of_an_unknown_id_is_404(api, contract, bad_id):
    body = contract(api.get(f"/api/v1/subscriptions/{bad_id}"), "/subscriptions/{subscription_id}")

    assert body == {"error": {"code": "not_found", "message": "Not found."}}


def test_another_users_subscription_is_404_not_403(api, contract):
    jordan_hulu = Subscription.objects.get(owner__email="jordan.doe@example.com", name="Hulu")

    response = api.get(f"/api/v1/subscriptions/{jordan_hulu.pk}")

    assert response.status_code == 404


def test_history_endpoint_is_newest_first(api, alex, contract):
    netflix = sub_id(alex, "Netflix")
    body = contract(
        api.get(f"/api/v1/subscriptions/{netflix}/history"),
        "/subscriptions/{subscription_id}/history",
    )

    assert [e["event_type"] for e in body] == ["price_change", "category_change", "created"]


# Create ---------------------------------------------------------------------


def test_create_keeps_the_new_subscription_and_its_created_event(api, alex, contract):
    before = Subscription.all_objects.count()

    response = api.post("/api/v1/subscriptions", new_subscription(), format="json")
    body = contract(response, "/subscriptions")

    assert response.status_code == 201
    assert body["name"] == "Figma"  # trimmed
    assert body["billing_price"] == "15.00"
    assert body["billing_currency"] == "USD"
    assert body["billing_cycle"] == "monthly"
    assert body["next_bill_date"] == "2026-10-20"
    assert body["total_spent_to_date"] == usd("15.00")
    assert [e["event_type"] for e in body["history"]] == ["created"]
    assert body["history"][0]["new_value"]["category"] == "productivity"
    assert Subscription.all_objects.count() == before + 1
    assert Subscription.objects.get(pk=body["id"]).owner == alex
    assert PriceHistoryEvent.objects.filter(subscription_id=body["id"]).count() == 1


def test_create_a_trial(api, contract):
    response = api.post(
        "/api/v1/subscriptions",
        new_subscription(
            is_trial=True,
            trial_ends_on="2026-10-19",
            trial_length_days=30,
            start_date="2026-10-19",
        ),
        format="json",
    )
    body = contract(response, "/subscriptions")

    assert body["is_trial"] is True
    assert body["counts_toward_totals"] is False
    assert body["total_spent_to_date"] == usd("0.00")


@pytest.mark.parametrize("price", ["0", "-1", "abc", "1.234", None])
def test_create_rejects_a_bad_price_with_the_spec_message(api, contract, price):
    response = api.post(
        "/api/v1/subscriptions", new_subscription(billing_price=price), format="json"
    )
    body = contract(response, "/subscriptions")

    assert response.status_code == 400
    assert body["error"] == {
        "code": "price_invalid",
        "message": "Enter a valid price greater than $0.",
        "fields": {"billing_price": ["Enter a valid price greater than $0."]},
    }


@pytest.mark.parametrize(
    ("overrides", "field", "message"),
    [
        ({"name": "   "}, "name", "Enter a name."),
        ({"category": "gaming"}, "category", "Choose a category."),
        ({"start_date": None}, "start_date", "Choose a start date."),
        (
            {"payment_label": "4242 4242 4242 4242"},
            "payment_label",
            "Enter a label such as 'Visa ••4242', not a card number.",
        ),
        ({"billing_currency": "usd"}, "billing_currency", "Choose a currency."),
        (
            {"billing_cycle": "custom", "custom_cycle_count": 2},
            "billing_cycle",
            "Unknown custom cycle unit None.",
        ),
        ({"is_trial": True}, "trial_ends_on", "A trial needs an end date and a length."),
    ],
)
def test_create_validation_messages(api, contract, overrides, field, message):
    response = api.post("/api/v1/subscriptions", new_subscription(**overrides), format="json")
    body = contract(response, "/subscriptions")

    assert response.status_code == 400
    assert body["error"]["code"] == "validation_error"
    assert body["error"]["fields"][field] == [message]
    assert body["error"]["message"] == message


def test_create_without_a_name(api):
    payload = new_subscription()
    del payload["name"]

    body = api.post("/api/v1/subscriptions", payload, format="json").json()

    assert body["error"]["fields"]["name"] == ["Enter a name."]


# Update, cancel, delete, restore ---------------------------------------------


def test_patch_price_writes_one_history_event(api, alex, contract):
    netflix = sub_id(alex, "Netflix")
    path = "/subscriptions/{subscription_id}"

    response = api.patch(
        f"/api/v1/subscriptions/{netflix}", {"billing_price": "16.99"}, format="json"
    )
    body = contract(response, path)

    assert body["billing_price"] == "16.99"
    assert body["normalized_monthly"] == usd("16.99")
    assert [e["event_type"] for e in body["history"]][:2] == ["price_change", "price_change"]
    assert body["history"][0]["old_value"] == {"price": "15.49", "currency": "USD"}
    after = api.get(f"/api/v1/subscriptions/{netflix}").json()
    assert after["billing_price"] == "16.99"
    assert len(after["history"]) == 4


def test_patch_category_and_cycle(api, alex, contract):
    spotify = sub_id(alex, "Spotify")

    response = api.patch(
        f"/api/v1/subscriptions/{spotify}",
        {"category": "other", "billing_cycle": "yearly", "billing_price": "109.00"},
        format="json",
    )
    body = contract(response, "/subscriptions/{subscription_id}")

    assert body["category"]["slug"] == "other"
    assert body["normalized_monthly"] == usd("9.08")
    kinds = {e["event_type"] for e in body["history"][:3]}
    assert kinds == {"price_change", "category_change", "cycle_change"}
    assert Subscription.objects.get(pk=spotify).billing_cycle == "yearly"


def test_patch_that_breaks_the_cycle_is_a_400(api, alex, contract):
    spotify = sub_id(alex, "Spotify")

    response = api.patch(
        f"/api/v1/subscriptions/{spotify}", {"billing_cycle": "custom"}, format="json"
    )
    body = contract(response, "/subscriptions/{subscription_id}")

    assert response.status_code == 400
    assert "billing_cycle" in body["error"]["fields"]
    assert Subscription.objects.get(pk=spotify).billing_cycle == "monthly"


def test_patch_rejects_a_zero_price(api, alex):
    response = api.patch(
        f"/api/v1/subscriptions/{sub_id(alex, 'Spotify')}", {"billing_price": "0"}, format="json"
    )

    assert response.json()["error"]["code"] == "price_invalid"


def test_cancel_reports_what_is_saved_per_year(api, alex, contract):
    spotify = sub_id(alex, "Spotify")

    response = api.post(f"/api/v1/subscriptions/{spotify}/cancel")
    body = contract(response, "/subscriptions/{subscription_id}/cancel")

    assert body["status"] == "cancelled"
    assert body["cancelled_on"] == TODAY
    assert body["next_bill_date"] is None
    assert body["counts_toward_totals"] is False
    assert body["saved_per_year"] == usd("131.88")
    assert body["history"][0]["event_type"] == "cancelled"
    assert Subscription.objects.get(pk=spotify).status == "cancelled"


def test_cancelling_a_cancelled_subscription_is_409(api, alex, contract):
    spotify = Subscription.objects.get(owner=alex, name="Spotify")
    operations.cancel_subscription(spotify, today=SEED_TODAY)

    response = api.post(f"/api/v1/subscriptions/{spotify.pk}/cancel")
    body = contract(response, "/subscriptions/{subscription_id}/cancel")

    assert body["error"]["code"] == "already_cancelled"


def test_delete_is_204_and_restore_returns_the_subscription(api, alex, contract):
    spotify = sub_id(alex, "Spotify")

    deleted = api.delete(f"/api/v1/subscriptions/{spotify}")
    contract(deleted, "/subscriptions/{subscription_id}")
    restored = api.post(f"/api/v1/subscriptions/{spotify}/restore")
    body = contract(restored, "/subscriptions/{subscription_id}/restore")

    assert deleted.status_code == 204
    assert body["status"] == "active"
    assert Subscription.objects.filter(pk=spotify).exists()


def test_restore_puts_back_a_deleted_subscription(api, alex):
    spotify = Subscription.objects.get(owner=alex, name="Spotify")
    operations.soft_delete(spotify)

    body = api.post(f"/api/v1/subscriptions/{spotify.pk}/restore").json()

    assert body["status"] == "active"
    assert body["next_bill_date"] == "2026-10-04"
    assert Subscription.objects.get(pk=spotify.pk).status == "active"


def test_delete_keeps_the_row_and_its_history(api, alex):
    spotify = Subscription.objects.get(owner=alex, name="Spotify")

    api.delete(f"/api/v1/subscriptions/{spotify.pk}")

    assert Subscription.all_objects.get(pk=spotify.pk).status == "deleted"
    assert PriceHistoryEvent.objects.filter(subscription=spotify).exists()
    names = [r["name"] for r in api.get("/api/v1/subscriptions").json()["results"]]
    assert "Spotify" not in names


def test_another_users_subscription_is_404(api, alex, categories):
    stranger = User.objects.create_user(email="stranger@example.com", password="x")
    theirs = operations.create_subscription(
        today=SEED_TODAY,
        owner=stranger,
        name="Theirs",
        billing_price=Decimal("5.00"),
        start_date=SEED_TODAY,
        category=categories["other"],
    )
    path = f"/api/v1/subscriptions/{theirs.pk}"

    assert api.get(path).status_code == 404
    assert api.patch(path, {"name": "Mine"}, format="json").status_code == 404
    assert api.delete(path).status_code == 404
    assert api.post(f"{path}/cancel").status_code == 404
    assert api.post(f"{path}/restore").status_code == 404
    assert api.get(f"{path}/history").status_code == 404
    assert "Theirs" not in [r["name"] for r in api.get("/api/v1/subscriptions").json()["results"]]
    assert Subscription.objects.get(pk=theirs.pk).name == "Theirs"


def test_a_deleted_subscription_is_404_except_to_restore(api, alex):
    spotify = Subscription.objects.get(owner=alex, name="Spotify")
    operations.soft_delete(spotify)

    assert api.get(f"/api/v1/subscriptions/{spotify.pk}").status_code == 404
    assert api.delete(f"/api/v1/subscriptions/{spotify.pk}").status_code == 404


def test_money_is_never_a_float(api):
    def walk(node):
        if isinstance(node, dict):
            for value in node.values():
                walk(value)
        elif isinstance(node, list):
            for value in node:
                walk(value)
        else:
            assert not isinstance(node, float | Decimal)

    walk(api.get("/api/v1/subscriptions").json())
