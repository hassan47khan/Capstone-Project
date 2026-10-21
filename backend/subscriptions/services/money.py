"""The money engine (handoff 04 §3, §6a). Pure Python: no Django, no database.

The invariant: no total is ever stored. Every total is derived here from the
subscription set at read time, in `Decimal`, and rounded only by `round_money`
at presentation. Never round an intermediate sum: Headspace's $6.495/month
rounded early is $6.50, so three of them would show $19.50 instead of $19.49.
"""

from collections import defaultdict
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from datetime import date
from decimal import ROUND_FLOOR, ROUND_HALF_UP, Decimal

from .cycles import Cycle, CycleChange, bill_dates

BASE_CURRENCY = "USD"
# ISO 4217 minor-unit exponents that differ from 2. Everything else has cents.
_EXPONENTS = {"JPY": 0, "KRW": 0, "VND": 0, "ISK": 0, "CLP": 0, "BHD": 3, "KWD": 3, "OMR": 3}

_DAYS_PER_YEAR = Decimal(365)
_WEEKS_PER_YEAR = Decimal(52)
_MONTHS_PER_YEAR = Decimal(12)


class MissingRate(LookupError):
    """No stored FX rate for a currency, so it cannot be converted or summed."""


def minor_unit(currency: str) -> Decimal:
    return Decimal(1).scaleb(-_EXPONENTS.get(currency, 2))


def round_money(amount: Decimal, currency: str = BASE_CURRENCY) -> Decimal:
    """Presentation rounding, half up to the currency's minor unit. Call it last."""
    return amount.quantize(minor_unit(currency), rounding=ROUND_HALF_UP)


def round_to_total(amounts: Sequence[Decimal], currency: str = BASE_CURRENCY) -> list[Decimal]:
    """Presentation rounding for line items shown next to their total.

    Rounding each line on its own can drift from the rounded total by up to
    half a minor unit per line (eight lines that each round down by 0.4 cents
    lose 3 cents). Instead every line is rounded down, and the minor units
    still missing from `round_money(sum(amounts))` go one each to the lines
    with the largest remainders (handoff 04 §4.6). The lines then sum to the
    total exactly, and each is within one minor unit of its exact value.
    """
    unit = minor_unit(currency)
    floors = [amount.quantize(unit, rounding=ROUND_FLOOR) for amount in amounts]
    missing = int(
        (round_money(sum(amounts, Decimal(0)), currency) - sum(floors, Decimal(0))) / unit
    )
    # Largest remainder first; ties keep their original order.
    by_remainder = sorted(range(len(amounts)), key=lambda i: amounts[i] - floors[i], reverse=True)
    for i in by_remainder[:missing]:
        floors[i] += unit
    return floors


# 3.1 -----------------------------------------------------------------------


def normalize_to_monthly(price: Decimal, cycle: Cycle) -> Decimal:
    """Monthly equivalent of `price` charged once per `cycle`, unrounded."""
    if not isinstance(price, Decimal):
        raise TypeError("Money must be a Decimal, never a float.")
    match cycle.kind, cycle.unit:
        case "weekly", _:
            return price * _WEEKS_PER_YEAR / _MONTHS_PER_YEAR
        case "monthly", _:
            return price
        case "quarterly", _:
            return price / 3
        case "yearly", _:
            return price / _MONTHS_PER_YEAR
        case "custom", "days":
            return price * _DAYS_PER_YEAR / (_MONTHS_PER_YEAR * cycle.count)
        case "custom", "weeks":
            return price * _WEEKS_PER_YEAR / (_MONTHS_PER_YEAR * cycle.count)
        case "custom", "months":
            return price / cycle.count
        case "custom", "years":
            return price / (_MONTHS_PER_YEAR * cycle.count)
    raise ValueError(f"Cannot normalize cycle {cycle!r}.")  # pragma: no cover


# 3.3 -----------------------------------------------------------------------


