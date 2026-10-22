from datetime import date
from decimal import Decimal

import pytest

from subscriptions.services.trials import trial_progress, trial_started_on
from subscriptions.services.validation import is_valid_price, looks_like_card_number


def test_trial_progress_is_elapsed_over_length():
    ends = date(2026, 10, 3)
    assert trial_started_on(ends, 31) == date(2026, 9, 2)
    assert trial_progress(ends, 31, today=date(2026, 10, 1)) == Decimal(29) / 31


def test_trial_progress_is_held_between_zero_and_one():
    ends = date(2026, 10, 31)
    assert trial_progress(ends, 30, today=date(2026, 9, 1)) == 0
    assert trial_progress(ends, 30, today=date(2026, 12, 1)) == 1


def test_trial_progress_rejects_a_zero_length():
    with pytest.raises(ValueError):
        trial_progress(date(2026, 10, 31), 0, today=date(2026, 10, 1))


@pytest.mark.parametrize(
    "label",
    ["4242424242424242", "4242 4242 4242 4242", "4242-4242-4242-4242", "Visa 4111111111111"],
)
def test_card_numbers_are_caught(label):
    assert looks_like_card_number(label)


@pytest.mark.parametrize("label", ["Visa ••4242", "Amex 1234", "Work card 2026", ""])
def test_display_labels_are_allowed(label):
    assert not looks_like_card_number(label)


@pytest.mark.parametrize(
    ("price", "valid"),
    [
        (Decimal("0.01"), True),
        (Decimal("0"), False),
        (Decimal("-1"), False),
        (Decimal("NaN"), False),
        (Decimal("Infinity"), False),
        (None, False),
        (1.5, False),
    ],
)
def test_price_must_be_a_positive_finite_decimal(price, valid):
    assert is_valid_price(price) is valid
