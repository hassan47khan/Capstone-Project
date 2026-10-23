"""Mock behaviour behind the frozen API contract (handoff 04 slice 2, 12 §2 step 2).

Every view in this slice validates its request for real, calls one function in
this module, and serializes what it returns with the contract's serializers.
Slice 3 replaces these functions, one at a time, with real logic behind the same
shapes; nothing outside this module knows the data is mocked.

How the mock answers
  - The signed-in user is always Alex Kim from the canonical dataset (04 §4),
    and "today" is always SEED_TODAY (2026-10-01). The dataset is loaded on
    first use if it is not in the database already.
  - Every figure is computed from that data through the money engine and
    `subscriptions.operations`, never typed in: Alex's $129.20, the category
    rollup, EUR 118.56, trials left out of totals, trial progress.
  - Writes run the real operation, read the result, then put the data back as
    it was (`_discarded`), so a mock create or edit returns exactly what the
    real one will, and the dataset never drifts between calls.
  - Auth is real since slice 3 (accounts.auth, accounts.tokens).
  - Extractions, shared plans and Gmail have no models yet (they are the 11
    owner's, §6a). Their payloads are fixed here, dated from SEED_TODAY, with
    money computed by the engine.
"""

from contextlib import contextmanager
from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal

from bson import ObjectId
from django.utils import timezone

from accounts.models import User, rules_for
from core.contract import ApiError, money, not_found, rounded
from subscriptions import operations, presenters, seed
from subscriptions.models import Category, FxRate, PriceHistoryEvent, Subscription
from subscriptions.services import money as engine
from subscriptions.services import trials as trial_math
from subscriptions.services.cycles import Cycle, add_months, schedule

TODAY = seed.SEED_TODAY
REMINDER_INTERVAL = timedelta(hours=24)
# A trial this many days or fewer from its end is "later"; beyond it, "far" (11 §2.5).
TRIAL_LATER_DAYS = 14

Status = Subscription.Status
Decision = Subscription.TrialDecision


# The mock user --------------------------------------------------------------


def demo_user() -> User:
    """Alex Kim, loading the canonical dataset the first time it is needed."""
    user = User.objects.filter(email=seed.ALEX.email).first()
    if user is None:
        user = seed.load_demo(today=TODAY)[seed.ALEX.email]
    return user


def _context(user: User) -> presenters.Context:
    return presenters.Context.for_user(user, today=TODAY)


def _owned(user: User, subscription_id: str, *, include_deleted=False) -> Subscription:
    """The caller's subscription, or 404, never 403, so ids cannot be probed."""
    if not ObjectId.is_valid(subscription_id):
        raise not_found()
    manager = Subscription.all_objects if include_deleted else Subscription.objects
    sub = manager.filter(owner=user, pk=ObjectId(subscription_id)).first()
    if sub is None:
        raise not_found()
    return sub


_SAVED_FIELDS = [f.attname for f in Subscription._meta.concrete_fields if not f.primary_key]


@contextmanager
def _discarded(sub: Subscription | None = None):
    """Let a real write happen, then undo it: restore `sub`'s fields, drop the
    history events written meanwhile, and delete whatever the caller appends
    to the yielded list. (The local single-node Mongo reports no transaction
    support, so a rollback cannot do this.)"""
    saved = {name: getattr(sub, name) for name in _SAVED_FIELDS} if sub else None
    before = (
        list(PriceHistoryEvent.objects.filter(subscription=sub).values_list("pk", flat=True))
        if sub
        else []
    )
    created = []
    try:
        yield created
    finally:
        for obj in created:
            obj.delete()
        if sub is not None:
            PriceHistoryEvent.objects.filter(subscription=sub).exclude(pk__in=before).delete()
            Subscription.all_objects.filter(pk=sub.pk).update(**saved)


def _histories(subs) -> dict:
    by_sub = {sub.pk: [] for sub in subs}
    events = PriceHistoryEvent.objects.filter(subscription_id__in=list(by_sub))
    for event in events.order_by("occurred_at"):
        by_sub[event.subscription_id].append(event)
    return by_sub


def _price_on(sub, history, day: date) -> Decimal:
    price, changes = operations.price_timeline(sub, history)
    for change in changes:
        if change.on <= day:
            price = change.price
    return price


