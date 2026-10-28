from datetime import date, timedelta
from decimal import Decimal

import pytest
from django.core.exceptions import ValidationError
from django.utils import timezone

from accounts.models import NotificationRule, User, UserSettings, rules_for, settings_for
from subscriptions import operations
from subscriptions.models import (
    FxRate,
    PriceHistoryEvent,
    ServiceCatalogEntry,
    Subscription,
)
from subscriptions.services import money

D = Decimal
TODAY = date(2026, 10, 1)
Event = PriceHistoryEvent.EventType


@pytest.fixture
def owner(db):
    return User.objects.create_user(email="owner@example.com", password="x")


@pytest.fixture
def make(owner, categories):
    def make(**fields):
        defaults = {
            "owner": owner,
            "name": "Netflix",
            "billing_price": D("13.99"),
            "start_date": date(2026, 1, 12),
            "category": categories["entertainment"],
        }
        return operations.create_subscription(today=TODAY, **{**defaults, **fields})

    return make


def total(owner):
    subs = Subscription.objects.filter(owner=owner)
    return money.monthly_total(operations.line_items(subs, today=TODAY), "USD", {})


def history(sub):
    return list(PriceHistoryEvent.objects.filter(subscription=sub))


# Create ----------------------------------------------------------------------


def test_create_writes_one_created_event_and_computes_next_bill(make):
    sub = make(name="  Netflix  ")

    assert sub.name == "Netflix"
    assert sub.next_bill_date == date(2026, 10, 12)
    [event] = history(sub)
    assert event.event_type == Event.CREATED
    assert event.new_value["price"] == "13.99"
    assert event.new_value["category"] == "entertainment"


def test_next_bill_date_is_recomputed_not_trusted(make):
    sub = make(next_bill_date=date(2030, 1, 1))
    assert sub.next_bill_date == date(2026, 10, 12)


@pytest.mark.parametrize(
    ("fields", "field_in_error"),
    [
        ({"name": "   "}, "name"),
        ({"billing_price": D("0")}, "billing_price"),
        ({"billing_price": D("-1.00")}, "billing_price"),
        ({"category": None}, "category"),
        ({"payment_label": "4242 4242 4242 4242"}, "payment_label"),
        ({"billing_cycle": "custom"}, "billing_cycle"),
        ({"is_trial": True}, "trial_ends_on"),
    ],
)
def test_create_validates(make, fields, field_in_error):
    with pytest.raises(ValidationError) as error:
        make(**fields)
    assert field_in_error in error.value.message_dict
    assert not Subscription.all_objects.exists()


def test_price_error_uses_the_spec_message(make):
    with pytest.raises(ValidationError) as error:
        make(billing_price=D("0"))
    assert error.value.message_dict["billing_price"] == ["Enter a valid price greater than $0."]


def test_a_missing_start_date_is_reported_by_name(owner, categories):
    sub = Subscription(owner=owner, name="X", billing_price=D(1), category=categories["other"])
    with pytest.raises(ValidationError) as error:
        sub.clean()
    assert "start_date" in error.value.message_dict


# Update (what PATCH will call) -----------------------------------------------


@pytest.mark.parametrize(
    ("change", "event_type", "old", "new"),
    [
        (
            {"billing_price": D("15.49")},
            Event.PRICE_CHANGE,
            {"price": "13.99", "currency": "USD"},
            {"price": "15.49", "currency": "USD"},
        ),
        (
            {"category": "other"},
            Event.CATEGORY_CHANGE,
            {"category": "entertainment"},
            {"category": "other"},
        ),
        (
            {"billing_cycle": "yearly"},
            Event.CYCLE_CHANGE,
            {"billing_cycle": "monthly", "custom_cycle_count": None, "custom_cycle_unit": None},
            {"billing_cycle": "yearly", "custom_cycle_count": None, "custom_cycle_unit": None},
        ),
    ],
)
def test_each_tracked_change_writes_exactly_one_event(
    make, categories, change, event_type, old, new
):
    sub = make()
    if "category" in change:
        change = {"category": categories[change["category"]]}

    written = operations.update_subscription(sub, today=TODAY, **change)

    assert [e.event_type for e in written] == [event_type]
    assert [e.event_type for e in history(sub)] == [Event.CREATED, event_type]
    assert (written[0].old_value, written[0].new_value) == (old, new)


