"""The real TrialShield (handoff 04 §6a, 11 §2.5), replacing the mock.

Shapes are unchanged: `mocks.trials()` and `mocks.trial_decision()` froze
them for the client in 04 slice 2, so this computes the same fields from the
signed-in user's own data instead of Alex's.

The arithmetic stays in `services/trials.py`, which is pure Python; this
module only reads, scopes and presents.
"""

from datetime import timedelta
from decimal import Decimal

from bson import ObjectId

from core.contract import not_found
from notifications.scheduling import reschedule_for_subscription

from . import operations, presenters
from .models import Subscription
from .presenters import money
from .services import trials as trial_math

Status = Subscription.Status
Decision = Subscription.TrialDecision

# Beyond this many days a trial is "far" rather than "later" (11 §2.5).
TRIAL_LATER_DAYS = 14


def is_pending(sub: Subscription, *, today) -> bool:
    """A trial that has not converted yet: never in a total (04 §6a)."""
    return (
        sub.status == Status.ACTIVE
        and sub.is_trial
        and sub.trial_ends_on is not None
        and sub.trial_ends_on >= today
    )


def _row(sub: Subscription, ctx, alert_days: int) -> dict:
    days_left = (sub.trial_ends_on - ctx.today).days
    length = sub.trial_length_days
    progress = trial_math.trial_progress(sub.trial_ends_on, length, today=ctx.today)
    if days_left <= alert_days:
        urgency = "soon"
    else:
        urgency = "later" if days_left <= TRIAL_LATER_DAYS else "far"
    return {
        "subscription_id": str(sub.pk),
        "name": sub.name,
        "category": presenters.category_ref(sub.category),
        "service_mark": ctx.marks.get(sub.name),
        "price": money(sub.billing_price, sub.billing_currency),
        **presenters.cycle_fields(sub.cycle),
        "trial_ends_on": sub.trial_ends_on,
        "trial_length_days": length,
        "days_left": days_left,
        "elapsed_days": min(max(length - days_left, 0), length),
        "progress": float(progress.quantize(Decimal("0.0001"))),
        "urgency": urgency,
        "at_risk": days_left <= alert_days and sub.trial_decision != Decision.KEEP,
        "decision": sub.trial_decision,
        "reminder_enabled": sub.trial_reminder_enabled,
        "reminder_on": sub.trial_ends_on - timedelta(days=alert_days),
    }


def trials_for(user, *, today, alert_days: int) -> dict:
    """Every unconverted trial of this user's, fewest days left first."""
    ctx = presenters.Context.for_user(user, today=today)
    pending = sorted(
        (s for s in Subscription.objects.filter(owner=user) if is_pending(s, today=today)),
        key=lambda s: (s.trial_ends_on, s.name),
    )
    results = [_row(sub, ctx, alert_days) for sub in pending]
    at_risk = [sub for sub, row in zip(pending, results, strict=True) if row["at_risk"]]
    charged = [ctx.convert(s.billing_price, s.billing_currency) for s in at_risk]
    return {
        "display_currency": ctx.currency,
        "alert_days_before": alert_days,
        "at_risk": {
            "count": len(at_risk),
            "amount": money(sum((c for c in charged if c is not None), Decimal(0)), ctx.currency),
        },
        "results": results,
    }


def decide(user, subscription_id: str, decision: str, *, today, alert_days: int) -> dict:
    """Record Keep it or Remind me (11 §2.5).

    "Keep it" stops the nagging -- it converts on its end date either way --
    and "Remind me" schedules the reminder. Both go through
    `reschedule_for_subscription`, so the pending rows follow the decision
    instead of being left behind.
    """
    if not ObjectId.is_valid(subscription_id):
        raise not_found()
    sub = Subscription.objects.filter(owner=user, pk=ObjectId(subscription_id)).first()
    if sub is None or not is_pending(sub, today=today):
        # 404 rather than 403, so another user's id cannot be probed.
        raise not_found()

    changes = {
        "trial_decision": decision,
        "trial_reminder_enabled": decision == Decision.REMIND,
    }
    operations.update_subscription(sub, today=today, **changes)
    reschedule_for_subscription(sub, today=today)
    return _row(sub, presenters.Context.for_user(user, today=today), alert_days)
