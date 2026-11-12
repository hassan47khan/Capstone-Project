"""The price-increase alert (spec section 8, US-19).

Event-driven, not scheduled: it is raised the moment a confirmed charge comes
in higher than the price on file (subscriptions/charges.py), as a reminder
due now, and the dispatcher delivers it like any other. Its `dedupe_key` is
`subscription:price_increase:charged_on`, so one bill can alert once.

Whether it is wanted at all is the user's Price changes rules (handoff 09
§5): "Alert on any change", or only rises above the threshold.
"""

from datetime import date
from decimal import ROUND_HALF_UP, Decimal

from django.utils import timezone

from accounts.models import rules_for
from subscriptions.services.money import label

from .models import Reminder
from .scheduling import dedupe_key, target_date_of


def wanted(charge, *, today: date) -> bool:
    """Whether the owner's rules want an alert for this rise.

    The threshold is shown in the display currency ("changes > $1.00", 09
    §5), so the rise is converted before comparing. With no rate to convert
    with, the alert goes out: a missed price rise costs the user money, an
    extra alert costs a glance.
    """
    from subscriptions.presenters import Context  # presenters imports scheduling

    rules = rules_for(charge.owner)
    if rules.alert_on_any_price_change or rules.price_alert_threshold is None:
        return True
    rise = Context.for_user(charge.owner, today=today).convert(
        charge.amount - charge.expected_amount, charge.currency
    )
    return rise is None or rise > rules.price_alert_threshold


def is_latest_bill(charge, *, today: date) -> bool:
    """Whether no newer bill of this subscription has gone by since.

    A bill older than the current cycle is a backfilled past event (spec
    section 9): it is recorded and asked about, but it never pushes. A
    notification today about a January bill would be news about nothing.
    """
    from subscriptions.operations import latest_bill_before  # operations imports scheduling

    return charge.charged_on == latest_bill_before(charge.subscription, today)


def raise_for(charge, *, today: date) -> Reminder | None:
    """Queue the alert for a charge that came in higher, if it is the latest
    bill and the rules want it."""
    if not is_latest_bill(charge, today=today) or not wanted(charge, today=today):
        return None
    reminder, _ = Reminder.objects.get_or_create(
        dedupe_key=dedupe_key(
            charge.subscription_id, Reminder.Kind.PRICE_INCREASE, charge.charged_on
        ),
        defaults={
            "user": charge.owner,
            "subscription": charge.subscription,
            "kind": Reminder.Kind.PRICE_INCREASE,
            "due_at": timezone.now(),
        },
    )
    return reminder


def percent_change(old: Decimal, new: Decimal) -> Decimal:
    """To one decimal place, half up (spec section 8)."""
    return ((new - old) / old * 100).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP)


def copy_for(reminder: Reminder) -> tuple[str, str]:
    """The title and body, e.g. "Netflix price increase" and
    "Charged $15.49 on Oct 12, up from $13.99 (+10.7%)."

    Old amount, new amount and the change to one decimal place, from the
    charge the alert was raised for.
    """
    from subscriptions.models import Charge

    name = reminder.subscription.name
    title = f"{name} price increase"
    charged_on = target_date_of(reminder)
    charge = Charge.objects.filter(
        subscription_id=reminder.subscription_id, charged_on=charged_on
    ).first()
    if charge is None or not charge.expected_amount:
        return title, f"The price of {name} has gone up."
    old, new = charge.expected_amount, charge.amount
    return title, (
        f"Charged {label(new, charge.currency)} on {charged_on:%b} {charged_on.day}, "
        f"up from {label(old, charge.currency)} (+{percent_change(old, new)}%)."
    )