def test_a_currency_switch_at_the_same_price_is_a_currency_change(make):
    sub = make()

    written = operations.update_subscription(sub, today=TODAY, billing_currency="EUR")

    assert [(e.event_type, e.old_value, e.new_value) for e in written] == [
        (
            Event.CURRENCY_CHANGE,
            {"price": "13.99", "currency": "USD"},
            {"price": "13.99", "currency": "EUR"},
        )
    ]


def test_a_new_price_in_a_new_currency_switches_currency_then_price(make):
    sub = make()

    operations.update_subscription(
        sub, today=TODAY, billing_price=D("12.99"), billing_currency="EUR"
    )

    # Read back in history order: the price_change never crosses currencies.
    assert [(e.event_type, e.old_value, e.new_value) for e in operations._history(sub)[1:]] == [
        (
            Event.CURRENCY_CHANGE,
            {"price": "13.99", "currency": "USD"},
            {"price": "13.99", "currency": "EUR"},
        ),
        (
            Event.PRICE_CHANGE,
            {"price": "13.99", "currency": "EUR"},
            {"price": "12.99", "currency": "EUR"},
        ),
    ]


def test_a_price_change_from_before_currencies_takes_the_next_known_one(make):
    # Created in USD, a legacy 13.99 -> 15.49 (no currency), then a switch to EUR.
    sub = make()
    legacy = PriceHistoryEvent.objects.create(
        subscription=sub,
        event_type=Event.PRICE_CHANGE,
        occurred_at=timezone.now(),
        old_value={"price": "13.99"},
        new_value={"price": "15.49"},
    )
    sub.billing_price = D("15.49")
    sub.save()
    operations.update_subscription(sub, today=TODAY, billing_currency="EUR")

    sided = {e.pk: (old, new) for e, old, new in operations.price_events(sub, history(sub))}

    assert sided[legacy.pk] == ("USD", "USD")


def test_a_price_change_from_before_currencies_with_nothing_later_is_current(make):
    sub = make(billing_currency="EUR")
    legacy = PriceHistoryEvent.objects.create(
        subscription=sub,
        event_type=Event.PRICE_CHANGE,
        occurred_at=timezone.now(),
        old_value={"price": "13.99"},
        new_value={"price": "15.49"},
    )

    sided = {e.pk: (old, new) for e, old, new in operations.price_events(sub, history(sub))}

    assert sided[legacy.pk] == ("EUR", "EUR")


def test_total_spent_keeps_each_currency_apart(make):
    # Bills on the 12th: Jan-Jun in USD, then EUR from Jul 1 at a new price.
    sub = make()
    operations.update_subscription(
        sub,
        today=date(2026, 7, 1),
        at=operations.at_start_of(date(2026, 7, 1)),
        billing_price=D("12.99"),
        billing_currency="EUR",
    )

    assert operations.total_spent_to_date(sub, today=date(2026, 10, 13)) == {
        "USD": 6 * D("13.99"),
        "EUR": 4 * D("12.99"),
    }


def test_changing_all_three_writes_three_events_and_nothing_else_writes_none(make, categories):
    sub = make()

    assert operations.update_subscription(sub, today=TODAY, notes="family plan") == []
    assert operations.update_subscription(sub, today=TODAY, billing_price=D("13.99")) == []
    written = operations.update_subscription(
        sub,
        today=TODAY,
        billing_price=D("15.49"),
        category=categories["other"],
        billing_cycle="custom",
        custom_cycle_count=2,
        custom_cycle_unit="months",
    )

    assert sorted(e.event_type for e in written) == sorted(
        [Event.PRICE_CHANGE, Event.CATEGORY_CHANGE, Event.CYCLE_CHANGE]
    )
    assert len(history(sub)) == 4


def test_invalid_update_writes_no_event(make):
    sub = make()
    with pytest.raises(ValidationError):
        operations.update_subscription(sub, today=TODAY, billing_price=D("0"))
    assert len(history(sub)) == 1


