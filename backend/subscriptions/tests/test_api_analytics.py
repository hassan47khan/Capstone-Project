"""Contract tests for /analytics (handoff 04 §5, 06 §3, 08 §3): shapes from
schema.yml, figures from the canonical dataset at SEED_TODAY."""

from datetime import date
from decimal import Decimal

import pytest
from rest_framework.test import APIClient

from accounts.models import User, settings_for
from subscriptions import operations
from subscriptions.models import PriceHistoryEvent, Subscription


def usd(amount):
    return {"amount": amount, "currency": "USD"}


# Summary --------------------------------------------------------------------


def test_summary_is_alexs_129_20_without_the_trials(api, contract):
    body = contract(api.get("/api/v1/analytics/summary?period=current_month"), "/analytics/summary")

    assert body["period"] == "current_month"
    assert body["display_currency"] == "USD"
    assert body["monthly_total"] == usd("129.20")
    assert body["annual_total"] == usd("1550.34")
    assert body["active_count"] == 8
    assert body["trial_count"] == 3
    assert body["pending_trials_monthly"] == usd("41.98")
    assert body["unconverted_count"] == 0
    assert body["rates_as_of"] == "2026-10-01"


def test_summary_category_rollup(api, contract):
    body = contract(api.get("/api/v1/analytics/summary"), "/analytics/summary")

    rows = [
        (r["category"]["slug"], r["amount"]["amount"], r["percent"], r["share"])
        for r in body["categories"]
    ]
    assert rows == [
        ("productivity", "54.99", 43, "42.56"),
        ("entertainment", "40.47", 31, "31.32"),
        ("ai-tools", "20.00", 16, "15.48"),
        ("health-wellness", "6.50", 5, "5.03"),
        ("news-media", "4.25", 3, "3.29"),
        ("cloud-storage", "2.99", 2, "2.31"),
    ]
    assert sum(Decimal(r[1]) for r in rows) == Decimal("129.20")
    assert sum(r[2] for r in rows) == 100


def test_summary_in_euros_agrees_with_its_lines(api, alex, contract):
    settings = settings_for(alex)
    settings.display_currency = "EUR"
    settings.save()

    body = contract(api.get("/api/v1/analytics/summary"), "/analytics/summary")

    assert body["monthly_total"] == {"amount": "118.56", "currency": "EUR"}
    lines = [Decimal(r["amount"]["amount"]) for r in body["categories"]]
    assert sum(lines) == Decimal("118.56")
    assert {r["amount"]["currency"] for r in body["categories"]} == {"EUR"}


def test_summary_leaves_out_a_currency_without_a_rate(api, alex):
    Subscription.objects.filter(owner=alex, name="Spotify").update(billing_currency="GBP")

    body = api.get("/api/v1/analytics/summary").json()

    assert body["unconverted_count"] == 1
    assert body["active_count"] == 7
    assert body["monthly_total"] == usd("118.21")
    assert body["converted"] is False
    rows = {r["name"]: r for r in api.get("/api/v1/subscriptions").json()["results"]}
    assert rows["Spotify"]["normalized_monthly"] is None
    assert rows["Netflix"]["normalized_monthly"] == usd("15.49")


def test_summary_says_when_it_converted(api, alex, contract):
    assert (
        contract(api.get("/api/v1/analytics/summary"), "/analytics/summary")["converted"] is False
    )

    Subscription.objects.filter(owner=alex, name="Spotify").update(billing_currency="EUR")

    assert api.get("/api/v1/analytics/summary").json()["converted"] is True


def test_summary_rejects_an_unknown_period(api, contract):
    response = api.get("/api/v1/analytics/summary?period=last_year")
    body = contract(response, "/analytics/summary")

    assert response.status_code == 400
    assert "period" in body["error"]["fields"]


# Spend over time ------------------------------------------------------------


def test_spend_over_time_ends_on_this_month(api, contract):
    body = contract(api.get("/api/v1/analytics/spend-over-time"), "/analytics/spend-over-time")

    months = body["months"]
    assert len(months) == 12
    assert months[0] == {"month": "2025-11", "amount": usd("109.46")}
    assert months[-1] == {"month": "2026-10", "amount": usd("129.20")}
    # September still had Netflix at $13.99; it rose on Oct 1.
    assert months[-2] == {"month": "2026-09", "amount": usd("127.70")}
    assert body["current"] == usd("129.20")
    assert body["previous"] == usd("127.70")
    assert body["delta_percent"] == "1.2"
    assert body["direction"] == "up"
    assert body["enough_history"] is True


