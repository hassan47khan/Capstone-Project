"""Charges and the price-increase alert (US-19; spec sections 8 and 9).

A bill that goes by is recorded at the price on file; confirming it with a
higher amount is the only thing that raises a price-increase alert. Editing
the price directly is the user's own change and never alerts.
"""

from datetime import date, timedelta
from decimal import Decimal

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User, rules_for, settings_for
from notifications import tasks as notification_tasks
from notifications.models import Notification, Reminder
from notifications.price_alerts import percent_change
from subscriptions import operations
from subscriptions.models import Charge, FxRate, PriceHistoryEvent, Subscription

START = date(2026, 1, 12)
LATER = date(2026, 10, 1)  # SEED_TODAY, the day every test runs on
# Nine monthly bills have gone by between START and LATER; this is the last.
LAST_BILL = date(2026, 9, 12)

Kind = Reminder.Kind
State = Reminder.State
Outcome = Charge.Outcome


@pytest.fixture
def owner(db, categories):
    return User.objects.create_user(email="owner@example.com", password="x")


@pytest.fixture
def client(owner):
    api = APIClient()
    api.force_authenticate(owner)
    return api


@pytest.fixture
def sub(owner, categories):
    return operations.create_subscription(
        today=START,
        owner=owner,
        name="Netflix",
        billing_price=Decimal("13.99"),
        start_date=START,
        category=categories["entertainment"],
    )


@pytest.fixture
def charge(sub):
    """September's bill, the latest of the nine missed, recorded by the
    roll-forward job."""
    operations.roll_forward_bills(today=LATER)
    return Charge.objects.get(subscription=sub)


def price_alerts(sub):
    return Reminder.objects.filter(subscription=sub, kind=Kind.PRICE_INCREASE)


def confirm(client, charge, **body):
    return client.post(f"/api/v1/charges/{charge.pk}/confirm", body, format="json")


# Recording bills ----------------------------------------------------------------


def test_a_bill_that_goes_by_is_recorded_unconfirmed_at_the_price_on_file(charge, sub):
    assert charge.charged_on == LAST_BILL
    assert charge.expected_amount == charge.amount == Decimal("13.99")
    assert charge.currency == "USD"
    assert charge.confirmed is False
    assert charge.outcome is None
    assert charge.owner_id == sub.owner_id


def test_when_several_bills_were_missed_only_the_latest_is_recorded(sub):
    # Nine bills went by since January; the user can only check the last
    # one against a statement, and only it is recent enough to alert about.
    operations.roll_forward_bills(today=LATER)

    assert list(Charge.objects.filter(subscription=sub).values_list("charged_on", flat=True)) == [
        LAST_BILL
    ]


def test_rolling_forward_again_records_the_same_bill_once(sub):
    operations.roll_forward_bills(today=LATER)
    # Put the date back and roll again: the latest bill is still September's.
    Subscription.objects.filter(pk=sub.pk).update(next_bill_date=START)
    operations.roll_forward_bills(today=LATER)

    assert Charge.objects.filter(subscription=sub).count() == 1


def test_a_charge_describes_itself_for_the_admin(charge):
    assert str(charge) == "13.99 USD on 2026-09-12"


def test_unconfirmed_charges_are_listed_for_the_owner(client, charge, contract):
    response = client.get("/api/v1/charges")

    assert response.status_code == 200
    body = contract(response, "/charges")
    assert body["results"] == [
        {
            "id": str(charge.pk),
            "subscription_id": str(charge.subscription_id),
            "name": "Netflix",
            "charged_on": "2026-09-12",
            "expected": {"amount": "13.99", "currency": "USD"},
            "amount": {"amount": "13.99", "currency": "USD"},
            "confirmed": False,
            "outcome": None,
        }
    ]


def test_a_confirmed_charge_leaves_the_list(client, charge):
    confirm(client, charge)

    assert client.get("/api/v1/charges").json()["results"] == []


def test_a_deleted_subscriptions_charges_are_not_asked_about(client, charge, sub):
    operations.soft_delete(sub)

    assert client.get("/api/v1/charges").json()["results"] == []
    assert confirm(client, charge).status_code == 404


def test_another_users_charge_is_not_found(charge, categories):
    stranger = APIClient()
    stranger.force_authenticate(User.objects.create_user(email="other@example.com", password="x"))

    assert stranger.get("/api/v1/charges").json()["results"] == []
    assert confirm(stranger, charge).status_code == 404


