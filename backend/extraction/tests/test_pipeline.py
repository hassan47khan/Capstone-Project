"""The extraction pipeline, against handoff 11 §2.2 and §2.8.

Pure functions, so no database: an email and a model output go in, and what
the review screen would show comes out.
"""

from datetime import date
from decimal import Decimal

import pytest

from extraction import pipeline as p

RECEIVED = date(2026, 10, 1)
HULU = "Your free trial ends on Oct 19, 2026. After that, you will be charged $17.99 per month."


def email(text, subject="Your receipt", sender="Billing <billing@example.com>"):
    return p.Source(sender=sender, subject=subject, text=text, received_on=RECEIVED)


def output(**values):
    base = dict.fromkeys(p.FIELDS)
    base["is_subscription_email"] = True
    return {**base, **values}


def hulu_output(**changes):
    hulu = {
        "service_name": "Hulu",
        "price": "17.99",
        "currency": "USD",
        "billing_cycle": "monthly",
        "subscription_type": "trial",
        "trial_ends_on": "2026-10-19",
        "start_date": "2026-10-19",
        "category": "entertainment",
    }
    return output(**{**hulu, **changes})


def read(text, out, **kwargs):
    return p.extract(email(text, sender="Hulu <hulu@hulumail.com>"), out, **kwargs)


# The contract's shape ---------------------------------------------------------------------


def test_every_contract_field_is_present_even_when_blank():
    candidate = read(HULU, output())

    assert set(candidate.fields) == set(p.FIELDS)
    assert set(candidate.confidence) == set(p.SCORED)
    assert set(candidate.flagged) <= set(p.SCORED)


def test_hulus_exact_wording_extracts_exactly_with_nothing_flagged():
    candidate = read(HULU, hulu_output(), catalog={"hulu": "entertainment"})

    assert candidate.fields["price"] == "17.99"
    assert candidate.fields["trial_ends_on"] == "2026-10-19"
    assert candidate.flagged == []


def test_a_price_is_a_decimal_string_never_a_float():
    candidate = read(HULU, hulu_output())

    assert isinstance(candidate.fields["price"], str)


# Grounding (11 §2.2) ----------------------------------------------------------------------


def test_a_value_not_in_the_email_is_blanked_and_flagged():
    candidate = read(HULU, hulu_output(plan_name="Premium"))

    assert candidate.fields["plan_name"] is None
    assert candidate.confidence["plan_name"] is None
    assert "plan_name" in candidate.flagged


def test_a_price_not_in_the_email_is_blanked_not_shown_as_a_guess():
    candidate = read(HULU, hulu_output(price="19.99"))

    assert candidate.fields["price"] is None
    assert "price" in candidate.flagged


def test_the_right_day_in_the_wrong_year_is_not_grounded():
    candidate = read(HULU, hulu_output(trial_ends_on="2025-10-19"))

    assert candidate.fields["trial_ends_on"] is None
    assert "trial_ends_on" in candidate.flagged


def test_a_service_named_nowhere_in_the_email_is_blanked():
    candidate = read(HULU, hulu_output(service_name="Netflix"))

    assert candidate.fields["service_name"] is None
    assert "service_name" in candidate.flagged


def test_a_name_in_the_from_line_counts_as_in_the_email():
    candidate = read("Your trial ends soon.", output(service_name="Hulu"))

    assert candidate.fields["service_name"] == "Hulu"


def test_a_subscription_type_the_email_does_not_support_is_blanked():
    candidate = read(
        "Thanks for your payment of $9.99 per month.", output(subscription_type="trial")
    )

    assert candidate.fields["subscription_type"] is None


# Confidence is computed, not asked for (11 §2.2) ------------------------------------------


def test_confidence_comes_from_the_email_not_from_the_model():
    # The same model answer about two emails: quoted in one, worked out in
    # the other. Confidence follows the email, whatever the model thought.
    quoted = read(HULU, hulu_output())
    worked_out = read("Your free trial ends in 18 days. Then $17.99 per month.", hulu_output())

    assert quoted.confidence["trial_ends_on"] == p.VERBATIM
    assert worked_out.confidence["trial_ends_on"] == p.DERIVED


def test_a_confidence_the_model_volunteers_is_ignored():
    candidate = read(HULU, {**hulu_output(), "confidence": {"price": 0.12}})

    assert candidate.confidence["price"] == p.VERBATIM


