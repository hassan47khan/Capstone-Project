"""Billing cycles and bill dates (handoff 04 §2, §5). Pure Python: no Django.

Every bill date is computed from an anchor date as "anchor + k cycles", never
by stepping from the previous bill. Stepping drifts: Jan 31 -> Feb 28 -> Mar 28.
Computing from the anchor keeps the day: Jan 31 -> Feb 28 -> Mar 31.
"""

from collections.abc import Iterator, Sequence
from dataclasses import dataclass
from datetime import date, timedelta
from itertools import takewhile

CYCLES = ("weekly", "monthly", "quarterly", "yearly", "custom")
CUSTOM_UNITS = ("days", "weeks", "months", "years")

# Each cycle as a step of whole days or whole months.
_FIXED_STEPS = {
    "weekly": ("days", 7),
    "monthly": ("months", 1),
    "quarterly": ("months", 3),
    "yearly": ("months", 12),
}
_UNIT_STEPS = {
    "days": ("days", 1),
    "weeks": ("days", 7),
    "months": ("months", 1),
    "years": ("months", 12),
}


@dataclass(frozen=True)
class Cycle:
    kind: str
    count: int | None = None
    unit: str | None = None

    def __post_init__(self):
        if self.kind not in CYCLES:
            raise ValueError(f"Unknown billing cycle {self.kind!r}.")
        if self.kind == "custom":
            if self.unit not in CUSTOM_UNITS:
                raise ValueError(f"Unknown custom cycle unit {self.unit!r}.")
            if not isinstance(self.count, int) or self.count < 1:
                raise ValueError("A custom cycle needs a whole count of at least 1.")
        elif self.count is not None or self.unit is not None:
            raise ValueError("Only a custom cycle takes a count and unit.")

    def step(self) -> tuple[str, int]:
        """The cycle as ("days", n) or ("months", n)."""
        if self.kind == "custom":
            unit, size = _UNIT_STEPS[self.unit]
            return unit, size * self.count
        return _FIXED_STEPS[self.kind]


def add_months(day: date, months: int) -> date:
    """Same day-of-month `months` later, clamped to the end of a short month."""
    index = day.year * 12 + day.month - 1 + months
    year, month = divmod(index, 12)
    month += 1
    return date(year, month, min(day.day, _days_in_month(year, month)))


def _days_in_month(year: int, month: int) -> int:
    first_of_next = date(year + month // 12, month % 12 + 1, 1)
    return (first_of_next - timedelta(days=1)).day


def nth_bill(anchor: date, cycle: Cycle, k: int) -> date:
    unit, size = cycle.step()
    if unit == "days":
        return anchor + timedelta(days=size * k)
    return add_months(anchor, size * k)


@dataclass(frozen=True)
class CycleChange:
    """The cycle changed on `on`; bills after that date follow `cycle`."""

    on: date
    cycle: Cycle


def schedule(start: date, cycle: Cycle, changes: Sequence[CycleChange] = ()) -> Iterator[date]:
    """Every bill date from `start` (the first charge) onward, without end.

    `cycle` is the cycle the subscription started on. A cycle change re-anchors
    the schedule on the last bill on or before the change and counts whole new
    cycles from there, skipping any that fall before the change: monthly from
    Jan 1 switched to weekly on Feb 15 bills Jan 1, Feb 1, Feb 15, Feb 22, ...,
    never Feb 8, when the weekly cycle was not in effect yet.
    """
    pending = sorted(changes, key=lambda c: c.on)
    anchor, k = start, 0
    while True:
        due = nth_bill(anchor, cycle, k)
        if pending and pending[0].on < due:
            change = pending.pop(0)
            if k > 0:
                anchor = nth_bill(anchor, cycle, k - 1)
                k = 1
            cycle = change.cycle
            while nth_bill(anchor, cycle, k) < change.on:
                k += 1
            continue
        yield due
        k += 1


def bill_dates(
    start: date, cycle: Cycle, changes: Sequence[CycleChange] = (), *, before: date
) -> Iterator[date]:
    """Bill dates from `start` up to, not including, `before`."""
    return takewhile(lambda due: due < before, schedule(start, cycle, changes))


def next_bill_date(
    start: date, cycle: Cycle, changes: Sequence[CycleChange] = (), *, today: date
) -> date:
    """The first bill on or after `today`. A bill due today is still upcoming."""
    return next(due for due in schedule(start, cycle, changes) if due >= today)