def _cycle_on(sub, history, day: date) -> Cycle:
    cycle, changes = operations.cycle_timeline(sub, history)
    for change in changes:
        if change.on <= day:
            cycle = change.cycle
    return cycle


def _pending_trial(sub: Subscription) -> bool:
    """A trial that has not converted yet: never in a total (04 §6a)."""
    return (
        sub.status == Status.ACTIVE
        and sub.is_trial
        and sub.trial_ends_on is not None
        and sub.trial_ends_on >= TODAY
    )


def _rates_as_of() -> date | None:
    latest = FxRate.objects.order_by("-as_of").first()
    return latest.as_of.date() if latest else None


# Subscriptions (04 §5) --------------------------------------------------------


def list_subscriptions(*, category: str | None = None, status: str | None = None) -> dict:
    user = demo_user()
    ctx = _context(user)
    subs = Subscription.objects.filter(owner=user)
    if category:
        found = Category.objects.filter(slug=category).first()
        subs = subs.filter(category=found) if found else subs.none()
    if status:
        subs = subs.filter(status=status)
    # Soonest bill first; cancelled ones (no next bill) after, by name.
    ordered = sorted(subs, key=lambda s: (s.next_bill_date is None, s.next_bill_date, s.name))
    rows = [presenters.subscription(sub, ctx) for sub in ordered]
    return {"count": len(rows), "next": None, "results": rows}


def get_subscription(subscription_id: str) -> dict:
    user = demo_user()
    return presenters.subscription_detail(_owned(user, subscription_id), _context(user))


def create_subscription(fields: dict) -> dict:
    user = demo_user()
    with _discarded() as created:
        sub = operations.create_subscription(today=TODAY, owner=user, **fields)
        created.append(sub)
        return presenters.subscription_detail(sub, _context(user))


def update_subscription(subscription_id: str, changes: dict) -> dict:
    user = demo_user()
    sub = _owned(user, subscription_id)
    with _discarded(sub):
        operations.update_subscription(sub, today=TODAY, **changes)
        return presenters.subscription_detail(sub, _context(user))


def cancel_subscription(subscription_id: str) -> dict:
    user = demo_user()
    sub = _owned(user, subscription_id)
    if sub.status == Status.CANCELLED:
        raise ApiError(409, "already_cancelled", "This subscription is already cancelled.")
    with _discarded(sub):
        operations.cancel_subscription(sub, today=TODAY)
        return presenters.subscription_detail(sub, _context(user))


def delete_subscription(subscription_id: str) -> None:
    sub = _owned(demo_user(), subscription_id)
    with _discarded(sub):
        operations.soft_delete(sub)


def restore_subscription(subscription_id: str) -> dict:
    user = demo_user()
    sub = _owned(user, subscription_id, include_deleted=True)
    with _discarded(sub):
        operations.restore(sub, today=TODAY)
        return presenters.subscription_detail(sub, _context(user))


def subscription_history(subscription_id: str) -> list[dict]:
    return presenters.history(_owned(demo_user(), subscription_id))


# Analytics (04 §5). Python loops for now; slice 3 moves these to pipelines. ----


def summary(period: str) -> dict:
    user = demo_user()
    ctx = _context(user)
    subs = list(Subscription.objects.filter(owner=user))
    counted = [s for s in subs if presenters.counts(s, TODAY)]
    convertible = [s for s in counted if ctx.can_convert(s.billing_currency)]

    items = operations.line_items(convertible, today=TODAY)
    total = engine.monthly_total(items, ctx.currency, ctx.rates)
    rollup = engine.category_rollup(items, ctx.currency, ctx.rates)
    amounts = engine.round_to_total([row.monthly for row in rollup], ctx.currency)
    percents = engine.round_to_whole_total([row.percent for row in rollup])
    categories = {c.slug: c for c in Category.objects.all()}

    trials = [s for s in subs if _pending_trial(s) and ctx.can_convert(s.billing_currency)]
    trial_items = [
        engine.LineItem(
            engine.normalize_to_monthly(s.billing_price, s.cycle), s.billing_currency, None
        )
        for s in trials
    ]
    return {
        "period": period,
        "display_currency": ctx.currency,
        "monthly_total": money(total, ctx.currency),
        "annual_total": money(engine.annual(total), ctx.currency),
        "active_count": len(convertible),
        "trial_count": len([s for s in subs if _pending_trial(s)]),
        "pending_trials_monthly": money(
            engine.monthly_total(trial_items, ctx.currency, ctx.rates), ctx.currency
        ),
        "unconverted_count": len(counted) - len(convertible),
        "rates_as_of": _rates_as_of(),
        "categories": [
            {
                "category": presenters.category_ref(categories.get(row.category)),
                "amount": rounded(amount, ctx.currency),
                "percent": percent,
                "share": str(engine.round_money(row.percent)),
            }
            for row, amount, percent in zip(rollup, amounts, percents, strict=True)
        ],
    }