def test_every_confidence_is_one_of_the_documented_levels():
    levels = {p.VERBATIM, p.CATALOG, p.AMBIGUOUS, p.INFERRED, p.DERIVED, p.DEFAULTED, None}
    levels.add(p.IMPLAUSIBLE)

    candidate = read(HULU, hulu_output(), catalog={"hulu": "entertainment"})

    assert set(candidate.confidence.values()) <= levels


@pytest.mark.parametrize(
    ("confidence", "band"),
    [(0.98, "green"), (0.90, "green"), (0.89, "amber"), (0.60, "amber"), (0.59, "flagged")],
)
def test_the_bands_are_the_review_frames(confidence, band):
    assert p.band(confidence) == band


def test_a_blank_field_has_no_band():
    assert p.band(None) is None


def test_anything_under_sixty_percent_is_flagged():
    candidate = read("Your free trial ends in 18 days. Then $17.99 per month.", hulu_output())

    assert {"trial_ends_on", "start_date"} <= set(candidate.flagged)


# Prices (11 §2.8) -------------------------------------------------------------------------


def test_billed_annually_is_yearly_at_twelve_times_and_both_flagged():
    text = "Thank you for your payment. Creative Cloud: $54.99/mo, billed annually."
    candidate = read(text, output(price="659.88", billing_cycle="yearly", currency="USD"))

    assert candidate.fields["billing_cycle"] == "yearly"
    assert candidate.fields["price"] == "659.88"
    assert {"price", "billing_cycle"} <= set(candidate.flagged)


def test_a_price_with_no_currency_gets_the_users_own_currency_flagged():
    text = "Your Dropbox Plus plan renews on October 15, 2026 at 11.99 per month."
    candidate = read(text, output(price="11.99", currency="USD"), default_currency="EUR")

    # Whatever the model guessed: the email does not say, so it is the user's.
    assert candidate.fields["currency"] == "EUR"
    assert "currency" in candidate.flagged


def test_a_trial_with_no_price_yet_leaves_the_price_for_the_user():
    text = "Your 7-day free trial of Calm Premium has started."
    candidate = read(text, output(service_name="Calm", subscription_type="trial"))

    assert candidate.fields["price"] is None
    assert "price" in candidate.flagged


def test_the_old_price_in_a_price_change_is_never_shown_green():
    # The eval caught this one: the cycle check looked past "$15.49 to" into
    # "$17.99 per month", and the old price came out at 0.98.
    text = "We're changing your price from $15.49 to $17.99 per month."
    candidate = read(text, output(price="15.49", currency="USD"))

    assert p.band(candidate.confidence["price"]) != "green"


def test_the_new_price_in_a_price_change_is_green():
    text = "We're changing your price from $15.49 to $17.99 per month."
    candidate = read(text, output(price="17.99", currency="USD"))

    assert candidate.confidence["price"] == p.VERBATIM


def test_competing_amounts_with_no_cycle_beside_them_are_amber():
    text = "Subtotal $9.99. Tax $0.80. Total $10.79. Thanks for your payment."
    candidate = read(text, output(price="10.79", currency="USD"))

    assert candidate.confidence["price"] == p.AMBIGUOUS


@pytest.mark.parametrize("price", ["0", "0.00", "20000.00"])
def test_an_impossible_price_is_flagged(price):
    candidate = read(f"Your plan costs ${price} per month.", output(price=price))

    assert "price" in candidate.flagged


def test_an_unreadable_price_is_blank():
    candidate = read(HULU, hulu_output(price="seventeen"))

    assert candidate.fields["price"] is None


@pytest.mark.parametrize(
    ("text", "price", "code"),
    [
        ("Crave Premium: CA$9.99 per month.", "9.99", "CAD"),
        ("YouTube Premium: 12,99 € per month.", "12.99", "EUR"),
        ("iCloud+: £0.99 per month.", "0.99", "GBP"),
        ("Amount: $4.00 USD per month.", "4.00", "USD"),
    ],
)
def test_the_currency_is_read_from_its_mark(text, price, code):
    candidate = read(text, output(price=price, currency=code))

    assert candidate.fields["currency"] == code
    assert candidate.confidence["currency"] == p.VERBATIM


def test_a_plain_dollar_sign_in_a_canadian_email_is_only_amber():
    candidate = read("Thanks from Canada! $9.99 per month.", output(price="9.99", currency="USD"))

    assert candidate.confidence["currency"] == p.AMBIGUOUS