def test_spend_over_time_for_home_has_the_delta_even_for_one_month(api, contract):
    body = contract(
        api.get("/api/v1/analytics/spend-over-time?months=1"), "/analytics/spend-over-time"
    )

    assert [m["month"] for m in body["months"]] == ["2026-10"]
    assert body["delta_percent"] == "1.2"


def test_spend_over_time_flat_and_new_users(api, alex):
    # A user whose only subscription started this month: nothing to compare with.
    Subscription.objects.filter(owner=alex).exclude(name="iCloud+").delete()
    Subscription.objects.filter(owner=alex, name="iCloud+").update(
        start_date="2026-10-01", is_trial=False
    )

    body = api.get("/api/v1/analytics/spend-over-time?months=2").json()

    assert body["previous"] == usd("0.00")
    assert body["delta_percent"] is None
    assert body["direction"] == "up"
    assert body["enough_history"] is False


def test_spend_over_time_unchanged(api, alex):
    Subscription.objects.filter(owner=alex, name="Netflix").delete()

    body = api.get("/api/v1/analytics/spend-over-time?months=2").json()

    assert body["direction"] == "flat"
    assert body["delta_percent"] == "0.0"


def test_spend_over_time_excludes_cancelled_months(api, alex):
    adobe = Subscription.objects.get(owner=alex, name="Adobe CC")
    operations.cancel_subscription(adobe, today=adobe.start_date)

    body = api.get("/api/v1/analytics/spend-over-time?months=2").json()

    assert body["current"] == usd("74.21")


@pytest.mark.parametrize("months", ["0", "25", "x"])
def test_spend_over_time_validates_months(api, contract, months):
    response = api.get(f"/api/v1/analytics/spend-over-time?months={months}")

    assert contract(response, "/analytics/spend-over-time")["error"]["code"] == "validation_error"


# Upcoming ---------------------------------------------------------------------


def test_upcoming_is_every_bill_in_the_next_30_days_in_date_order(api, contract):
    body = contract(api.get("/api/v1/analytics/upcoming?days=30"), "/analytics/upcoming")

    assert (body["start"], body["end"]) == ("2026-10-01", "2026-10-31")
    rows = [
        (i["bill_date"], i["name"], i["amount"]["amount"], i["is_trial"]) for i in body["items"]
    ]
    assert rows == [
        ("2026-10-01", "iCloud+", "2.99", False),
        ("2026-10-03", "Hulu", "17.99", True),
        ("2026-10-04", "Spotify", "10.99", False),
        ("2026-10-08", "New York Times", "4.25", False),
        ("2026-10-10", "Notion AI", "10.00", True),
        ("2026-10-12", "Netflix", "15.49", False),
        ("2026-10-15", "Headspace", "12.99", False),
        ("2026-10-15", "YouTube Premium", "13.99", False),
        ("2026-10-18", "Adobe CC", "54.99", False),
        ("2026-10-20", "ChatGPT Plus", "20.00", False),
        ("2026-10-22", "Duolingo Max", "13.99", True),
    ]
    assert body["items"][0]["days_until"] == 0
    assert body["items"][1]["days_until"] == 2


def test_upcoming_amount_is_the_charge_not_the_monthly_equivalent(api):
    items = api.get("/api/v1/analytics/upcoming").json()["items"]
    headspace = next(i for i in items if i["name"] == "Headspace")

    assert headspace["amount"] == usd("12.99")
    assert headspace["billing_amount"] == usd("12.99")


def test_upcoming_over_a_past_range_uses_the_price_then(api, contract):
    body = contract(
        api.get("/api/v1/analytics/upcoming?start=2026-09-01&end=2026-09-30"),
        "/analytics/upcoming",
    )

    netflix = next(i for i in body["items"] if i["name"] == "Netflix")
    assert netflix["bill_date"] == "2026-09-12"
    assert netflix["amount"] == usd("13.99")
    assert netflix["days_until"] == -19
    assert not any(i["is_trial"] for i in body["items"])