def _month_end(first: date) -> date:
    return add_months(first, 1) - timedelta(days=1)


def _run_rate(subs, histories, as_of: date, ctx) -> Decimal:
    """Monthly recurring spend as it stood on `as_of`: what was active then, at
    the price and cycle in effect then."""
    items = []
    for sub in subs:
        if not ctx.can_convert(sub.billing_currency) or sub.start_date > as_of:
            continue
        if sub.cancelled_on and sub.cancelled_on <= as_of:
            continue
        if sub.is_trial and sub.trial_ends_on and sub.trial_ends_on >= as_of:
            continue
        history = histories[sub.pk]
        price = _price_on(sub, history, as_of)
        cycle = _cycle_on(sub, history, as_of)
        items.append(
            engine.LineItem(engine.normalize_to_monthly(price, cycle), sub.billing_currency, None)
        )
    return engine.monthly_total(items, ctx.currency, ctx.rates)


def spend_over_time(months: int) -> dict:
    user = demo_user()
    ctx = _context(user)
    subs = list(Subscription.objects.filter(owner=user))
    histories = _histories(subs)
    this_month = date(TODAY.year, TODAY.month, 1)
    # Always at least two, so the delta exists even when one month is asked for.
    firsts = [add_months(this_month, -k) for k in range(max(months, 2) - 1, -1, -1)]
    series = [
        (first, _run_rate(subs, histories, min(_month_end(first), TODAY), ctx)) for first in firsts
    ]

    current, previous = series[-1][1], series[-2][1]
    if current == previous:
        direction = "flat"
    else:
        direction = "up" if current > previous else "down"
    delta = None
    if previous:
        change = (current - previous) / previous * 100
        delta = str(change.quantize(Decimal("0.1"), rounding=ROUND_HALF_UP))
    last_month_end = _month_end(add_months(this_month, -1))
    return {
        "display_currency": ctx.currency,
        "months": [
            {"month": f"{first:%Y-%m}", "amount": money(amount, ctx.currency)}
            for first, amount in series[-months:]
        ],
        "current": money(current, ctx.currency),
        "previous": money(previous, ctx.currency),
        "delta_percent": delta,
        "direction": direction,
        "enough_history": any(
            s.start_date <= last_month_end for s in subs if not _pending_trial(s)
        ),
    }


def upcoming(start: date, end: date) -> dict:
    """Every bill from `start` to `end` inclusive: what was charged before today,
    and what will be after, each at the price in effect on its date."""
    user = demo_user()
    ctx = _context(user)
    subs = list(Subscription.objects.filter(owner=user))
    histories = _histories(subs)
    items = []
    for sub in subs:
        history = histories[sub.pk]
        initial_cycle, cycle_changes = operations.cycle_timeline(sub, history)
        for due in schedule(sub.start_date, initial_cycle, cycle_changes):
            if due > end or (sub.cancelled_on and due >= sub.cancelled_on):
                break
            if due < start:
                continue
            price = _price_on(sub, history, due)
            items.append(
                {
                    "subscription_id": str(sub.pk),
                    "name": sub.name,
                    "category": presenters.category_ref(sub.category),
                    "service_mark": ctx.marks.get(sub.name),
                    "bill_date": due,
                    "days_until": (due - TODAY).days,
                    "amount": ctx.display(price, sub.billing_currency),
                    "billing_amount": money(price, sub.billing_currency),
                    "is_trial": sub.is_trial and due == sub.trial_ends_on,
                }
            )
    items.sort(key=lambda item: (item["bill_date"], item["name"]))
    return {"display_currency": ctx.currency, "start": start, "end": end, "items": items}