def test_a_currency_that_contradicts_the_mark_is_blanked():
    candidate = read(HULU, hulu_output(currency="GBP"))

    assert candidate.fields["currency"] is None


def test_an_unsupported_currency_is_blanked():
    candidate = read(HULU, hulu_output(currency="XYZ"))

    assert candidate.fields["currency"] is None


def test_a_currency_with_no_price_is_kept_only_if_the_email_shows_it():
    text = "Your plan renews monthly. Prices start at €5.00."
    shown = read(text, output(currency="EUR"))
    missing = read(text, output(currency="GBP"))

    assert shown.fields["currency"] == "EUR"
    assert missing.fields["currency"] is None


def test_amounts_need_a_currency_mark_or_cents():
    found = p.amounts(p.normalise("Ends in 18 days, in 2026. Pay 9.99 or $5 or 1,299.00."))

    # "18" and "2026" are not money; the three amounts are.
    assert [m.amount for m in found] == [Decimal("9.99"), Decimal("5"), Decimal("1299")]


# Cycles -----------------------------------------------------------------------------------


def test_every_four_weeks_is_a_custom_cycle():
    text = "You were charged $4.00 and will be charged $4.00 every 4 weeks."
    candidate = read(
        text,
        output(
            price="4.00", billing_cycle="custom", custom_cycle_count=4, custom_cycle_unit="weeks"
        ),
    )

    assert candidate.fields["billing_cycle"] == "custom"
    assert (candidate.fields["custom_cycle_count"], candidate.fields["custom_cycle_unit"]) == (
        4,
        "weeks",
    )


def test_a_custom_cycle_the_email_does_not_state_is_blanked():
    candidate = read(
        "$4.00 every 4 weeks.",
        output(billing_cycle="custom", custom_cycle_count=2, custom_cycle_unit="weeks"),
    )

    assert candidate.fields["billing_cycle"] is None


def test_every_three_months_is_quarterly_not_custom():
    candidate = read("$29.99, renews every 3 months.", output(billing_cycle="quarterly"))

    assert candidate.fields["billing_cycle"] == "quarterly"
    assert candidate.confidence["billing_cycle"] == p.VERBATIM


def test_two_cycles_in_one_email_make_the_cycle_amber():
    candidate = read("$5 per month, or save with $50 per year.", output(billing_cycle="monthly"))

    assert candidate.confidence["billing_cycle"] == p.AMBIGUOUS


def test_an_unknown_cycle_is_invalid():
    candidate = read(HULU, hulu_output(billing_cycle="fortnightly"))

    assert candidate.fields["billing_cycle"] is None


# Dates ------------------------------------------------------------------------------------


@pytest.mark.parametrize(
    "written",
    ["Oct 19, 2026", "October 19, 2026", "19 October 2026", "2026-10-19", "Oct. 19th, 2026"],
)
def test_a_written_out_date_is_found_verbatim(written):
    text = f"Your free trial ends on {written}. Then $17.99 per month."

    assert read(text, hulu_output()).confidence["trial_ends_on"] == p.VERBATIM


def test_a_slashed_date_that_reads_two_ways_is_amber():
    text = "Thanks for your payment of $14.95 per month. Payment date: 10/01/2026."
    candidate = read(text, output(subscription_type="paid", start_date="2026-10-01"))

    assert candidate.confidence["start_date"] == p.AMBIGUOUS


def test_a_slashed_date_that_reads_one_way_is_verbatim():
    text = "Thanks for your payment of $14.95 per month. Payment date: 10/25/2026."
    candidate = read(text, output(subscription_type="paid", start_date="2026-10-25"))

    assert candidate.confidence["start_date"] == p.VERBATIM


def test_a_date_with_no_year_takes_the_next_one_and_is_amber():
    text = "Your free trial ends on Oct 19. Then $17.99 per month."

    assert read(text, hulu_output()).confidence["trial_ends_on"] == p.AMBIGUOUS


def test_a_yearless_date_already_well_past_rolls_to_next_year():
    found = p.dates(p.normalise("renews on jan 5"), RECEIVED)

    assert date(2027, 1, 5) in found.ambiguous


def test_a_date_years_away_is_implausible_and_flagged():
    text = "Your free trial ends on Oct 19, 2029. Then $17.99 per month."
    candidate = read(text, hulu_output(trial_ends_on="2029-10-19"))

    assert candidate.confidence["trial_ends_on"] == p.IMPLAUSIBLE
    assert "trial_ends_on" in candidate.flagged