def test_a_malformed_charge_id_is_not_found(client):
    assert client.post("/api/v1/charges/not-an-id/confirm", {}, format="json").status_code == 404


# Confirming ---------------------------------------------------------------------


def test_confirming_as_expected_changes_nothing_else(client, charge, sub, contract):
    response = confirm(client, charge)

    assert response.status_code == 200
    body = contract(response, "/charges/{charge_id}/confirm")
    assert body["confirmed"] is True
    assert body["outcome"] == Outcome.SAME
    sub.refresh_from_db()
    assert sub.billing_price == Decimal("13.99")
    assert not price_alerts(sub).exists()


def test_us19_a_higher_charge_raises_the_alert_and_takes_the_new_price(client, charge, sub):
    response = confirm(client, charge, amount="15.49")

    assert response.status_code == 200
    assert response.json()["outcome"] == Outcome.HIGHER
    assert response.json()["amount"] == {"amount": "15.49", "currency": "USD"}
    assert response.json()["expected"] == {"amount": "13.99", "currency": "USD"}

    sub.refresh_from_db()
    assert sub.billing_price == Decimal("15.49")
    # The revision is dated the day of the charge, so the chart steps there.
    change = PriceHistoryEvent.objects.get(
        subscription=sub, event_type=PriceHistoryEvent.EventType.PRICE_CHANGE
    )
    assert change.occurred_at == operations.at_start_of(LAST_BILL)
    assert change.old_value == {"price": "13.99", "currency": "USD"}
    assert change.new_value == {"price": "15.49", "currency": "USD"}

    alert = price_alerts(sub).get()
    assert alert.state == State.PENDING
    assert alert.due_at <= timezone.now()
    assert alert.dedupe_key == f"{sub.pk}:price_increase:2026-09-12"


def test_us19_a_lower_charge_takes_the_new_price_silently(client, charge, sub):
    response = confirm(client, charge, amount="12.99")

    assert response.json()["outcome"] == Outcome.LOWER
    sub.refresh_from_db()
    assert sub.billing_price == Decimal("12.99")
    assert not price_alerts(sub).exists()


def test_us19_editing_the_price_directly_never_alerts(sub):
    operations.update_subscription(sub, today=START, billing_price=Decimal("15.49"))

    assert not price_alerts(sub).exists()


def test_a_charge_can_only_be_confirmed_once(client, charge, sub):
    confirm(client, charge, amount="15.49")
    response = confirm(client, charge, amount="17.99")

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "charge_already_confirmed"
    sub.refresh_from_db()
    assert sub.billing_price == Decimal("15.49")
    assert price_alerts(sub).count() == 1


@pytest.mark.parametrize("amount", ["0", "-1.00", "abc"])
def test_an_impossible_amount_is_refused(client, charge, amount):
    response = confirm(client, charge, amount=amount)

    assert response.status_code == 400
    assert "amount" in response.json()["error"]["fields"]
    charge.refresh_from_db()
    assert charge.confirmed is False


def test_us19_an_older_bill_confirmed_higher_is_history_not_news(client, charge, sub, settings):
    # October's bill has gone by too, so September's is a backfilled past
    # event: it is recorded, but it neither alerts nor reprices from its date.
    settings.SUBTRAK_TODAY = date(2026, 10, 20)

    response = confirm(client, charge, amount="15.49")

    assert response.json()["outcome"] == Outcome.HIGHER
    assert not price_alerts(sub).exists()
    sub.refresh_from_db()
    assert sub.billing_price == Decimal("13.99")
    assert not PriceHistoryEvent.objects.filter(
        subscription=sub, event_type=PriceHistoryEvent.EventType.PRICE_CHANGE
    ).exists()


def test_a_price_edited_since_the_bill_is_not_overwritten(client, charge, sub):
    operations.update_subscription(sub, today=LATER, billing_price=Decimal("17.99"))

    response = confirm(client, charge, amount="15.49")

    # Still a rise over what January's bill expected, so still news.
    assert response.json()["outcome"] == Outcome.HIGHER
    assert price_alerts(sub).exists()
    sub.refresh_from_db()
    assert sub.billing_price == Decimal("17.99")


def test_us19_a_change_of_currency_since_the_bill_is_flagged_not_compared(client, charge, sub):
    operations.update_subscription(sub, today=LATER, billing_currency="EUR")

    response = confirm(client, charge, amount="20.00")

    assert response.json()["outcome"] == Outcome.NEEDS_REVIEW
    assert not price_alerts(sub).exists()
    sub.refresh_from_db()
    assert sub.billing_price == Decimal("13.99")
    assert sub.billing_currency == "EUR"