def price_changes(
    start: date, *, include_upcoming: bool = False, subscription_id: str | None = None
) -> dict:
    """Price changes effective from `start`, newest first. With include_upcoming,
    future changes too, plus trials about to convert (06 §2.4)."""
    user = demo_user()
    ctx = _context(user)
    if subscription_id:
        subs = [_owned(user, subscription_id)]
    else:
        subs = list(Subscription.objects.filter(owner=user))
    by_pk = {sub.pk: sub for sub in subs}
    histories = _histories(subs)
    items = []
    for pk, history in histories.items():
        sub = by_pk[pk]
        for event in history:
            on = event.occurred_at.date()
            if event.event_type != PriceHistoryEvent.EventType.PRICE_CHANGE or on < start:
                continue
            if on > TODAY and not include_upcoming:
                continue
            old, new = Decimal(event.old_value["price"]), Decimal(event.new_value["price"])
            cycle = _cycle_on(sub, history, on)
            monthly = engine.normalize_to_monthly(new, cycle) - engine.normalize_to_monthly(
                old, cycle
            )
            items.append(
                {
                    "kind": "price_change",
                    "subscription_id": str(sub.pk),
                    "name": sub.name,
                    "service_mark": ctx.marks.get(sub.name),
                    "effective_on": on,
                    "is_upcoming": on > TODAY,
                    "old_price": money(old, sub.billing_currency),
                    "new_price": money(new, sub.billing_currency),
                    "monthly_change": ctx.display(monthly, sub.billing_currency),
                    "annual_change": ctx.display(engine.annual(monthly), sub.billing_currency),
                    "direction": "up" if new > old else "down",
                    "days_left": None,
                }
            )
    if include_upcoming:
        window = rules_for(user).trial_alert_days_before
        for sub in subs:
            if not _pending_trial(sub) or sub.trial_decision == Decision.KEEP:
                continue
            days_left = (sub.trial_ends_on - TODAY).days
            if days_left > window:
                continue
            items.append(
                {
                    "kind": "trial_ending",
                    "subscription_id": str(sub.pk),
                    "name": sub.name,
                    "service_mark": ctx.marks.get(sub.name),
                    "effective_on": sub.trial_ends_on,
                    "is_upcoming": sub.trial_ends_on > TODAY,
                    "old_price": None,
                    "new_price": money(sub.billing_price, sub.billing_currency),
                    "monthly_change": None,
                    "annual_change": None,
                    "direction": None,
                    "days_left": days_left,
                }
            )
    items.sort(key=lambda item: item["name"])
    items.sort(key=lambda item: item["effective_on"], reverse=True)
    return {"display_currency": ctx.currency, "items": items}


# Trials (04 §6a, 11 §2.5) -----------------------------------------------------


def _trial(sub: Subscription, ctx, alert_days: int) -> dict:
    days_left = (sub.trial_ends_on - TODAY).days
    length = sub.trial_length_days
    progress = trial_math.trial_progress(sub.trial_ends_on, length, today=TODAY)
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


def trials() -> dict:
    user = demo_user()
    ctx = _context(user)
    alert_days = rules_for(user).trial_alert_days_before
    pending = sorted(
        (s for s in Subscription.objects.filter(owner=user) if _pending_trial(s)),
        key=lambda s: (s.trial_ends_on, s.name),
    )
    results = [_trial(sub, ctx, alert_days) for sub in pending]
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


def trial_decision(subscription_id: str, decision: str) -> dict:
    user = demo_user()
    sub = _owned(user, subscription_id)
    if not _pending_trial(sub):
        raise not_found()
    changes = {"trial_decision": decision}
    if decision == Decision.REMIND:
        changes["trial_reminder_enabled"] = True
    with _discarded(sub):
        operations.update_subscription(sub, today=TODAY, **changes)
        return _trial(sub, _context(user), rules_for(user).trial_alert_days_before)


# Shared plans (04 §6a, 11 §2.6) ------------------------------------------------

SHARED_PLAN_ID = "6a0b00000000000000000001"
# id, payment id, and who: Alex owns Alex's Netflix and has paid the provider;
# Jordan has paid; Sam, with no email on file, has not (11 §2.6's frame).
_NETFLIX_SPLIT = (
    ("6a0b00000000000000000011", "6a0b00000000000000000021", seed.ALEX.name, seed.ALEX.email, True),
    (
        "6a0b00000000000000000012",
        "6a0b00000000000000000022",
        seed.JORDAN.name,
        seed.JORDAN.email,
        True,
    ),
    ("6a0b00000000000000000013", "6a0b00000000000000000023", seed.SAM.name, None, False),
)


