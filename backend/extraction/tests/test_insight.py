"""The Analytics AI insight card (08 §2.0, governed by 11 §2.7(4))."""

from datetime import date, timedelta
from unittest import mock

import pytest
from django.core.cache import cache
from django.utils import timezone
from rest_framework.test import APIClient

from extraction import insight, llm
from subscriptions import presenters
from subscriptions.seed import SEED_TODAY

INSIGHT = "/api/v1/analytics/insight"


@pytest.fixture
def ctx(alex):
    return presenters.Context.for_user(alex, today=SEED_TODAY)


@pytest.fixture
def worded(settings, monkeypatch):
    """A fake model that answers with whatever sentence the test sets."""
    settings.LLM_API_KEY = "sk-test"
    settings.EXTRACTION_ENABLED = True
    state = {"sentence": "", "calls": 0, "error": None}

    def call(system, user, schema, **kwargs):
        state["calls"] += 1
        state["facts"] = user
        if state["error"]:
            raise state["error"]
        return llm.Reply(data={"sentence": state["sentence"]}, model="claude-opus-5-5")

    monkeypatch.setattr(llm, "call", call)
    return state


# The facts ------------------------------------------------------------------------------------


@pytest.mark.django_db
def test_alexs_insight_is_the_netflix_rise_08_uses_as_its_example(alex, ctx):
    facts = insight.facts_for(alex, ctx)

    assert facts.kind == insight.PRICE_INCREASE
    # 08 §2.0, word for word, from computed data rather than typed in.
    assert insight.template(facts) == "Netflix rose $1.50 on Oct 1 — $18.00 a year."


def changes(*items):
    return {"display_currency": "USD", "items": list(items)}


def trial(name, on, price="17.99"):
    return {
        "kind": "trial_ending",
        "subscription_id": "sub-1",
        "name": name,
        "effective_on": on,
        "is_upcoming": True,
        "new_price": {"amount": price, "currency": "USD"},
    }


def test_without_a_price_rise_the_nearest_trial_to_convert_is_the_insight():
    later, sooner = trial("Disney+", date(2026, 10, 19)), trial("Hulu", date(2026, 10, 3))
    with mock.patch.object(insight.analytics, "price_changes", return_value=changes(later, sooner)):
        facts = insight.facts_for(None, mock.Mock(today=SEED_TODAY))

    assert insight.template(facts) == "Hulu's trial converts to $17.99 on Oct 3."


def category(name, percent):
    return {"category": {"display_name": name}, "percent": percent}


def test_otherwise_it_is_the_largest_category():
    summary = {"categories": [category("Entertainment", 31), category("Productivity", 43)]}
    with (
        mock.patch.object(insight.analytics, "price_changes", return_value=changes()),
        mock.patch.object(insight.analytics, "summary", return_value=summary),
    ):
        facts = insight.facts_for(None, mock.Mock(today=SEED_TODAY))

    assert insight.template(facts) == "Productivity is 43% of your spend."


def test_one_category_is_not_an_insight():
    summary = {"categories": [category("Productivity", 100)]}
    with (
        mock.patch.object(insight.analytics, "price_changes", return_value=changes()),
        mock.patch.object(insight.analytics, "summary", return_value=summary),
    ):
        assert insight.facts_for(None, mock.Mock(today=SEED_TODAY)) is None


def test_a_price_cut_is_not_an_insight_about_a_rise():
    cut = {
        "kind": "price_change",
        "direction": "down",
        "annual_change": {"amount": "-12.00", "currency": "USD"},
    }
    summary = {"categories": []}
    with (
        mock.patch.object(insight.analytics, "price_changes", return_value=changes(cut)),
        mock.patch.object(insight.analytics, "summary", return_value=summary),
    ):
        assert insight.facts_for(None, mock.Mock(today=SEED_TODAY)) is None


def test_money_in_a_currency_without_a_symbol_keeps_its_code():
    assert insight._money(insight.Decimal("9.99"), "CAD") == "9.99 CAD"


# Numeric grounding (11 §2.7(4)) ---------------------------------------------------------------


FACTS = insight.Facts(
    insight.PRICE_INCREASE,
    {"service": "Netflix", "increase": "$1.50", "date": "Oct 1", "per_year": "$18.00"},
)


@pytest.mark.parametrize(
    "sentence",
    [
        "Netflix went up $1.50 on Oct 1, which is $18.00 a year.",
        "Since Oct 1 Netflix costs $1.50 more: $18.00 over a year.",
    ],
)
def test_a_sentence_restating_the_facts_is_grounded(sentence):
    assert insight.grounded(sentence, FACTS)


@pytest.mark.parametrize(
    "sentence",
    [
        "Netflix rose $1.50 on Oct 1, or $19.00 a year.",  # a wrong figure
        "Netflix rose 10% on Oct 1.",  # a figure the facts never gave
        "Netflix rose $1.50 on Oct 1, 2026.",  # a year it was not given
    ],
)
def test_a_sentence_with_any_number_not_in_the_facts_is_not(sentence):
    assert not insight.grounded(sentence, FACTS)