def convert(amount: Decimal, source: str, target: str, rates: Mapping[str, Decimal]) -> Decimal:
    """Display-only conversion, unrounded.

    `rates` holds units of each currency per one unit of the base currency
    (USD = 1). The billing amount itself is never changed.
    """
    if source == target:
        return amount
    try:
        return amount * rates[target] / rates[source]
    except KeyError as missing:
        raise MissingRate(missing.args[0]) from None


# 3.2 -----------------------------------------------------------------------


def counts_toward_totals(
    status: str, is_trial: bool, trial_ends_on: date | None, *, today: date
) -> bool:
    """Only active subscriptions count. A trial counts once it has converted (§6a)."""
    if status != "active":
        return False
    if is_trial and (trial_ends_on is None or trial_ends_on >= today):
        return False
    return True


@dataclass(frozen=True)
class LineItem:
    """One counted subscription: its monthly equivalent in its billing currency."""

    monthly: Decimal
    currency: str
    category: str | None


@dataclass(frozen=True)
class CategoryShare:
    category: str | None
    monthly: Decimal  # unrounded, display currency
    percent: Decimal  # unrounded, 0-100


def monthly_total(
    items: Iterable[LineItem], display_currency: str, rates: Mapping[str, Decimal]
) -> Decimal:
    """Sum of converted, unrounded line items. Round the result, not the lines."""
    return sum((convert(i.monthly, i.currency, display_currency, rates) for i in items), Decimal(0))


def category_rollup(
    items: Iterable[LineItem], display_currency: str, rates: Mapping[str, Decimal]
) -> list[CategoryShare]:
    """Per-category monthly totals and percentage shares, largest first."""
    by_category: dict[str | None, Decimal] = defaultdict(Decimal)
    for item in items:
        by_category[item.category] += convert(item.monthly, item.currency, display_currency, rates)
    total = sum(by_category.values(), Decimal(0))
    rows = [
        CategoryShare(category, amount, amount / total * 100 if total else Decimal(0))
        for category, amount in by_category.items()
    ]
    return sorted(rows, key=lambda row: row.monthly, reverse=True)


def annual(monthly: Decimal) -> Decimal:
    """Annual equivalent, also used for "saved per year" on cancellation."""
    return monthly * _MONTHS_PER_YEAR


# Total spent ----------------------------------------------------------------


@dataclass(frozen=True)
class PriceChange:
    """The price became `price` on `on`; bills on or after that date use it."""

    on: date
    price: Decimal


def total_spent(
    start: date,
    cycle: Cycle,
    initial_price: Decimal,
    *,
    today: date,
    price_changes: Sequence[PriceChange] = (),
    cycle_changes: Sequence[CycleChange] = (),
    ended_on: date | None = None,
    first_charge_on: date | None = None,
) -> Decimal:
    """What has actually been charged before `today`, in the billing currency.

    A bill due today is upcoming, not spent. `ended_on` is the cancellation
    date; `first_charge_on` skips bills inside a free trial.
    """
    stop = min(today, ended_on) if ended_on else today
    changes = sorted(price_changes, key=lambda c: c.on)
    spent = Decimal(0)
    for due in bill_dates(start, cycle, cycle_changes, before=stop):
        if first_charge_on and due < first_charge_on:
            continue
        price = initial_price
        for change in changes:
            if change.on <= due:
                price = change.price
        spent += price
    return spent


# Shared plans (§6a) ----------------------------------------------------------


def split_shares(price: Decimal, n: int, currency: str = BASE_CURRENCY) -> list[Decimal]:
    """Split `price` into `n` shares that sum to it exactly (largest remainder).

    Leftover minor units go one each to the first shares, so the plan owner
    (position 0) absorbs the first extra cent: $15.49 / 3 -> 5.17, 5.16, 5.16.
    """
    if n < 1:
        raise ValueError("A split needs at least one share.")
    unit = minor_unit(currency)
    units = price / unit
    if units != units.to_integral_value():
        raise ValueError(f"{price} is not a whole number of {currency} minor units.")
    base, extra = divmod(int(units), n)
    return [(base + (1 if i < extra else 0)) * unit for i in range(n)]