def test_a_failed_history_write_rolls_the_change_back(make, monkeypatch):
    """The operations run in a real MongoDB transaction (replica set), so a
    subscription is never saved without its history event, or the reverse."""
    sub = make()

    def broken(**kwargs):
        raise RuntimeError("history write failed")

    monkeypatch.setattr(PriceHistoryEvent.objects, "create", broken)
    with pytest.raises(RuntimeError):
        operations.update_subscription(sub, today=TODAY, billing_price=D("15.49"))
    assert Subscription.objects.get(pk=sub.pk).billing_price == D("13.99")

    count = Subscription.objects.count()
    with pytest.raises(RuntimeError):
        make(name="Spotify")
    assert Subscription.objects.count() == count


def test_cycle_change_mid_life_recomputes_next_bill_date(make):
    # Monthly on the 12th since Jan; switched to quarterly on Apr 20. The last
    # monthly bill was Apr 12, so bills go Jul 12, Oct 12, Jan 12.
    sub = make()
    operations.update_subscription(
        sub,
        today=date(2026, 4, 20),
        at=operations.at_start_of(date(2026, 4, 20)),
        billing_cycle="quarterly",
    )
    assert sub.next_bill_date == date(2026, 7, 12)

    operations.refresh_next_bill_date(sub, today=date(2026, 10, 13))
    assert sub.next_bill_date == date(2027, 1, 12)
    # Spent: Jan-Apr monthly, then Jul 12 and Oct 12 quarterly.
    assert operations.total_spent_to_date(sub, today=date(2026, 10, 13)) == {"USD": 6 * D("13.99")}


def test_shortening_the_cycle_mid_life_counts_only_real_bills(make):
    # Monthly from Jan 1, switched to weekly on Feb 15: billed Jan 1, Feb 1,
    # then weekly from Feb 15. No Feb 8 charge.
    sub = make(start_date=date(2026, 1, 1), billing_price=D("10.00"))
    operations.update_subscription(
        sub,
        today=date(2026, 2, 15),
        at=operations.at_start_of(date(2026, 2, 15)),
        billing_cycle="weekly",
    )
    assert sub.next_bill_date == date(2026, 2, 15)

    assert operations.total_spent_to_date(sub, today=date(2026, 3, 15)) == {"USD": D("60.00")}
    operations.refresh_next_bill_date(sub, today=date(2026, 3, 9))
    assert sub.next_bill_date == date(2026, 3, 15)


# Cancel, delete, restore -----------------------------------------------------


def test_cancelled_drops_out_of_totals_and_keeps_its_history(make):
    keep = make(name="Spotify", billing_price=D("10.99"))
    sub = make()
    operations.update_subscription(sub, today=TODAY, billing_price=D("15.49"))
    assert total(sub.owner) == D("26.48")

    operations.cancel_subscription(sub, today=TODAY)

    assert total(sub.owner) == D("10.99")
    sub.refresh_from_db()
    assert sub.status == Subscription.Status.CANCELLED
    assert sub.next_bill_date is None
    assert [e.event_type for e in history(sub)] == [
        Event.CREATED,
        Event.PRICE_CHANGE,
        Event.CANCELLED,
    ]
    assert keep.status == Subscription.Status.ACTIVE
    # Cancelling stops the spending: no bills after the cancellation date.
    assert operations.total_spent_to_date(sub, today=date(2027, 1, 1)) == {"USD": 9 * D("13.99")}


def test_soft_delete_lowers_the_total_by_exactly_its_amount_and_restore_puts_it_back(
    make, categories
):
    make(name="Spotify", billing_price=D("10.99"))
    headspace = make(
        name="Headspace",
        billing_price=D("12.99"),
        category=categories["health-wellness"],
        billing_cycle="custom",
        custom_cycle_count=2,
        custom_cycle_unit="months",
    )
    before = total(headspace.owner)

    operations.soft_delete(headspace)

    assert before - total(headspace.owner) == D("6.495")
    assert not Subscription.objects.filter(pk=headspace.pk).exists()
    deleted = Subscription.all_objects.get(pk=headspace.pk)
    assert deleted.status == Subscription.Status.DELETED
    assert deleted.next_bill_date is None  # cleared like cancel; restore recomputes it
    assert len(history(headspace)) == 1  # history is kept

    operations.restore(Subscription.all_objects.get(pk=headspace.pk), today=TODAY)

    assert total(headspace.owner) == before
    restored = Subscription.objects.get(pk=headspace.pk)
    assert restored.status == Subscription.Status.ACTIVE
    assert restored.next_bill_date == date(2026, 11, 12)