def test_a_cancelled_subscriptions_charge_is_recorded_without_an_alert(client, charge, sub):
    operations.cancel_subscription(sub, today=LATER)

    response = confirm(client, charge, amount="15.49")

    assert response.json()["outcome"] == Outcome.HIGHER
    assert not price_alerts(sub).exists()
    sub.refresh_from_db()
    assert sub.billing_price == Decimal("13.99")


# The user's rules (handoff 09 §5) -----------------------------------------------


def set_rules(owner, **fields):
    rules = rules_for(owner)
    for name, value in fields.items():
        setattr(rules, name, value)
    rules.save()


@pytest.mark.parametrize(
    ("threshold", "amount", "alerts"),
    [
        (Decimal("2.00"), "15.49", False),  # +1.50, under the threshold
        (Decimal("1.50"), "15.49", False),  # "changes > $1.50": equal is not more
        (Decimal("1.00"), "15.49", True),
        (None, "14.00", True),  # no threshold: any rise
    ],
)
def test_without_alert_on_any_change_only_rises_over_the_threshold_alert(
    client, owner, charge, sub, threshold, amount, alerts
):
    set_rules(owner, alert_on_any_price_change=False, price_alert_threshold=threshold)

    confirm(client, charge, amount=amount)

    assert price_alerts(sub).exists() is alerts


def test_alert_on_any_change_ignores_the_threshold(client, owner, charge, sub):
    set_rules(owner, alert_on_any_price_change=True, price_alert_threshold=Decimal("5.00"))

    confirm(client, charge, amount="14.49")

    assert price_alerts(sub).exists()


def test_the_threshold_is_in_the_display_currency(client, owner, charge, sub):
    # 1 USD = 0.5 GBP here, so a $1.50 rise is £0.75: under a £1.00 threshold.
    FxRate.objects.create(currency="GBP", rate=Decimal("0.5"), as_of=timezone.now())
    profile = settings_for(owner)
    profile.display_currency = "GBP"
    profile.save()
    set_rules(owner, alert_on_any_price_change=False, price_alert_threshold=Decimal("1.00"))

    confirm(client, charge, amount="15.49")

    assert not price_alerts(sub).exists()


def test_with_no_rate_for_the_threshold_the_alert_still_goes(client, owner, charge, sub):
    profile = settings_for(owner)
    profile.display_currency = "CHF"  # no stored rate
    profile.save()
    set_rules(owner, alert_on_any_price_change=False, price_alert_threshold=Decimal("100.00"))

    confirm(client, charge, amount="15.49")

    assert price_alerts(sub).exists()


# Living with the other reminders --------------------------------------------------


def test_editing_the_subscription_keeps_a_pending_price_alert(client, charge, sub):
    confirm(client, charge, amount="15.49")
    sub.refresh_from_db()

    operations.update_subscription(sub, today=LATER, notes="Family plan")

    assert price_alerts(sub).get().state == State.PENDING


def test_cancelling_the_subscription_cancels_a_pending_price_alert(client, charge, sub):
    confirm(client, charge, amount="15.49")
    sub.refresh_from_db()

    operations.cancel_subscription(sub, today=LATER)

    assert price_alerts(sub).get().state == State.CANCELLED


# Delivery ---------------------------------------------------------------------------


def test_us19_the_alert_names_the_old_and_new_amounts_and_the_change(client, charge, sub):
    confirm(client, charge, amount="15.49")
    # Only the price alert is due; the renewal reminders are for later.
    Reminder.objects.exclude(kind=Kind.PRICE_INCREASE).update(
        due_at=timezone.now() + timedelta(days=1)
    )

    notification_tasks.dispatch_due_reminders()

    note = Notification.objects.get(subscription=sub)
    assert note.kind == Kind.PRICE_INCREASE
    assert note.title == "Netflix price increase"
    assert note.body == "Charged $15.49 on Sep 12, up from $13.99 (+10.7%)."
    assert price_alerts(sub).get().state == State.SENT


@pytest.mark.parametrize(
    ("old", "new", "expected"),
    [
        ("13.99", "15.49", "10.7"),
        ("10.00", "10.05", "0.5"),  # half up
        ("3.00", "4.00", "33.3"),
    ],
)
def test_the_change_is_a_percentage_to_one_decimal_place(old, new, expected):
    assert percent_change(Decimal(old), Decimal(new)) == Decimal(expected)
