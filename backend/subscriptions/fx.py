"""Exchange rates from Frankfurter (spec section 12, handoff 09 §2).

Frankfurter is free and keyless, which is why it was chosen; it quotes the
ECB's daily reference rates. Rates here are for **display only** -- a billing
amount is immutable in its billing currency (handoff 04 §3.3).

Two things about the v2 response shape are easy to get wrong, so they are
mapped from a real response saved as `tests/fixtures/frankfurter_rates.json`
rather than guessed:

* it is a flat array of `{date, base, quote, rate}`, not a `rates` object;
* **each row carries its own date.** Thinly traded quotes lag, so a single
  response really does mix 2026-10-28 and 2026-10-29. `as_of` is therefore
  per currency, not one timestamp for the batch.

The response also quotes crypto (BTC, ETH), metals (XAU, XAG) and the IMF's
XDR -- 170 quotes in all. SubTrak stores only `SUPPORTED_CURRENCIES`, or the
Settings currency picker would offer to price a subscription in Bitcoin.
"""

import json
import logging
import os
from dataclasses import dataclass
from datetime import UTC, date, datetime, time
from decimal import Decimal

import httpx

from core.http import build_client

from .models import FxRate
from .services import money

logger = logging.getLogger(__name__)

RATES_URL = "https://api.frankfurter.dev/v2/rates"
# Spec section 12's budget for one fetch. The 3 retries are Celery's, spread
# across the day (subscriptions/tasks.py), because a rate source that is down
# now is usually down for a while and the old rates stay usable meanwhile.
TIMEOUT_SECONDS = 10

# Re-exported so the management command can report it without importing money.
BASE = money.BASE_CURRENCY

# SubTrak's supported display currencies. No such set existed when this was
# written: handoff 09 §2 defers to `04`, `04` never defines one, and
# `billing_currency` accepts any ISO code. Chosen by Hassan on 2026-10-29 to
# match the 8-row SelectCurrency frame while covering the common cases; this
# tuple is the single place to change it.
SUPPORTED_CURRENCIES = (
    money.BASE_CURRENCY,  # USD
    "EUR",  # the 04 §4 seed and demo currency
    "GBP",
    "JPY",
    "CAD",
    "AUD",
    "CHF",
    "CNY",
    "INR",
    "BRL",
    "MXN",
)


@dataclass(frozen=True)
class Quote:
    """One currency's rate against USD, and the day it is for."""

    currency: str
    rate: Decimal
    as_of: date


def parse_rates(payload: str) -> list[Quote]:
    """Map a Frankfurter v2 body, keeping every rate exact.

    `parse_float=Decimal` is the point of taking the raw text rather than
    `response.json()`: the default float round-trip turns 0.89619 into
    0.89618999999999995, and these numbers go into a DecimalField that the
    money engine multiplies by. Section 2 of the handoff is explicit that
    money never passes through a float.
    """
    quotes = []
    for row in json.loads(payload, parse_float=Decimal):
        currency = row["quote"]
        # The base needs no stored rate: operations._rates() supplies 1.
        if currency not in SUPPORTED_CURRENCIES or currency == money.BASE_CURRENCY:
            continue
        quotes.append(
            Quote(
                currency=currency,
                rate=Decimal(row["rate"]),
                as_of=date.fromisoformat(row["date"]),
            )
        )
    return quotes


def fetch_rates(*, transport: httpx.BaseTransport | None = None) -> list[Quote]:
    """Ask Frankfurter for today's rates against USD.

    Raises on a transport error or a non-2xx, so the caller can keep the
    rates it already has (spec section 12).
    """
    if transport is None and os.environ.get("PYTEST_CURRENT_TEST"):
        # A live fetch during a test run would hit the network and, worse,
        # could replace the fixed EUR 0.9177 the seeded figures are built on.
        raise RuntimeError(
            "fetch_rates would call Frankfurter for real. Tests must pass a transport."
        )
    with build_client(timeout=TIMEOUT_SECONDS, transport=transport) as client:
        response = client.get(RATES_URL, params={"base": money.BASE_CURRENCY.lower()})
        response.raise_for_status()
        return parse_rates(response.text)


def store_rates(quotes: list[Quote]) -> int:
    """Upsert the quotes, and return how many rows were written.

    Upsert rather than replace: running this twice changes nothing, and a
    currency missing from one response keeps the rate it had instead of
    disappearing from everyone's totals.
    """
    for quote in quotes:
        FxRate.objects.update_or_create(
            currency=quote.currency,
            defaults={
                "rate": quote.rate,
                # The model stores a datetime; the source gives a day, so
                # this is midnight UTC on that day. Analytics reports it
                # back as a date (`rates_as_of`).
                "as_of": datetime.combine(quote.as_of, time.min, tzinfo=UTC),
            },
        )
    return len(quotes)


def refresh() -> int:
    """Fetch and store. The task and the management command both call this."""
    quotes = fetch_rates()
    written = store_rates(quotes)
    logger.info("Stored %s exchange rates.", written)
    return written
