"""The money engine against the canonical dataset (handoff 04 §4, §6, §6a).

Pure tests: no database. The same figures are asserted again end to end, from
the seeded database, in test_seed.py.
"""

import random
from datetime import date
from decimal import Decimal

import pytest

from subscriptions.services import money
from subscriptions.services.cycles import Cycle, CycleChange
from subscriptions.services.money import (
    LineItem,
    PriceChange,
    category_rollup,
    convert,
    monthly_total,
    normalize_to_monthly,
    round_money,
    round_to_total,
    split_shares,
    total_spent,
)

D = Decimal
MONTHLY = Cycle("monthly")
EVERY_TWO_MONTHS = Cycle("custom", 2, "months")
RATES = {"USD": D(1), "EUR": D("0.9177")}

# §4.2: price, cycle, category.
ALEX = [
    ("15.49", MONTHLY, "entertainment"),  # Netflix
    ("10.99", MONTHLY, "entertainment"),  # Spotify
    ("54.99", MONTHLY, "productivity"),  # Adobe CC
    ("2.99", MONTHLY, "cloud-storage"),  # iCloud+
    ("4.25", MONTHLY, "news-media"),  # New York Times
    ("20.00", MONTHLY, "ai-tools"),  # ChatGPT Plus
    ("13.99", MONTHLY, "entertainment"),  # YouTube Premium
    ("12.99", EVERY_TWO_MONTHS, "health-wellness"),  # Headspace
]
JORDAN = ["17.99", "13.99", "10.00", "4.00"]
SAM = ["10.99", "11.99"]


def items(rows, currency="USD"):
    return [LineItem(normalize_to_monthly(D(p), c), currency, cat) for p, c, cat in rows]


def monthly_items(prices):
    return items([(p, MONTHLY, None) for p in prices])


def usd(line_items):
    return monthly_total(line_items, "USD", RATES)


# 3.1 Normalization -----------------------------------------------------------


@pytest.mark.parametrize(
    ("cycle", "expected"),
    [
        (Cycle("weekly"), D(52) / 12 * 12),
        (Cycle("monthly"), D(12)),
        (Cycle("quarterly"), D(4)),
        (Cycle("yearly"), D(1)),
        (Cycle("custom", 3, "days"), D(365) / 36 * 12),
        (Cycle("custom", 2, "weeks"), D(52) / 24 * 12),
        (Cycle("custom", 2, "months"), D(6)),
        (Cycle("custom", 2, "years"), D("0.5")),
    ],
)
def test_normalize_to_monthly_uses_the_spec_factors(cycle, expected):
    # $12 per cycle, so each factor is easy to read.
    assert normalize_to_monthly(D(12), cycle) == expected


def test_headspace_normalizes_to_6_495_unrounded_and_6_50_displayed():
    monthly = normalize_to_monthly(D("12.99"), EVERY_TWO_MONTHS)
    assert monthly == D("6.495")
    assert round_money(monthly) == D("6.50")


def test_normalize_refuses_a_float():
    with pytest.raises(TypeError):
        normalize_to_monthly(12.99, MONTHLY)


# 3.2 Aggregation -------------------------------------------------------------


def test_alex_total_is_129_20_from_a_raw_129_195():
    total = usd(items(ALEX))
    assert total == D("129.195")
    assert round_money(total) == D("129.20")


def test_rounding_line_items_early_gives_the_wrong_total():
    # Why §3.4 forbids rounding intermediate sums. (§3.4's own example does
    # not show it: Alex's lines rounded early also give 129.20.)
    three_headspaces = items([("12.99", EVERY_TWO_MONTHS, None)] * 3)
    assert round_money(usd(three_headspaces)) == D("19.49")
    assert sum(round_money(i.monthly) for i in three_headspaces) == D("19.50")


def test_category_rollup_matches_the_spec_and_sums_to_the_total():
    rollup = category_rollup(items(ALEX), "USD", RATES)

    assert [(r.category, round_money(r.monthly)) for r in rollup] == [
        ("productivity", D("54.99")),
        ("entertainment", D("40.47")),
        ("ai-tools", D("20.00")),
        ("health-wellness", D("6.50")),
        ("news-media", D("4.25")),
        ("cloud-storage", D("2.99")),
    ]
    assert sum(round_money(r.monthly) for r in rollup) == D("129.20")


