"""Shared plans (handoff 04 §6a, 11 §2.6): split a bill and track who has paid.

Replaces the demo-only mock (#172) with real storage, keeping the frozen
shapes. Three rules shape everything here:

  - Shares come from the money engine's `split_shares` (largest remainder,
    owner first), so they always sum to the price exactly. Nothing stores a
    share: it is worked out from the current price every time, so a price
    change re-splits the plan.
  - Shared plans never change the owner's totals. The full bill still leaves
    their account (11 §2.6); `outstanding` lives on this screen only.
  - Participants are named contacts, not SubTrak users. Payments are per
    billing period (YYYY-MM of the user's today): a new month starts with
    everyone but the owner pending again.
"""

from datetime import date, timedelta
from decimal import Decimal

from bson import ObjectId
from django.db import IntegrityError
from django.utils import timezone
from django_mongodb_backend import transaction
from rest_framework import status

from core.contract import ApiError, money, not_found, rounded
from core.tasks import queue_email

from . import presenters
from .models import SharedPlan, SharedPlanParticipant, SharedPlanPayment, Subscription
from .services import money as engine

REMINDER_INTERVAL = timedelta(hours=24)
MAX_PARTICIPANTS = 20


def _now():
    """Now, to the millisecond MongoDB keeps, so what a response says matches
    what the next read returns."""
    now = timezone.now()
    return now.replace(microsecond=now.microsecond // 1000 * 1000)


def period_of(today: date) -> str:
    return f"{today:%Y-%m}"


def _object_id(value: str) -> ObjectId:
    """A path id as an ObjectId, or 404: a malformed id is just "not found"."""
    if not ObjectId.is_valid(value):
        raise not_found()
    return ObjectId(value)


def _owned_subscription(user, subscription_id: str) -> Subscription:
    sub = Subscription.objects.filter(owner=user, pk=_object_id(subscription_id)).first()
    if sub is None:
        raise not_found()
    return sub


def _owned_plan(user, plan_id: str) -> SharedPlan:
    plan = (
        SharedPlan.objects.select_related("subscription")
        .filter(owner=user, pk=_object_id(plan_id))
        .first()
    )
    # A plan on a cancelled or deleted subscription is hidden, as in the list;
    # restoring the subscription brings it back.
    if plan is None or plan.subscription.status != Subscription.Status.ACTIVE:
        raise not_found()
    return plan


def _payments_for(plan: SharedPlan, period: str) -> list[tuple]:
    """(participant, payment) by position, creating this period's payments.

    The owner pays the provider, so their share is always paid; everyone
    else starts the period pending.
    """
    people = list(plan.participants.order_by("position"))
    existing = {
        p.participant_id: p
        for p in SharedPlanPayment.objects.filter(participant__in=people, period=period)
    }
    rows = []
    for person in people:
        payment = existing.get(person.pk) or _open_payment(person, period)
        rows.append((person, payment))
    return rows


def _open_payment(person: SharedPlanParticipant, period: str) -> SharedPlanPayment:
    """Create a participant's payment for a new period. Two requests can race to
    open the same month; the unique constraint keeps one, and the loser reads it."""
    try:
        return SharedPlanPayment.objects.create(
            participant=person,
            period=period,
            status=SharedPlanPayment.Status.PAID
            if person.is_owner
            else SharedPlanPayment.Status.PENDING,
            paid_at=_now() if person.is_owner else None,
        )
    except IntegrityError:
        return SharedPlanPayment.objects.get(participant=person, period=period)


def _shares(plan: SharedPlan, count: int) -> list[Decimal]:
    sub = plan.subscription
    return engine.split_shares(sub.billing_price, count, sub.billing_currency)


def present(plan: SharedPlan, rows: list[tuple], ctx: presenters.Context, period: str) -> dict:
    """The contract's SharedPlan."""
    sub = plan.subscription
    shares = _shares(plan, len(rows))
    participants = [
        {
            "id": str(person.pk),
            "payment_id": str(payment.pk),
            "display_name": person.display_name,
            "email": person.email,
            "position": person.position,
            "is_owner": person.is_owner,
            "share": rounded(share, sub.billing_currency),
            "status": payment.status,
            "paid_at": payment.paid_at,
            "last_reminded_at": payment.last_reminded_at,
        }
        for (person, payment), share in zip(rows, shares, strict=True)
    ]
    return {
        "id": str(plan.pk),
        "subscription_id": str(sub.pk),
        "name": sub.name,
        "service_mark": ctx.marks.get(sub.name),
        "price": money(sub.billing_price, sub.billing_currency),
        **presenters.cycle_fields(sub.cycle),
        "split_mode": plan.split_mode,
        "period": period,
        "participant_count": len(participants),
        "paid_count": sum(1 for p in participants if p["status"] == "paid"),
        "your_share": participants[0]["share"],
        "participants": participants,
    }


def _plan_dict(plan: SharedPlan, ctx: presenters.Context, period: str) -> dict:
    return present(plan, _payments_for(plan, period), ctx, period)


def shared_plans(user, *, today: date) -> dict:
    """GET /shared-plans: the caller's plans on active subscriptions, and what's owed."""
    ctx = presenters.Context.for_user(user, today=today)
    period = period_of(today)
    plans = (
        SharedPlan.objects.select_related("subscription").filter(owner=user).order_by("created_at")
    )
    results = [
        _plan_dict(plan, ctx, period)
        for plan in plans
        if plan.subscription.status == Subscription.Status.ACTIVE
    ]
    owed = Decimal(0)
    for plan in results:
        for person in plan["participants"]:
            if person["is_owner"] or person["status"] != "pending":
                continue
            converted = ctx.convert(Decimal(person["share"]["amount"]), person["share"]["currency"])
            # A currency with no rate can't be added in; it's left out, never guessed.
            if converted is not None:
                owed += converted
    return {
        "display_currency": ctx.currency,
        "outstanding": money(owed, ctx.currency),
        "results": results,
    }


def create_shared_plan(user, subscription_id: str, participants: list[dict], *, today: date):
    """POST /shared-plans: split one of the caller's subscriptions equally.

    The caller is added first (position 0) and absorbs any extra cent.
    404 for a subscription that isn't theirs; 409 `already_shared`.
    """
    sub = _owned_subscription(user, subscription_id)
    if sub.status != Subscription.Status.ACTIVE:
        raise ApiError(
            status.HTTP_400_BAD_REQUEST,
            "validation_error",
            "Only an active subscription can be shared.",
            fields={"subscription_id": ["Only an active subscription can be shared."]},
        )
    if SharedPlan.objects.filter(subscription=sub).exists():
        raise _already_shared()
    if len(participants) + 1 > MAX_PARTICIPANTS:
        raise ApiError(
            status.HTTP_400_BAD_REQUEST,
            "validation_error",
            f"A plan can be split at most {MAX_PARTICIPANTS} ways.",
            fields={"participants": [f"Add at most {MAX_PARTICIPANTS - 1} people."]},
        )
    # Every share must be at least one minor unit: $0.03 can't go 4 ways.
    unit = engine.minor_unit(sub.billing_currency)
    if sub.billing_price < unit * (len(participants) + 1):
        raise ApiError(
            status.HTTP_400_BAD_REQUEST,
            "validation_error",
            "That price is too small to split this many ways.",
            fields={"participants": ["That price is too small to split this many ways."]},
        )

    try:
        plan = _create_plan(user, sub, participants)
    except IntegrityError:
        # Lost a race with a simultaneous POST for the same subscription.
        raise _already_shared() from None
    ctx = presenters.Context.for_user(user, today=today)
    return _plan_dict(plan, ctx, period_of(today))


def _already_shared() -> ApiError:
    return ApiError(
        status.HTTP_409_CONFLICT, "already_shared", "This subscription is already shared."
    )


def _create_plan(user, sub: Subscription, participants: list[dict]) -> SharedPlan:
    with transaction.atomic():
        plan = SharedPlan.objects.create(owner=user, subscription=sub)
        SharedPlanParticipant.objects.create(
            plan=plan,
            display_name=(user.name or user.email)[:60],
            email=user.email,
            position=0,
            is_owner=True,
        )
        for position, person in enumerate(participants, start=1):
            SharedPlanParticipant.objects.create(
                plan=plan,
                display_name=person["display_name"].strip(),
                email=person.get("email") or None,
                position=position,
                is_owner=False,
            )
    return plan


def _payment(plan: SharedPlan, payment_id: str, period: str) -> tuple:
    """This period's (participant, payment) on `plan`, or 404."""
    rows = _payments_for(plan, period)
    wanted = _object_id(payment_id)
    for person, payment in rows:
        if payment.pk == wanted:
            return rows, person, payment
    raise not_found()


def remind(user, plan_id: str, payment_id: str, *, today: date) -> dict:
    """POST .../remind: email the participant, or hand the app a share-sheet message.

    409 `already_paid`; 429 `throttled`, one reminder per payment per 24 hours.
    """
    plan = _owned_plan(user, plan_id)
    period = period_of(today)
    rows, person, payment = _payment(plan, payment_id, period)
    if payment.status == SharedPlanPayment.Status.PAID:
        raise ApiError(status.HTTP_409_CONFLICT, "already_paid", "This share is already paid.")

    now = _now()
    if payment.last_reminded_at and now - payment.last_reminded_at < REMINDER_INTERVAL:
        available = payment.last_reminded_at + REMINDER_INTERVAL
        raise ApiError(
            status.HTTP_429_TOO_MANY_REQUESTS,
            "throttled",
            "You can remind them again tomorrow.",
            retry_after=int((available - now).total_seconds()) + 1,
        )

    shares = _shares(plan, len(rows))
    share = shares[[p.pk for p, _ in rows].index(person.pk)]
    sub = plan.subscription
    amount = rounded(share, sub.billing_currency)
    owner = user.name or user.email
    message = (
        f"Hi {person.display_name}, your share of {sub.name} for {today:%B %Y} "
        f"is {amount['amount']} {amount['currency']}."
    )
    channel = "share_sheet"
    if person.email:
        queue_email(
            f"{owner} sent a reminder about {sub.name}",
            f"{message}\n\nSent by {owner} with SubTrak.",
            [person.email],
        )
        channel = "email"

    payment.last_reminded_at = now
    payment.save(update_fields=["last_reminded_at"])
    return {
        "payment_id": str(payment.pk),
        "channel": channel,
        "message": message,
        "last_reminded_at": now,
        "next_reminder_available_at": now + REMINDER_INTERVAL,
    }


def mark_paid(user, plan_id: str, payment_id: str, *, today: date, paid: bool) -> dict:
    """POST .../paid: the owner records that someone paid them back (or undoes it).

    The owner's own share is always paid; trying to change it is 409.
    """
    plan = _owned_plan(user, plan_id)
    period = period_of(today)
    _rows, person, payment = _payment(plan, payment_id, period)
    if person.is_owner:
        raise ApiError(status.HTTP_409_CONFLICT, "owner_share", "Your own share is always paid.")
    payment.status = SharedPlanPayment.Status.PAID if paid else SharedPlanPayment.Status.PENDING
    payment.paid_at = _now() if paid else None
    payment.save(update_fields=["status", "paid_at"])
    ctx = presenters.Context.for_user(user, today=today)
    return _plan_dict(plan, ctx, period)