def _plan(plan_id: str, sub: Subscription, people, ctx) -> dict:
    shares = engine.split_shares(sub.billing_price, len(people), sub.billing_currency)
    paid_at = operations.at_start_of(TODAY)
    participants = [
        {
            "id": pid,
            "payment_id": payment_id,
            "display_name": name,
            "email": email,
            "position": position,
            "is_owner": position == 0,
            "share": rounded(share, sub.billing_currency),
            "status": "paid" if paid else "pending",
            "paid_at": paid_at if paid else None,
            "last_reminded_at": None,
        }
        for position, ((pid, payment_id, name, email, paid), share) in enumerate(
            zip(people, shares, strict=True)
        )
    ]
    return {
        "id": plan_id,
        "subscription_id": str(sub.pk),
        "name": sub.name,
        "service_mark": ctx.marks.get(sub.name),
        "price": money(sub.billing_price, sub.billing_currency),
        **presenters.cycle_fields(sub.cycle),
        "split_mode": "equal",
        "period": f"{TODAY:%Y-%m}",
        "participant_count": len(participants),
        "paid_count": sum(1 for p in participants if p["status"] == "paid"),
        "your_share": participants[0]["share"],
        "participants": participants,
    }


def _netflix_plan(user, ctx) -> dict:
    netflix = Subscription.objects.get(owner=user, name="Netflix")
    return _plan(SHARED_PLAN_ID, netflix, _NETFLIX_SPLIT, ctx)


def shared_plans() -> dict:
    user = demo_user()
    ctx = _context(user)
    plan = _netflix_plan(user, ctx)
    owed = [
        ctx.convert(Decimal(p["share"]["amount"]), p["share"]["currency"])
        for p in plan["participants"]
        if not p["is_owner"] and p["status"] == "pending"
    ]
    return {
        "display_currency": ctx.currency,
        # Shares never change the user's totals (11 §2.6); this figure lives here only.
        "outstanding": money(sum((o for o in owed if o is not None), Decimal(0)), ctx.currency),
        "results": [plan],
    }


def create_shared_plan(subscription_id: str, participants: list[dict]) -> dict:
    user = demo_user()
    sub = _owned(user, subscription_id)
    if sub.name == "Netflix":
        raise ApiError(409, "already_shared", "This subscription is already shared.")
    people = [(str(ObjectId()), str(ObjectId()), user.name, user.email, True)] + [
        (str(ObjectId()), str(ObjectId()), p["display_name"], p.get("email"), False)
        for p in participants
    ]
    return _plan(str(ObjectId()), sub, people, _context(user))


def remind(plan_id: str, payment_id: str) -> dict:
    user = demo_user()
    if plan_id != SHARED_PLAN_ID:
        raise not_found()
    plan = _netflix_plan(user, _context(user))
    person = next((p for p in plan["participants"] if p["payment_id"] == payment_id), None)
    if person is None:
        raise not_found()
    if person["status"] == "paid":
        raise ApiError(409, "already_paid", "This share is already paid.")
    share = person["share"]
    now = timezone.now()
    return {
        "payment_id": payment_id,
        "channel": "email" if person["email"] else "share_sheet",
        "message": (
            f"Hi {person['display_name']}, your share of {plan['name']} for "
            f"{TODAY:%B %Y} is {share['amount']} {share['currency']}."
        ),
        "last_reminded_at": now,
        "next_reminder_available_at": now + REMINDER_INTERVAL,
    }


# Extractions (04 §6a, 11 §2.2-2.4) ---------------------------------------------

_EXTRACTION_IDS = (
    "6a0c00000000000000000001",
    "6a0c00000000000000000002",
    "6a0c00000000000000000003",
)


def _day(day: date) -> str:
    return f"{day:%b} {day.day}, {day.year}"


def _fields(**values) -> dict:
    keys = (
        "service_name",
        "plan_name",
        "price",
        "currency",
        "billing_cycle",
        "custom_cycle_count",
        "custom_cycle_unit",
        "subscription_type",
        "trial_ends_on",
        "start_date",
        "category",
    )
    return {key: values.get(key) for key in keys}


def _confidence(**values) -> dict:
    keys = (
        "service_name",
        "plan_name",
        "price",
        "currency",
        "billing_cycle",
        "subscription_type",
        "trial_ends_on",
        "start_date",
        "category",
    )
    return {key: values.get(key) for key in keys}


