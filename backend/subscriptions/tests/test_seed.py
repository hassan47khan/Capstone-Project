"""The seeded canonical dataset, end to end from the database (handoff 04 §4, §6)."""

from datetime import date, timedelta
from decimal import Decimal
from io import StringIO

import pytest
from django.core.management import call_command

from accounts.models import User
from subscriptions import operations, seed
from subscriptions.models import (
    Category,
    FxRate,
    PriceHistoryEvent,
    ServiceCatalogEntry,
    Subscription,
)
from subscriptions.seed import SEED_TODAY, load_demo
from subscriptions.services import money

D = Decimal
Event = PriceHistoryEvent.EventType


@pytest.fixture
def demo(db):
    return load_demo()


def user(email):
    return User.objects.get(email=email)


def items(email, today=SEED_TODAY):
    return operations.line_items(Subscription.objects.filter(owner=user(email)), today=today)


def total(email, currency="USD", today=SEED_TODAY):
    return money.monthly_total(items(email, today), currency, operations.fx_rates())


ALEX, JORDAN, SAM = (u.email for u in seed.DEMO_USERS)


def test_seeds_exactly_the_seven_system_categories(demo):
    assert sorted(Category.objects.values_list("slug", flat=True)) == sorted(
        slug for slug, _, _ in seed.SYSTEM_CATEGORIES
    )
    assert all(Category.objects.values_list("is_system", flat=True))
    assert Category.objects.get(slug="ai-tools").color_token_key == "aiTools"


def test_alex_total_from_the_database_is_129_20(demo):
    assert total(ALEX) == D("129.195")
    assert money.round_money(total(ALEX)) == D("129.20")


def test_alex_category_rollup_from_the_database(demo):
    rollup = money.category_rollup(items(ALEX), "USD", operations.fx_rates())
    assert [(r.category, money.round_money(r.monthly)) for r in rollup] == [
        ("productivity", D("54.99")),
        ("entertainment", D("40.47")),
        ("ai-tools", D("20.00")),
        ("health-wellness", D("6.50")),
        ("news-media", D("4.25")),
        ("cloud-storage", D("2.99")),
    ]
    assert sum(money.round_money(r.monthly) for r in rollup) == D("129.20")


def test_jordan_sam_and_family_from_the_database(demo):
    assert money.round_money(total(JORDAN)) == D("45.98")
    assert money.round_money(total(SAM)) == D("22.98")
    family = total(ALEX) + total(JORDAN) + total(SAM)
    assert money.round_money(family) == D("198.16")


def test_alex_in_euros_from_the_seeded_rate(demo):
    assert FxRate.objects.get(currency="EUR").rate == D("0.9177")
    eur = total(ALEX, "EUR")
    lines = [
        money.convert(i.monthly, i.currency, "EUR", operations.fx_rates()) for i in items(ALEX)
    ]

    assert money.round_money(eur, "EUR") == D("118.56")
    assert sum(money.round_to_total(lines, "EUR")) == D("118.56")
    assert sum(money.round_money(line, "EUR") for line in lines) == D("118.56")


def test_netflix_history_and_total_spent(demo):
    netflix = Subscription.objects.get(owner=user(ALEX), name="Netflix")
    events = list(PriceHistoryEvent.objects.filter(subscription=netflix))

    assert netflix.start_date == date(2024, 3, 12)
    assert netflix.next_bill_date == date(2026, 10, 12)
    assert netflix.billing_price == D("15.49")
    assert [(e.event_type, e.occurred_at.date()) for e in events] == [
        (Event.CREATED, date(2024, 3, 12)),
        (Event.CATEGORY_CHANGE, date(2025, 6, 12)),
        (Event.PRICE_CHANGE, date(2026, 10, 1)),
    ]
    assert events[0].new_value["price"] == "13.99"
    assert events[0].new_value["category"] == "other"
    assert events[1].new_value == {"category": "entertainment"}
    assert events[2].old_value == {"price": "13.99"}
    assert events[2].new_value == {"price": "15.49"}
    assert operations.total_spent_to_date(netflix, today=SEED_TODAY) == D("433.69")


def test_every_start_date_shares_its_day_with_the_next_bill(demo):
    subs = Subscription.objects.all()
    assert subs.count() == 17
    for sub in subs:
        assert sub.start_date.day == sub.next_bill_date.day, sub.name
        assert sub.next_bill_date >= SEED_TODAY, sub.name


def test_next_bills_match_the_spec_except_headspace(demo):
    alex = {s.name: s.next_bill_date for s in Subscription.objects.filter(owner=user(ALEX))}
    assert alex["Spotify"] == date(2026, 10, 4)
    assert alex["iCloud+"] == date(2026, 10, 1)  # due today is still upcoming
    assert alex["Adobe CC"] == date(2026, 10, 18)
    assert alex["New York Times"] == date(2026, 10, 8)
    assert alex["ChatGPT Plus"] == date(2026, 10, 20)
    assert alex["YouTube Premium"] == date(2026, 10, 15)
    # §4.2 says 2026-12-15, which an every-2-months schedule on the 15th
    # cannot produce at SEED_TODAY. Dec 15 is the bill after this one.
    assert alex["Headspace"] == date(2026, 10, 15)