def test_every_template_is_grounded_in_its_own_facts():
    examples = [
        FACTS,
        insight.Facts(
            insight.TRIAL_CONVERTING, {"service": "Hulu", "price": "$17.99", "date": "Oct 3"}
        ),
        insight.Facts(insight.LARGEST_CATEGORY, {"category": "Productivity", "percent": "43%"}),
    ]

    assert all(insight.grounded(insight.template(f), f) for f in examples)


@pytest.mark.django_db
@pytest.mark.parametrize(
    "said",
    [
        "Netflix rose $1.50 on Oct 1 — $18.00 a year, so consider cancelling.",
        "Netflix now costs $17.99, up $1.50 since Oct 1.",  # 17.99 is not a fact given
        "Cancel Duolingo Max to save $13.99 per month.",  # the frame's unshippable sentence
        "Netflix rose by 8.8% on Oct 1.",
    ],
)
def test_every_number_shown_on_the_card_appears_in_the_facts(alex, ctx, worded, said):
    # The test 11 §2.7(4) asks for, against what the model might say: whatever
    # it writes, every numeric token on the card comes from the input.
    worded["sentence"] = said
    cache.clear()

    shown = insight.insight_for(alex, ctx)["insight"]["text"]

    assert insight.numbers(shown) <= insight.numbers(worded["facts"])


# The model's part ------------------------------------------------------------------------------


@pytest.mark.django_db
def test_a_grounded_sentence_from_the_model_is_used(alex, ctx, worded):
    worded["sentence"] = "Netflix went up $1.50 on Oct 1 — that is $18.00 a year."

    card = insight.insight_for(alex, ctx)["insight"]

    assert card["text"] == worded["sentence"]
    assert card["generated"] is True


@pytest.mark.django_db
def test_an_ungrounded_sentence_falls_back_to_the_template(alex, ctx, worded):
    worded["sentence"] = "Netflix rose $2.00 on Oct 1."

    card = insight.insight_for(alex, ctx)["insight"]

    assert card["text"] == "Netflix rose $1.50 on Oct 1 — $18.00 a year."
    assert card["generated"] is False


@pytest.mark.django_db
@pytest.mark.parametrize("sentence", ["", "Netflix rose $1.50.\nOn Oct 1.", "Netflix " * 40])
def test_an_empty_split_or_overlong_sentence_falls_back(alex, ctx, worded, sentence):
    worded["sentence"] = sentence

    assert insight.insight_for(alex, ctx)["insight"]["generated"] is False


@pytest.mark.django_db
@pytest.mark.parametrize("error", [llm.LLMUnavailable("down"), llm.LLMUnusable("junk")])
def test_with_the_model_away_the_card_still_shows_the_template(alex, ctx, worded, error):
    worded["error"] = error

    card = insight.insight_for(alex, ctx)["insight"]

    assert card["text"].startswith("Netflix rose $1.50")
    assert card["generated"] is False


@pytest.mark.django_db
def test_the_same_facts_cost_one_model_call(alex, ctx, worded):
    worded["sentence"] = "Netflix went up $1.50 on Oct 1, or $18.00 a year."

    insight.insight_for(alex, ctx)
    insight.insight_for(alex, ctx)

    assert worded["calls"] == 1


@pytest.mark.django_db
def test_an_open_circuit_skips_the_model(alex, ctx, worded):
    cache.set("extraction:llm:open_until", timezone.now().timestamp() + 60)

    insight.insight_for(alex, ctx)

    assert worded["calls"] == 0


@pytest.mark.django_db
def test_the_model_is_given_facts_only(alex, ctx, worded):
    worded["sentence"] = "x"

    insight.insight_for(alex, ctx)

    # Pre-formatted values, so it copies figures and never computes one.
    assert '"per_year": "$18.00"' in worded["facts"]


# The endpoint -------------------------------------------------------------------------------------


@pytest.mark.django_db
def test_the_endpoint_returns_one_insight_in_the_contract_shape(api, worded, contract):
    worded["error"] = llm.LLMUnavailable("down")

    body = contract(api.get(INSIGHT), "/analytics/insight")

    assert body["insight"]["kind"] == "price_increase"
    assert body["insight"]["subscription_id"]


@pytest.mark.django_db
def test_with_nothing_to_say_the_card_is_hidden(api, alex, contract):
    with mock.patch.object(insight, "facts_for", return_value=None):
        body = contract(api.get(INSIGHT), "/analytics/insight")

    assert body == {"insight": None}


@pytest.mark.django_db
def test_the_insight_needs_a_token(db):
    assert APIClient().get(INSIGHT).status_code == 401


def test_an_insight_is_never_more_than_a_month_stale():
    assert insight.RECENT == timedelta(days=30)