def _extractions(user: User) -> list[dict]:
    created = operations.at_start_of(TODAY)
    expires = created + timedelta(hours=24)
    disney_ends = TODAY + timedelta(days=18)
    hulu = Subscription.objects.filter(owner=user, name="Hulu").first()
    hulu_ends = hulu.trial_ends_on if hulu else TODAY + timedelta(days=2)
    return [
        {
            "id": _EXTRACTION_IDS[0],
            "source": {
                "sender": "Figma <billing@figma.com>",
                "subject": "Your Figma Professional receipt",
                "snippet": (
                    f"Thanks for subscribing to Figma Professional. We charged $15.00 on "
                    f"{_day(TODAY)}. Your plan renews monthly."
                ),
            },
            "fields": _fields(
                service_name="Figma",
                plan_name="Professional",
                price="15.00",
                currency="USD",
                billing_cycle="monthly",
                subscription_type="paid",
                start_date=TODAY,
                category="productivity",
            ),
            "confidence": _confidence(
                service_name=0.98,
                plan_name=0.93,
                price=0.99,
                currency=0.97,
                billing_cycle=0.95,
                subscription_type=0.96,
                start_date=0.92,
                category=0.81,
            ),
            "flagged": [],
            "duplicate_of": None,
            "created_at": created,
            "expires_at": expires,
        },
        {
            # The end date is worked out from "in 18 days", not quoted, so it
            # is under the 60% band and must be confirmed (11 §2.4).
            "id": _EXTRACTION_IDS[1],
            "source": {
                "sender": "Disney+ <disneyplus@mail.disneyplus.com>",
                "subject": "Your free trial has started",
                "snippet": (
                    "Welcome to Disney+! Your free trial ends in 18 days. After that, you "
                    "will be charged $13.99 per month."
                ),
            },
            "fields": _fields(
                service_name="Disney+",
                price="13.99",
                currency="USD",
                billing_cycle="monthly",
                subscription_type="trial",
                trial_ends_on=disney_ends,
                start_date=disney_ends,
                category="entertainment",
            ),
            "confidence": _confidence(
                service_name=0.97,
                price=0.98,
                currency=0.96,
                billing_cycle=0.94,
                subscription_type=0.95,
                trial_ends_on=0.54,
                start_date=0.54,
                category=0.78,
            ),
            "flagged": ["trial_ends_on", "start_date"],
            "duplicate_of": None,
            "created_at": created,
            "expires_at": expires,
        },
        {
            # 11 §2.7's Hulu wording, dated from the seed; Alex already tracks it.
            "id": _EXTRACTION_IDS[2],
            "source": {
                "sender": "Hulu <hulu@hulumail.com>",
                "subject": "Your Hulu free trial",
                "snippet": (
                    f"Your free trial ends on {_day(hulu_ends)}. After that, you will be "
                    "charged $17.99 per month."
                ),
            },
            "fields": _fields(
                service_name="Hulu",
                price="17.99",
                currency="USD",
                billing_cycle="monthly",
                subscription_type="trial",
                trial_ends_on=hulu_ends,
                start_date=hulu_ends,
                category="entertainment",
            ),
            "confidence": _confidence(
                service_name=0.99,
                price=0.98,
                currency=0.96,
                billing_cycle=0.95,
                subscription_type=0.97,
                trial_ends_on=0.93,
                start_date=0.9,
                category=0.8,
            ),
            "flagged": [],
            "duplicate_of": str(hulu.pk) if hulu else None,
            "created_at": created,
            "expires_at": expires,
        },
    ]


def scan() -> dict:
    return {"status": "scanning"}


def pending_extractions() -> dict:
    return {"scanning": False, "results": _extractions(demo_user())}


def confirm_extraction(extraction_id: str, fields: dict) -> dict:
    if extraction_id not in _EXTRACTION_IDS:
        raise not_found()
    return create_subscription(fields)


def discard_extraction(extraction_id: str) -> None:
    if extraction_id not in _EXTRACTION_IDS:
        raise not_found()


# Gmail (04 §6a, 11 §2.1) -------------------------------------------------------


def connect_gmail(code: str, redirect_uri: str, code_verifier: str | None = None) -> dict:
    user = demo_user()
    return {"provider": "gmail", "email": user.email, "connected_at": operations.at_start_of(TODAY)}


def disconnect_gmail() -> None:
    return None
