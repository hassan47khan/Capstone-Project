from datetime import date
from decimal import Decimal

import pytest

from subscriptions.services.trials import trial_progress, trial_started_on
from subscriptions.services.validation import (
    currency_precision_message,
    fits_currency,
    is_valid_price,
    looks_like_card_number,
)


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


@pytest.mark.parametrize(
    ("price", "currency", "fits"),
    [
        (Decimal("1000"), "JPY", True),
        (Decimal("1000.00"), "JPY", True),
        (Decimal("1000.50"), "JPY", False),
        (Decimal("9900.1"), "KRW", False),
        (Decimal("9.99"), "USD", True),
        (Decimal("9.999"), "USD", False),
        (Decimal("4.20"), "EUR", True),
        (Decimal("1.234"), "BHD", True),
    ],
)
def test_a_price_is_whole_minor_units_of_its_currency(price, currency, fits):
    assert fits_currency(price, currency) is fits


def test_the_precision_message_names_the_currency():
    assert currency_precision_message("JPY") == "Enter a whole number. JPY prices have no cents."
    assert currency_precision_message("USD") == "Use at most 2 decimal places for USD."
