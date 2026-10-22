from datetime import date
from itertools import islice

import pytest

from subscriptions.services.cycles import (
    Cycle,
    CycleChange,
    add_months,
    bill_dates,
    next_bill_date,
    nth_bill,
    schedule,
)

MONTHLY = Cycle("monthly")


def first(n, start, cycle, changes=()):
    return list(islice(schedule(start, cycle, changes), n))


def test_leap_day_yearly_clamps_to_feb_28_and_returns_to_feb_29():
    assert first(5, date(2024, 2, 29), Cycle("yearly")) == [
        date(2024, 2, 29),
        date(2025, 2, 28),
        date(2026, 2, 28),
        date(2027, 2, 28),
        date(2028, 2, 29),
    ]


def test_monthly_from_the_31st_keeps_the_31st_after_a_short_month():
    # Computed from the anchor, not stepped from the previous bill, which
    # would drift to Mar 28.
    assert first(4, date(2026, 1, 31), MONTHLY) == [
        date(2026, 1, 31),
        date(2026, 2, 28),
        date(2026, 3, 31),
        date(2026, 4, 30),
    ]


def test_monthly_from_the_31st_in_a_leap_year_lands_on_feb_29():
    assert first(2, date(2028, 1, 31), MONTHLY)[1] == date(2028, 2, 29)


@pytest.mark.parametrize(
    ("cycle", "second_bill"),
    [
        (Cycle("weekly"), date(2026, 1, 8)),
        (Cycle("monthly"), date(2026, 2, 1)),
        (Cycle("quarterly"), date(2026, 4, 1)),
        (Cycle("yearly"), date(2027, 1, 1)),
        (Cycle("custom", 10, "days"), date(2026, 1, 11)),
        (Cycle("custom", 2, "weeks"), date(2026, 1, 15)),
        (Cycle("custom", 2, "months"), date(2026, 3, 1)),
        (Cycle("custom", 2, "years"), date(2028, 1, 1)),
    ],
)
def test_every_cycle_steps_by_its_own_length(cycle, second_bill):
    assert nth_bill(date(2026, 1, 1), cycle, 1) == second_bill


def test_add_months_goes_backwards_across_a_year():
    assert add_months(date(2026, 1, 31), -2) == date(2025, 11, 30)


def test_a_bill_due_today_is_still_the_next_bill():
    assert next_bill_date(date(2026, 1, 12), MONTHLY, today=date(2026, 10, 12)) == date(
        2026, 10, 12
    )
    assert next_bill_date(date(2026, 1, 12), MONTHLY, today=date(2026, 10, 13)) == date(
        2026, 11, 12
    )


def test_next_bill_of_a_future_start_is_the_start():
    assert next_bill_date(date(2026, 12, 15), MONTHLY, today=date(2026, 10, 1)) == date(
        2026, 12, 15
    )


def test_cycle_change_mid_life_re_anchors_on_the_last_bill():
    # Monthly on the 10th, switched to quarterly on Apr 20: the last bill
    # under the old cycle is Apr 10, so the next one is Jul 10.
    changes = [CycleChange(date(2026, 4, 20), Cycle("quarterly"))]
    assert first(6, date(2026, 1, 10), MONTHLY, changes) == [
        date(2026, 1, 10),
        date(2026, 2, 10),
        date(2026, 3, 10),
        date(2026, 4, 10),
        date(2026, 7, 10),
        date(2026, 10, 10),
    ]
    assert next_bill_date(date(2026, 1, 10), MONTHLY, changes, today=date(2026, 4, 20)) == date(
        2026, 7, 10
    )


def test_shortening_the_cycle_skips_new_cycle_bills_before_the_change():
    # Monthly from Jan 1, weekly from Feb 15. Feb 8 is a weekly date counted
    # from Feb 1, but weekly billing had not started, so it is not a bill.
    changes = [CycleChange(date(2026, 2, 15), Cycle("weekly"))]
    assert list(bill_dates(date(2026, 1, 1), MONTHLY, changes, before=date(2026, 3, 15))) == [
        date(2026, 1, 1),
        date(2026, 2, 1),
        date(2026, 2, 15),
        date(2026, 2, 22),
        date(2026, 3, 1),
        date(2026, 3, 8),
    ]
    assert next_bill_date(date(2026, 1, 1), MONTHLY, changes, today=date(2026, 2, 2)) == date(
        2026, 2, 15
    )


def test_cycle_change_on_a_bill_day_keeps_that_bill_on_the_old_cycle():
    changes = [CycleChange(date(2026, 3, 10), Cycle("yearly"))]
    assert first(4, date(2026, 1, 10), MONTHLY, changes) == [
        date(2026, 1, 10),
        date(2026, 2, 10),
        date(2026, 3, 10),
        date(2027, 3, 10),
    ]


def test_cycle_change_before_the_first_bill_replaces_the_cycle():
    changes = [CycleChange(date(2026, 1, 1), Cycle("weekly"))]
    assert first(2, date(2026, 1, 10), MONTHLY, changes) == [date(2026, 1, 10), date(2026, 1, 17)]


def test_two_cycle_changes_apply_in_date_order():
    changes = [
        CycleChange(date(2026, 3, 15), Cycle("monthly")),
        CycleChange(date(2026, 1, 15), Cycle("weekly")),
    ]
    dates = first(12, date(2026, 1, 1), MONTHLY, changes)
    # Monthly until Jan 15, then weekly counted from the Jan 1 bill but only
    # from Jan 15 on (no Jan 8: weekly was not in effect yet), then monthly
    # again from the last weekly bill before Mar 15 (Mar 12).
    assert dates[:3] == [date(2026, 1, 1), date(2026, 1, 15), date(2026, 1, 22)]
    assert date(2026, 3, 12) in dates
    assert dates[dates.index(date(2026, 3, 12)) + 1] == date(2026, 4, 12)


def test_bill_dates_stops_before_the_given_day():
    assert list(bill_dates(date(2026, 1, 5), MONTHLY, before=date(2026, 3, 5))) == [
        date(2026, 1, 5),
        date(2026, 2, 5),
    ]


@pytest.mark.parametrize(
    "args",
    [
        ("fortnightly",),
        ("custom", 2, "fortnights"),
        ("custom", 0, "days"),
        ("custom", None, "days"),
        ("monthly", 2, None),
        ("weekly", None, "days"),
    ],
)
def test_invalid_cycles_are_rejected(args):
    with pytest.raises(ValueError):
        Cycle(*args)