def test_a_receipt_with_no_date_is_dated_the_day_it_arrived_and_flagged():
    text = "Thanks for your payment of $29.99. Renews every 3 months."
    candidate = read(text, output(subscription_type="paid", start_date="2026-10-01"))

    assert candidate.confidence["start_date"] == p.DERIVED
    assert "start_date" in candidate.flagged


def test_a_trial_starts_charging_the_day_it_ends_whatever_the_model_says():
    candidate = read(HULU, hulu_output(start_date="2026-10-01"))

    # A rule (how 04 §4 stores a trial), not the model's guess.
    assert candidate.fields["start_date"] == "2026-10-19"


def test_a_paid_subscription_has_no_trial_end():
    text = "Thanks for your payment. $9.99 per month. Charged Oct 1, 2026."
    candidate = read(text, output(subscription_type="paid", trial_ends_on="2026-10-01"))

    assert candidate.fields["trial_ends_on"] is None


def test_a_date_that_is_not_a_date_is_blank():
    candidate = read(HULU, hulu_output(trial_ends_on="next week"))

    assert candidate.fields["trial_ends_on"] is None


def test_a_trial_with_no_end_date_flags_it():
    candidate = read(HULU, hulu_output(trial_ends_on=None))

    assert "trial_ends_on" in candidate.flagged


# Category ---------------------------------------------------------------------------------


def test_the_catalog_decides_the_category_of_a_known_service():
    candidate = read(HULU, hulu_output(category="productivity"), catalog={"hulu": "entertainment"})

    assert candidate.fields["category"] == "entertainment"
    assert candidate.confidence["category"] == p.CATALOG


def test_an_unknown_service_takes_the_models_category_at_amber():
    candidate = read(HULU, hulu_output())

    assert candidate.confidence["category"] == p.INFERRED


def test_a_category_that_does_not_exist_is_blank():
    candidate = read(HULU, hulu_output(category="gaming"))

    assert candidate.fields["category"] is None


# Screening, before the model (11 §2.8) ----------------------------------------------------


def test_a_non_english_email_is_rejected():
    spanish = (
        "Hola Alex, gracias por tu pago. Tu plan de Netflix se renovará por 15,49 € al "
        "mes. Puedes cambiar tu plan en cualquier momento desde tu cuenta."
    )

    assert p.screen(email(spanish)) == p.NOT_ENGLISH


def test_a_terse_english_receipt_is_not_mistaken_for_another_language():
    # The eval caught this one too: few English filler words is not a foreign language.
    terse = "Receipt. ChatGPT Plus Subscription. Amount paid $20.00. Billing period: monthly."

    assert p.screen(email(terse)) is None


def test_an_email_with_nothing_recurring_in_it_is_rejected():
    order = "Your order of a USB-C cable will arrive Friday. Order total: $12.99."

    assert p.screen(email(order, subject="Your order")) == p.NOT_A_SUBSCRIPTION


def test_a_trial_confirmation_passes_the_screen():
    assert p.screen(email(HULU)) is None


# Duplicates (11 §2.8) ---------------------------------------------------------------------


@pytest.mark.parametrize(
    ("found", "existing"),
    [
        ("Hulu", "Hulu"),
        ("Disney+", "Disney Plus"),
        ("YouTube Premium", "YouTube"),
        ("hulu", "HULU"),
    ],
)
def test_a_service_already_tracked_is_offered_as_an_update(found, existing):
    assert p.find_duplicate(found, [("sub-1", existing)]) == "sub-1"


def test_an_unrelated_service_is_not_a_duplicate():
    assert p.find_duplicate("Hulu", [("sub-1", "Netflix")]) is None


def test_no_name_means_no_duplicate():
    assert p.find_duplicate(None, [("sub-1", "Hulu")]) is None


def test_the_candidate_carries_the_duplicate():
    candidate = read(HULU, hulu_output(), existing=[("sub-9", "Hulu")])

    assert candidate.duplicate_of == "sub-9"


# The fallback -----------------------------------------------------------------------------


def test_the_fallback_is_an_empty_add_form_with_the_required_fields_flagged():
    candidate = p.blank(email(HULU))

    assert all(value is None for value in candidate.fields.values())
    assert set(candidate.flagged) == set(p.REQUIRED)