def test_category_shares_match_the_spec():
    rollup = category_rollup(items(ALEX), "USD", RATES)
    shares = [round_money(r.percent) for r in rollup]

    assert shares == [D("42.56"), D("31.32"), D("15.48"), D("5.03"), D("3.29"), D("2.31")]
    # These are §4.3's figures, and they sum to 99.99, not 100. Kept as the
    # spec gives them; see the PR description.
    assert sum(shares) == D("99.99")
    # Unrounded, they are 100 to Decimal's 28 significant digits.
    assert abs(sum(r.percent for r in rollup) - 100) < D("1e-20")


def test_empty_rollup_has_no_rows_and_no_division_by_zero():
    assert category_rollup([], "USD", RATES) == []
    assert usd([]) == D(0)


def test_rollup_of_only_zero_amounts_has_zero_shares():
    rollup = category_rollup([LineItem(D(0), "USD", "other")], "USD", RATES)
    assert rollup[0].percent == D(0)


def test_jordan_sam_and_family_totals():
    alex, jordan, sam = usd(items(ALEX)), usd(monthly_items(JORDAN)), usd(monthly_items(SAM))

    assert round_money(jordan) == D("45.98")
    assert round_money(sam) == D("22.98")
    assert round_money(alex + jordan + sam) == D("198.16")


def test_annual_is_twelve_months():
    assert money.annual(D("6.495")) == D("77.940")


# 3.3 Currency ----------------------------------------------------------------


def test_alex_in_euros_is_118_56_and_agrees_with_the_line_items():
    alex = items(ALEX)
    total = monthly_total(alex, "EUR", RATES)
    lines = [convert(i.monthly, i.currency, "EUR", RATES) for i in alex]

    assert round_money(total, "EUR") == D("118.56")
    # Rounded one at a time, the lines happen to agree for this set...
    assert sum(round_money(line, "EUR") for line in lines) == D("118.56")
    # ...and rounded together they always do.
    assert round_to_total(lines, "EUR") == [
        D("14.22"),
        D("10.09"),
        D("50.46"),
        D("2.74"),
        D("3.90"),
        D("18.35"),
        D("12.84"),
        D("5.96"),
    ]


def test_converting_to_the_same_currency_is_a_no_op():
    assert convert(D("1.23"), "USD", "USD", {}) == D("1.23")


def test_converting_between_two_non_base_currencies_goes_through_the_base():
    rates = {"USD": D(1), "EUR": D("0.9"), "GBP": D("0.75")}
    assert convert(D("9"), "EUR", "GBP", rates) == D("7.5")


def test_a_missing_rate_is_an_error_not_a_silent_zero():
    with pytest.raises(money.MissingRate):
        convert(D(1), "USD", "CHF", RATES)


def test_rounding_each_line_alone_can_drift_by_more_than_one_minor_unit():
    # Why round_to_total exists: eight lines that each round down by 0.4 cents.
    lines = [D("1.004")] * 8
    assert sum(round_money(line) for line in lines) == D("8.00")
    assert round_money(sum(lines)) == D("8.03")
    assert sum(round_to_total(lines)) == D("8.03")


@pytest.mark.parametrize("seed", range(200))
def test_converted_total_never_drifts_from_the_converted_line_items(seed):
    rng = random.Random(seed)
    currency = rng.choice(["EUR", "GBP", "JPY", "KWD"])
    rates = {"USD": D(1), currency: D(rng.randint(1, 2_000_000)) / D(10_000)}
    cycles = [MONTHLY, Cycle("weekly"), Cycle("yearly"), EVERY_TWO_MONTHS, Cycle("quarterly")]
    subscription_set = [
        LineItem(
            normalize_to_monthly(D(rng.randint(1, 50_000)) / 100, rng.choice(cycles)), "USD", None
        )
        for _ in range(rng.randint(1, 25))
    ]
    exact = [convert(i.monthly, "USD", currency, rates) for i in subscription_set]

    displayed_total = round_money(monthly_total(subscription_set, currency, rates), currency)
    displayed_lines = round_to_total(exact, currency)
    unit = money.minor_unit(currency)

    assert abs(sum(displayed_lines) - displayed_total) <= unit
    assert sum(displayed_lines) == displayed_total
    for shown, value in zip(displayed_lines, exact, strict=True):
        assert abs(shown - value) < unit