def test_upcoming_stops_at_cancellation(api, alex):
    spotify = Subscription.objects.get(owner=alex, name="Spotify")
    operations.cancel_subscription(spotify, today=spotify.start_date.replace(year=2026, month=9))

    body = api.get("/api/v1/analytics/upcoming?start=2026-08-01&end=2026-10-31").json()

    assert [i["bill_date"] for i in body["items"] if i["name"] == "Spotify"] == ["2026-08-04"]


@pytest.mark.parametrize(
    "params",
    ["start=2026-10-01", "start=2026-10-10&end=2026-10-01", "start=2026-01-01&end=2027-06-01"],
)
def test_upcoming_validates_the_range(api, contract, params):
    response = api.get(f"/api/v1/analytics/upcoming?{params}")

    assert response.status_code == 400
    assert contract(response, "/analytics/upcoming")["error"]["code"] == "validation_error"


# Price changes ------------------------------------------------------------------


def test_urgent_attention_has_the_price_rise_and_the_trial_ending(api, contract):
    body = contract(
        api.get("/api/v1/analytics/price-changes?since=-30d&include_upcoming=true"),
        "/analytics/price-changes",
    )

    trial, netflix = body["items"]
    assert trial["kind"] == "trial_ending"
    assert (trial["name"], trial["effective_on"], trial["days_left"]) == ("Hulu", "2026-10-03", 2)
    assert trial["new_price"] == usd("17.99")
    assert trial["old_price"] is None
    assert trial["is_upcoming"] is True
    assert netflix["kind"] == "price_change"
    assert netflix["effective_on"] == "2026-10-01"
    assert (netflix["old_price"], netflix["new_price"]) == (usd("13.99"), usd("15.49"))
    assert netflix["monthly_change"] == usd("1.50")
    assert netflix["annual_change"] == usd("18.00")  # "+$18.00/yr", 06 §2.4
    assert netflix["direction"] == "up"
    assert netflix["is_upcoming"] is False


def test_trials_marked_keep_stop_appearing(api, alex):
    Subscription.objects.filter(owner=alex, name="Hulu").update(trial_decision="keep")

    body = api.get("/api/v1/analytics/price-changes?since=-30d&include_upcoming=true").json()

    assert [i["kind"] for i in body["items"]] == ["price_change"]


def test_detail_chart_uses_twelve_months_for_one_subscription(api, alex, contract):
    netflix = Subscription.objects.get(owner=alex, name="Netflix")

    body = contract(
        api.get(f"/api/v1/analytics/price-changes?months=12&subscription={netflix.pk}"),
        "/analytics/price-changes",
    )

    assert [(i["name"], i["effective_on"]) for i in body["items"]] == [("Netflix", "2026-10-01")]


def test_price_changes_default_window_has_no_trials(api, alex):
    spotify = Subscription.objects.get(owner=alex, name="Spotify")
    assert not api.get(f"/api/v1/analytics/price-changes?subscription={spotify.pk}").json()["items"]
    assert [i["kind"] for i in api.get("/api/v1/analytics/price-changes").json()["items"]] == [
        "price_change"
    ]


def test_price_changes_window_excludes_older_changes(api):
    body = api.get("/api/v1/analytics/price-changes?since=-0d").json()
    assert [i["effective_on"] for i in body["items"]] == ["2026-10-01"]


def test_a_price_cut_is_signed(api, alex):
    event = PriceHistoryEvent.objects.get(subscription__name="Netflix", event_type="price_change")
    event.new_value = {"price": "12.99"}
    event.save()

    item = api.get("/api/v1/analytics/price-changes").json()["items"][0]

    assert item["direction"] == "down"
    assert item["annual_change"] == usd("-12.00")


@pytest.mark.parametrize(
    ("params", "status"),
    [
        ("months=12&since=-30d", 400),
        ("since=30d", 400),
        ("months=0", 400),
        ("subscription=6a0000000000000000000000", 404),
    ],
)
def test_price_changes_validation(api, contract, params, status):
    response = api.get(f"/api/v1/analytics/price-changes?{params}")

    assert response.status_code == status
    contract(response, "/analytics/price-changes")


# Every figure is the signed-in user's own (04 §4.5) ---------------------------