def test_restore_after_cancel_then_delete_puts_back_cancelled(make):
    sub = make()
    operations.cancel_subscription(sub, today=TODAY)
    operations.soft_delete(sub)
    operations.soft_delete(sub)  # a second delete changes nothing

    operations.restore(sub, today=TODAY)
    operations.restore(sub, today=TODAY)  # nor does a second restore

    assert sub.status == Subscription.Status.CANCELLED
    assert sub.status_before_delete is None
    assert total(sub.owner) == 0


# Trials ----------------------------------------------------------------------


def test_trials_are_excluded_until_the_conversion_job_runs(make):
    make(name="Spotify", billing_price=D("10.99"))
    ends = TODAY + timedelta(days=2)
    trial = make(
        name="Hulu",
        billing_price=D("17.99"),
        start_date=ends,
        is_trial=True,
        trial_ends_on=ends,
        trial_length_days=31,
    )
    assert trial.next_bill_date == ends
    assert total(trial.owner) == D("10.99")

    assert operations.convert_due_trials(today=TODAY + timedelta(days=1)) == 0
    assert operations.convert_due_trials(today=ends) == 1

    trial.refresh_from_db()
    assert trial.is_trial is False
    assert total(trial.owner) == D("10.99") + D("17.99")
    assert operations.convert_due_trials(today=ends) == 0


def test_cancelled_and_deleted_trials_are_never_converted(make):
    ends = TODAY + timedelta(days=2)
    trial = {"is_trial": True, "trial_ends_on": ends, "trial_length_days": 30, "start_date": ends}
    operations.cancel_subscription(make(name="A", **trial), today=TODAY)
    operations.soft_delete(make(name="B", **trial))

    assert operations.convert_due_trials(today=ends) == 0


def test_total_spent_skips_the_free_trial(make):
    ends = date(2026, 9, 10)
    sub = make(start_date=ends, is_trial=True, trial_ends_on=ends, trial_length_days=30)
    operations.convert_due_trials(today=ends)
    assert operations.total_spent_to_date(sub, today=TODAY) == {"USD": D("13.99")}


# FX and the remaining reads -------------------------------------------------


def test_fx_rates_always_include_the_base_currency(db):
    assert operations.fx_rates() == {"USD": D(1)}
    FxRate.objects.create(currency="EUR", rate=D("0.9177"), as_of=operations.at_start_of(TODAY))
    assert operations.fx_rates() == {"USD": D(1), "EUR": D("0.9177")}


def test_line_items_skip_what_does_not_count(make):
    make(name="A")
    operations.cancel_subscription(make(name="B"), today=TODAY)
    [item] = operations.line_items(Subscription.all_objects.all(), today=TODAY)
    assert item == money.LineItem(D("13.99"), "USD", "entertainment")


def test_string_forms(make, owner):
    sub = make()
    fx = FxRate.objects.create(
        currency="EUR", rate=D("0.9177"), as_of=operations.at_start_of(TODAY)
    )
    entry = ServiceCatalogEntry.objects.create(
        name="Netflix",
        default_price=D("15.49"),
        category=sub.category,
        brand_hex="#e50914",
        tint_hex="#ffecee",
        mark="N",
    )
    assert str(sub) == "Netflix"
    assert str(sub.category) == "Entertainment"
    assert str(entry) == "Netflix"
    assert str(fx) == "USD->EUR 0.9177"
    assert str(history(sub)[0]) == f"created @ {history(sub)[0].occurred_at:%Y-%m-%d}"
    assert str(settings_for(owner)) == "settings for owner@example.com"
    assert str(rules_for(owner)) == "notification rules for owner@example.com"


def test_settings_and_rules_are_one_per_user_with_spec_defaults(owner):
    settings = settings_for(owner)
    rules = rules_for(owner)

    assert settings_for(owner).pk == settings.pk
    assert rules_for(owner).pk == rules.pk
    assert UserSettings.objects.count() == NotificationRule.objects.count() == 1
    assert settings.display_currency == "USD"
    assert settings.theme == UserSettings.Theme.SYSTEM
    assert rules.trial_alert_days_before == 2
