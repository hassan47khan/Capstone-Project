"""The Analytics AI insight card (handoff 08 §2.0, governed by 11 §2.7(4)).

The rule: **the model receives computed aggregates and may only restate
them.** SubTrak's own analytics compute the facts; the model only words one
sentence about them; and every number in that sentence is checked against
the facts before it is shown. A sentence with a number that is not in the
facts is never shown -- the template sentence is, which is built from the
same facts and so cannot drift from them.

The three insights 08 §2.0 supports, in order of how much they matter to
the user this week: a price that went up, a trial about to charge, and the
category that takes the most. One at a time; none means no card.

Not "cancel X to save $Y, unused for 30 days": SubTrak has no usage data,
and the frame's example is a trial that charges nothing (08 §2.0).
"""

import hashlib
import json
import re
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal

from django.core.cache import cache

from subscriptions import analytics
from subscriptions.services.money import round_money

from . import circuit, llm

PRICE_INCREASE, TRIAL_CONVERTING, LARGEST_CATEGORY = (
    "price_increase",
    "trial_converting",
    "largest_category",
)
KINDS = (PRICE_INCREASE, TRIAL_CONVERTING, LARGEST_CATEGORY)

# A price change older than this is no longer news.
RECENT = timedelta(days=30)
# One model call per user per set of facts, not per screen open.
CACHE_SECONDS = 6 * 60 * 60
# A card holds one short sentence.
MAX_CHARS = 160

_SYMBOLS = {"USD": "$", "EUR": "€", "GBP": "£", "JPY": "¥", "INR": "₹"}

SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {"sentence": {"type": "string"}},
    "required": ["sentence"],
}

SYSTEM = """\
You write the one-sentence insight on a subscription tracker's Analytics card.

Use only the facts you are given, and write every number exactly as it appears \
in them. Add no other numbers, no dates of your own, no advice and no greeting. \
One plain sentence, under 120 characters."""


@dataclass(frozen=True)
class Facts:
    kind: str
    values: dict[str, str]  # every value pre-formatted, so the model copies, never computes
    subscription_id: str | None = None

    def as_json(self) -> str:
        return json.dumps({"kind": self.kind, **self.values}, sort_keys=True, ensure_ascii=False)


def _money(amount: Decimal, currency: str) -> str:
    value = round_money(amount, currency)
    symbol = _SYMBOLS.get(currency)
    return f"{symbol}{value}" if symbol else f"{value} {currency}"


def _day(on: date) -> str:
    return f"{on:%b} {on.day}"


def facts_for(user, ctx) -> Facts | None:
    """The single most useful fact about this user's spending, or None."""
    changes = analytics.price_changes(user, ctx, ctx.today - RECENT, include_upcoming=True)
    for item in changes["items"]:
        if item["kind"] == "price_change" and item["direction"] == "up" and item["annual_change"]:
            old, new = item["old_price"], item["new_price"]
            increase = Decimal(new["amount"]) - Decimal(old["amount"])
            per_year = item["annual_change"]
            return Facts(
                PRICE_INCREASE,
                {
                    "service": item["name"],
                    "increase": _money(increase, new["currency"]),
                    "date": _day(item["effective_on"]),
                    "per_year": _money(Decimal(per_year["amount"]), per_year["currency"]),
                },
                item["subscription_id"],
            )
    trials = [i for i in changes["items"] if i["kind"] == "trial_ending" and i["is_upcoming"]]
    if trials:
        trial = min(trials, key=lambda i: i["effective_on"])
        price = trial["new_price"]
        return Facts(
            TRIAL_CONVERTING,
            {
                "service": trial["name"],
                "price": _money(Decimal(price["amount"]), price["currency"]),
                "date": _day(trial["effective_on"]),
            },
            trial["subscription_id"],
        )
    categories = analytics.summary(user, ctx, "month")["categories"]
    if len(categories) >= 2:  # "100% of your spend" tells nobody anything
        top = max(categories, key=lambda c: c["percent"])
        return Facts(
            LARGEST_CATEGORY,
            {"category": top["category"]["display_name"], "percent": f"{top['percent']}%"},
        )
    return None


def template(facts: Facts) -> str:
    v = facts.values
    if facts.kind == PRICE_INCREASE:
        return f"{v['service']} rose {v['increase']} on {v['date']} — {v['per_year']} a year."
    if facts.kind == TRIAL_CONVERTING:
        return f"{v['service']}'s trial converts to {v['price']} on {v['date']}."
    return f"{v['category']} is {v['percent']} of your spend."


_NUMBER = re.compile(r"\d+(?:[.,]\d+)*")


def numbers(text: str) -> set[str]:
    return set(_NUMBER.findall(text))


def grounded(sentence: str, facts: Facts) -> bool:
    """11 §2.7(4): every number in the sentence appears in the facts."""
    return numbers(sentence) <= numbers(facts.as_json())


def _acceptable(raw: str, facts: Facts) -> bool:
    """One line, card-sized, and grounded. Checked on the raw answer: tidying
    the spacing first would hide a two-line reply."""
    return 0 < len(raw) <= MAX_CHARS and "\n" not in raw and grounded(raw, facts)


def _ask(facts: Facts) -> str | None:
    key = f"extraction:insight:{hashlib.sha256(facts.as_json().encode()).hexdigest()}"
    cached = cache.get(key)
    if cached:
        return cached
    try:
        reply = circuit.guarded(lambda: llm.call(SYSTEM, facts.as_json(), SCHEMA, max_tokens=2048))
    except (llm.LLMUnavailable, llm.LLMUnusable):
        return None
    raw = str(reply.data["sentence"]).strip()
    if not _acceptable(raw, facts):
        return None
    sentence = " ".join(raw.split())
    cache.set(key, sentence, CACHE_SECONDS)
    return sentence


def insight_for(user, ctx) -> dict:
    facts = facts_for(user, ctx)
    if facts is None:
        return {"insight": None}
    sentence = _ask(facts)
    return {
        "insight": {
            "kind": facts.kind,
            "text": sentence or template(facts),
            "subscription_id": facts.subscription_id,
            "generated": sentence is not None,
        }
    }
