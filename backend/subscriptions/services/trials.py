"""Free-trial arithmetic (handoff 04 §6a). Pure Python: no Django."""

from datetime import date, timedelta
from decimal import Decimal


def trial_started_on(trial_ends_on: date, trial_length_days: int) -> date:
    return trial_ends_on - timedelta(days=trial_length_days)


def trial_progress(trial_ends_on: date, trial_length_days: int, *, today: date) -> Decimal:
    """elapsed_days / trial_length_days, held between 0 and 1."""
    if trial_length_days < 1:
        raise ValueError("A trial lasts at least one day.")
    elapsed = (today - trial_started_on(trial_ends_on, trial_length_days)).days
    return min(max(Decimal(elapsed) / trial_length_days, Decimal(0)), Decimal(1))
