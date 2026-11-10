"""Bills that went by, and confirming what they really were (US-16, US-19).

The system design spec's rule: only a confirmed charge can raise a
price-increase alert. The roll-forward job records each bill as it passes at
the price on file; the user then confirms it, or corrects the amount, and a
correction upward is the price going up behind their back. Editing the price
directly is the user's own change, writes a revision and never alerts.

A charge is compared with what SubTrak expected it to be, the price on file
when it went by, never with the display currency, so an exchange-rate move
cannot look like a price rise.
"""

from datetime import date
from decimal import Decimal

from bson import ObjectId
from django.utils import timezone
from django_mongodb_backend import transaction

from core.contract import ApiError, not_found
from notifications import price_alerts

from . import operations
from .models import Charge, Subscription

Outcome = Charge.Outcome


def unconfirmed(user):
    """Charges still waiting for "Was the charge different?", newest first.

    A deleted subscription's are left out: there is nothing to ask about.
    """
    return (
        Charge.objects.filter(owner=user, confirmed=False)
        .exclude(subscription__status=Subscription.Status.DELETED)
        .select_related("subscription")
    )


def owned(user, charge_id: str) -> Charge:
    """The caller's charge, or 404, never 403, so ids cannot be probed."""
    if not ObjectId.is_valid(charge_id):
        raise not_found()
    charge = (
        Charge.objects.filter(owner=user, pk=ObjectId(charge_id))
        .exclude(subscription__status=Subscription.Status.DELETED)
        .select_related("subscription")
        .first()
    )
    if charge is None:
        raise not_found()
    return charge


def _outcome(charge: Charge, amount: Decimal) -> str:
    if charge.subscription.billing_currency != charge.currency:
        return Outcome.NEEDS_REVIEW
    if amount > charge.expected_amount:
        return Outcome.HIGHER
    if amount < charge.expected_amount:
        return Outcome.LOWER
    return Outcome.SAME


@transaction.atomic
def confirm(charge: Charge, *, amount: Decimal | None, today: date) -> Charge:
    """Record what the bill really was, and act on the difference.

    Higher: the subscription takes the new price (a revision dated the day
    of the charge) and the price-increase alert is raised, if the user's
    rules want it. Lower: the new price, silently. Same: nothing more. A
    subscription that has changed currency since is not compared at all and
    the charge is flagged for review.

    The price is only moved when it is still the one this charge expected,
    so a confirmation never undoes an edit the user made after the bill.
    """
    # Conditional, so two confirmations racing cannot both act.
    taken = Charge.objects.filter(pk=charge.pk, confirmed=False).update(
        confirmed=True, confirmed_at=timezone.now()
    )
    if not taken:
        raise ApiError(409, "charge_already_confirmed", "This charge is already confirmed.")

    amount = charge.expected_amount if amount is None else amount
    outcome = _outcome(charge, amount)
    Charge.objects.filter(pk=charge.pk).update(amount=amount, outcome=outcome)
    charge.refresh_from_db()

    sub = charge.subscription
    if (
        outcome in (Outcome.HIGHER, Outcome.LOWER)
        and sub.status == Subscription.Status.ACTIVE
        and sub.billing_price == charge.expected_amount
    ):
        operations.update_subscription(
            sub, today=today, at=operations.at_start_of(charge.charged_on), billing_price=amount
        )
    if outcome == Outcome.HIGHER and sub.status == Subscription.Status.ACTIVE:
        price_alerts.raise_for(charge, today=today)
    return charge