def test_alex_trials_do_not_change_the_total_until_they_convert(demo):
    trials = Subscription.objects.filter(owner=user(ALEX), is_trial=True).order_by("trial_ends_on")
    assert [(t.name, t.trial_ends_on - SEED_TODAY, t.trial_length_days) for t in trials] == [
        ("Hulu", timedelta(days=2), 31),
        ("Notion AI", timedelta(days=9), 30),
        ("Duolingo Max", timedelta(days=21), 30),
    ]
    assert money.round_money(total(ALEX)) == D("129.20")

    hulu_ends = SEED_TODAY + timedelta(days=2)
    assert operations.convert_due_trials(today=hulu_ends) == 1
    assert total(ALEX, today=hulu_ends) == D("129.195") + D("17.99")


def test_catalog_has_the_fifteen_services_with_measured_colours(demo):
    catalog = {e.name: e for e in ServiceCatalogEntry.objects.all()}
    assert sorted(catalog) == sorted(e.name for e in seed.CATALOG)
    assert len(catalog) == 15

    netflix = catalog["Netflix"]
    assert (netflix.brand_hex, netflix.tint_hex, netflix.mark) == ("#e50914", "#ffecee", "N")
    assert catalog["Headspace"].tint_hex == "#f4ecff"
    assert catalog["Headspace"].custom_cycle_count == 2
    assert catalog["Hulu"].tint_hex == seed.derive_tint("#1ce783")
    assert all(len(e.mark) <= 2 for e in catalog.values())


@pytest.mark.parametrize(
    ("brand", "tint"),
    [("#000000", "#e0e0e0"), ("#ffffff", "#ffffff"), ("#e50914", "#fce1e3")],
)
def test_derived_tint_is_the_brand_twelve_percent_over_white(brand, tint):
    assert seed.derive_tint(brand) == tint


def test_seed_is_idempotent_and_leaves_other_users_alone(demo, categories):
    other = User.objects.create_user(email="someone@example.com")
    operations.create_subscription(
        today=SEED_TODAY,
        owner=other,
        name="Gym",
        billing_price=D("30.00"),
        start_date=date(2026, 1, 5),
        category=categories["health-wellness"],
    )
    counts = (
        Subscription.all_objects.count(),
        PriceHistoryEvent.objects.count(),
        ServiceCatalogEntry.objects.count(),
        Category.objects.count(),
        FxRate.objects.count(),
    )

    load_demo()

    assert (
        Subscription.all_objects.count(),
        PriceHistoryEvent.objects.count(),
        ServiceCatalogEntry.objects.count(),
        Category.objects.count(),
        FxRate.objects.count(),
    ) == counts
    assert User.objects.count() == 4
    assert Subscription.objects.filter(owner=other).count() == 1


def test_seed_also_removes_soft_deleted_demo_rows(demo):
    netflix = Subscription.objects.get(owner=user(ALEX), name="Netflix")
    operations.soft_delete(netflix)

    load_demo()

    assert Subscription.all_objects.filter(status=Subscription.Status.DELETED).count() == 0
    assert PriceHistoryEvent.objects.count() == 17 + 2  # one created each, plus Netflix's two


@pytest.mark.parametrize("anchor", [date(2027, 3, 20), date(2028, 2, 29), date(2026, 12, 31)])
def test_every_date_derives_from_the_anchor(db, anchor):
    load_demo(today=anchor)

    netflix = Subscription.objects.get(owner=user(ALEX), name="Netflix")
    price_change = PriceHistoryEvent.objects.get(
        subscription=netflix, event_type=Event.PRICE_CHANGE
    )
    assert price_change.occurred_at.date() == anchor
    assert netflix.next_bill_date.day == 12
    assert anchor <= netflix.next_bill_date < anchor + timedelta(days=32)
    assert operations.total_spent_to_date(netflix, today=anchor) == 31 * D("13.99")
    for sub in Subscription.objects.all():
        assert sub.next_bill_date >= anchor
        assert sub.start_date.day == sub.next_bill_date.day
    hulu = Subscription.objects.get(owner=user(ALEX), name="Hulu")
    assert hulu.trial_ends_on == anchor + timedelta(days=2)
    assert money.round_money(total(ALEX, today=anchor)) == D("129.20")


def test_seed_demo_command(db):
    out = StringIO()
    call_command("seed_demo", "--today", "2026-10-01", stdout=out)

    assert "anchored on 2026-10-01" in out.getvalue()
    assert "Alex Kim <alex.kim@example.com>: 11 subscriptions (3 on trial), $129.20/mo" in (
        out.getvalue()
    )
    assert "$45.98/mo" in out.getvalue()
    assert "$22.98/mo" in out.getvalue()
    # Only the command gives the demo users a password they can log in with.
    assert all(u.check_password(seed.DEMO_PASSWORD) for u in seed_users())


def test_loading_the_dataset_any_other_way_leaves_no_usable_password(demo):
    assert not any(u.has_usable_password() for u in seed_users())


def seed_users():
    return User.objects.filter(email__in=[u.email for u in seed.DEMO_USERS])


def test_convert_trials_command(demo):
    out = StringIO()
    call_command("convert_trials", "--today", "2026-10-10", stdout=out)
    assert out.getvalue().strip() == "Converted 2 trial(s)."

    call_command("convert_trials", stdout=out)  # defaults to today's date
    assert Subscription.objects.filter(is_trial=True).count() <= 1