@pytest.mark.parametrize(
    ("currency", "amount", "expected"),
    [
        ("USD", "0.005", "0.01"),
        ("USD", "0.0049", "0.00"),
        ("JPY", "1234.5", "1235"),
        ("KWD", "1.2345", "1.235"),
    ],
)
def test_round_money_is_half_up_to_the_currency_minor_unit(currency, amount, expected):
    assert round_money(D(amount), currency) == D(expected)


# 6a Trials -------------------------------------------------------------------


@pytest.mark.parametrize(
    ("status", "is_trial", "ends_on", "counts"),
    [
        ("active", False, None, True),
        ("cancelled", False, None, False),
        ("deleted", False, None, False),
        ("active", True, date(2026, 10, 3), False),  # still on trial
        ("active", True, date(2026, 10, 1), False),  # ends today: not charged yet
        ("active", True, date(2026, 9, 30), True),  # ended, job not run yet
        ("active", True, None, False),
        ("cancelled", True, date(2026, 9, 1), False),  # cancelled trials never count
    ],
)
def test_counts_toward_totals(status, is_trial, ends_on, counts):
    today = date(2026, 10, 1)
    assert money.counts_toward_totals(status, is_trial, ends_on, today=today) is counts


# Total spent -----------------------------------------------------------------


def test_netflix_total_spent_at_seed_today_is_433_69():
    spent = total_spent(
        date(2024, 3, 12),
        MONTHLY,
        D("13.99"),
        today=date(2026, 10, 1),
        price_changes=[PriceChange(date(2026, 10, 1), D("15.49"))],
    )
    assert spent == 31 * D("13.99") == D("433.69")


def test_total_spent_uses_the_new_price_from_the_first_bill_after_the_change():
    spent = total_spent(
        date(2024, 3, 12),
        MONTHLY,
        D("13.99"),
        today=date(2026, 10, 13),
        price_changes=[PriceChange(date(2026, 10, 1), D("15.49"))],
    )
    assert spent == D("433.69") + D("15.49")


def test_total_spent_stops_at_cancellation_and_skips_trial_bills():
    start = date(2026, 1, 1)
    assert total_spent(
        start, MONTHLY, D(10), today=date(2026, 12, 1), ended_on=date(2026, 3, 15)
    ) == D(30)
    assert total_spent(
        start, MONTHLY, D(10), today=date(2026, 4, 1), first_charge_on=date(2026, 2, 1)
    ) == D(20)


def test_total_spent_follows_a_cycle_change():
    spent = total_spent(
        date(2026, 1, 10),
        MONTHLY,
        D(10),
        today=date(2026, 12, 31),
        cycle_changes=[CycleChange(date(2026, 4, 20), Cycle("quarterly"))],
    )
    # Jan-Apr monthly (4), then Jul 10 and Oct 10.
    assert spent == D(60)


# 6a Shared plans -------------------------------------------------------------


def test_split_15_49_three_ways():
    assert split_shares(D("15.49"), 3) == [D("5.17"), D("5.16"), D("5.16")]


@pytest.mark.parametrize("seed", range(100))
def test_split_shares_always_sums_exactly(seed):
    rng = random.Random(seed)
    price = D(rng.randint(1, 100_000)) / 100
    n = rng.randint(2, 6)

    shares = split_shares(price, n)

    assert len(shares) == n
    assert sum(shares) == price
    assert max(shares) - min(shares) <= D("0.01")
    assert shares == sorted(shares, reverse=True)


def test_split_shares_rejects_bad_input():
    with pytest.raises(ValueError):
        split_shares(D("10.00"), 0)
    with pytest.raises(ValueError):
        split_shares(D("10.005"), 2)


def test_split_shares_in_a_currency_without_cents():
    assert split_shares(D(1000), 3, "JPY") == [D(334), D(333), D(333)]