@pytest.mark.parametrize(
    ("email", "total", "active"),
    [("jordan.doe@example.com", "45.98", 4), ("sam@example.com", "22.98", 2)],
)
def test_each_family_member_sees_their_own_total(alex, contract, email, total, active):
    client = APIClient()
    client.force_authenticate(User.objects.get(email=email))

    body = contract(client.get("/api/v1/analytics/summary"), "/analytics/summary")

    assert body["monthly_total"] == usd(total)
    assert body["active_count"] == active
    assert body["trial_count"] == 0


def test_a_new_user_starts_from_nothing(db, contract):
    client = APIClient()
    client.force_authenticate(User.objects.create_user(email="fresh@example.com", password="x"))

    summary = contract(client.get("/api/v1/analytics/summary"), "/analytics/summary")
    urgent = client.get("/api/v1/analytics/price-changes?since=-30d&include_upcoming=true")

    assert summary["monthly_total"] == usd("0.00")
    assert summary["categories"] == []
    assert urgent.json()["items"] == []
    assert client.get("/api/v1/analytics/upcoming").json()["items"] == []


def test_a_currency_switch_is_not_a_price_change_alert(api, alex):
    spotify = Subscription.objects.get(owner=alex, name="Spotify")
    operations.update_subscription(
        spotify,
        today=date(2026, 10, 1),
        at=operations.at_start_of(date(2026, 10, 1)),
        billing_currency="EUR",
    )

    body = api.get("/api/v1/analytics/price-changes").json()

    assert [item["name"] for item in body["items"]] == ["Netflix"]


def test_a_new_price_in_a_new_currency_is_not_a_price_change_alert(api, alex):
    # Ankit's case on #142: 10.99 USD to 9.99 EUR is not a 10.99 EUR -> 9.99 EUR drop.
    spotify = Subscription.objects.get(owner=alex, name="Spotify")
    spotify.billing_price = Decimal("10.99")
    spotify.save()
    operations.update_subscription(
        spotify,
        today=date(2026, 10, 1),
        at=operations.at_start_of(date(2026, 10, 1)),
        billing_price=Decimal("9.99"),
        billing_currency="EUR",
    )

    body = api.get("/api/v1/analytics/price-changes").json()

    assert [item["name"] for item in body["items"]] == ["Netflix"]


def test_a_change_from_before_currencies_keeps_the_currency_it_was_in(api, alex):
    netflix = Subscription.objects.get(owner=alex, name="Netflix")
    event = PriceHistoryEvent.objects.get(subscription=netflix, event_type="price_change")
    event.old_value, event.new_value = {"price": "13.99"}, {"price": "15.49"}
    event.save()
    operations.update_subscription(netflix, today=date(2026, 10, 1), billing_currency="EUR")

    item = api.get("/api/v1/analytics/price-changes").json()["items"][0]

    assert item["name"] == "Netflix"
    assert item["old_price"] == usd("13.99")
    assert item["new_price"] == usd("15.49")


def test_a_deleted_subscriptions_price_change_is_not_an_alert(api, alex):
    operations.soft_delete(Subscription.objects.get(owner=alex, name="Netflix"))

    body = api.get("/api/v1/analytics/price-changes?since=-30d&include_upcoming=true").json()

    assert [item["name"] for item in body["items"]] == ["Hulu"]


def test_today_comes_from_the_clock(api, settings):
    settings.SUBTRAK_TODAY = date(2026, 10, 2)

    body = api.get("/api/v1/analytics/upcoming?days=0").json()

    assert body["start"] == body["end"] == "2026-10-02"


def test_items_carry_the_cycle_in_effect(api, alex, contract):
    upcoming = contract(api.get("/api/v1/analytics/upcoming"), "/analytics/upcoming")
    urgent = contract(
        api.get("/api/v1/analytics/price-changes?since=-30d&include_upcoming=true"),
        "/analytics/price-changes",
    )

    bills = {item["name"]: item for item in upcoming["items"]}
    assert bills["Headspace"]["billing_cycle"] == "custom"
    assert (bills["Headspace"]["custom_cycle_count"], bills["Headspace"]["custom_cycle_unit"]) == (
        2,
        "months",
    )
    assert bills["Netflix"]["billing_cycle"] == "monthly"
    assert bills["Netflix"]["custom_cycle_count"] is None
    assert {item["name"]: item["billing_cycle"] for item in urgent["items"]} == {
        "Hulu": "monthly",
        "Netflix": "monthly",
    }
