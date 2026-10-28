"""The /analytics reads (handoff 04 §5), for one user on one day.

MongoDB aggregation pipelines choose, join and order the documents: which
subscriptions count, each one's history, which price changes fall in a
window. The money engine does every sum, in Decimal, and figures are rounded
only when they become a payload (04 §3.4). Each pipeline names the index it
leans on (Subscription.Meta and PriceHistoryEvent.Meta).
"""

from datetime import date, datetime, time, timedelta
from decimal import ROUND_HALF_UP, Decimal

from django.utils import timezone

from accounts.models import rules_for
from core.contract import money, rounded

from . import operations, presenters
from .models import Category, FxRate, PriceHistoryEvent, Subscription
from .services import money as engine
from .services.cycles import Cycle, add_months, schedule

Status = Subscription.Status
Decision = Subscription.TrialDecision
Event = PriceHistoryEvent.EventType


def _day(d: date) -> datetime:
    """A DateField value as MongoDB stores it: midnight, no zone."""
    return datetime.combine(d, time.min)


# Pipelines --------------------------------------------------------------------


def _subscriptions(user, *conditions: dict) -> list[Subscription]:
    """The user's subscriptions that are not deleted, soonest bill first.
    Index: subs_owner_status_bill."""
    match = {"owner_id": user.pk, "status": {"$ne": Status.DELETED}}
    pipeline = [
        {"$match": {"$and": [match, *conditions]}},
        {"$sort": {"next_bill_date": 1, "name": 1}},
    ]
    return list(Subscription.all_objects.raw_aggregate(pipeline))


def counted(user, today: date) -> list[Subscription]:
    """What counts toward totals: active, and not a trial still running (04 §6a)."""
    return _subscriptions(
        user,
        {"status": Status.ACTIVE},
        {"$nor": [{"is_trial": True, "trial_ends_on": {"$gte": _day(today)}}]},
    )


def _pending_trials(user, today: date, *conditions: dict) -> list[Subscription]:
    """Trials that have not converted yet. Index: subs_trial_ends."""
    return _subscriptions(
        user,
        {"status": Status.ACTIVE, "is_trial": True, "trial_ends_on": {"$gte": _day(today)}},
        *conditions,
    )


def _histories(subs) -> dict:
    """Every event of these subscriptions, oldest first, in one round trip.
    Index: history_sub_time."""
    by_sub = {sub.pk: [] for sub in subs}
    pipeline = [
        {"$match": {"subscription_id": {"$in": list(by_sub)}}},
        {"$sort": {"subscription_id": 1, "occurred_at": 1, "_id": 1}},
    ]
    for event in PriceHistoryEvent.objects.raw_aggregate(pipeline):
        by_sub[event.subscription_id].append(event)
    return by_sub


def _price_change_events(user, start: date, end: date | None, subscription=None) -> list:
    """Price-change events from `start` (to `end`, inclusive), newest first, on
    the user's subscriptions that are not deleted. Index: history_type_time."""
    window = {"$gte": operations.at_start_of(start)}
    if end is not None:
        window["$lt"] = operations.at_start_of(end + timedelta(days=1))
    match = {"event_type": Event.PRICE_CHANGE, "occurred_at": window}
    if subscription is not None:
        match["subscription_id"] = subscription.pk
    pipeline = [
        {"$match": match},
        {
            "$lookup": {
                "from": Subscription._meta.db_table,
                "localField": "subscription_id",
                "foreignField": "_id",
                "pipeline": [
                    {"$match": {"owner_id": user.pk, "status": {"$ne": Status.DELETED}}},
                    {"$project": {"_id": 1}},
                ],
                "as": "owned",
            }
        },
        {"$match": {"owned": {"$ne": []}}},
        {"$project": {"owned": 0}},
        {"$sort": {"occurred_at": -1}},
    ]
    return list(PriceHistoryEvent.objects.raw_aggregate(pipeline))


# Timelines ---------------------------------------------------------------------


def _price_on(sub, history, day: date) -> engine.PriceChange:
    """The price in effect on `day`, with the currency it was in."""
    current, changes = operations.price_timeline(sub, history)
    for change in changes:
        if change.on <= day:
            current = change
    return current


def _cycle_on(sub, history, day: date) -> Cycle:
    cycle, changes = operations.cycle_timeline(sub, history)
    for change in changes:
        if change.on <= day:
            cycle = change.cycle
    return cycle


def _is_pending_trial(sub: Subscription, today: date) -> bool:
    return (
        sub.status == Status.ACTIVE
        and sub.is_trial
        and sub.trial_ends_on is not None
        and sub.trial_ends_on >= today
    )


def _rates_as_of() -> date | None:
    latest = FxRate.objects.order_by("-as_of").first()
    return latest.as_of.date() if latest else None


def _month_end(first: date) -> date:
    return add_months(first, 1) - timedelta(days=1)


def _event_day(event: PriceHistoryEvent) -> date:
    return timezone.localtime(event.occurred_at, timezone.UTC).date()


# Endpoints ---------------------------------------------------------------------


def summary(user, ctx: presenters.Context, period: str) -> dict:
    lines = counted(user, ctx.today)
    convertible = [s for s in lines if ctx.can_convert(s.billing_currency)]

    items = operations.line_items(convertible, today=ctx.today)
    total = engine.monthly_total(items, ctx.currency, ctx.rates)
    rollup = engine.category_rollup(items, ctx.currency, ctx.rates)
    amounts = engine.round_to_total([row.monthly for row in rollup], ctx.currency)
    percents = engine.round_to_whole_total([row.percent for row in rollup])
    categories = {c.slug: c for c in Category.objects.all()}

    trials = _pending_trials(user, ctx.today)
    trial_items = [
        engine.LineItem(
            engine.normalize_to_monthly(s.billing_price, s.cycle), s.billing_currency, None
        )
        for s in trials
        if ctx.can_convert(s.billing_currency)
    ]
    return {
        "period": period,
        "display_currency": ctx.currency,
        "monthly_total": money(total, ctx.currency),
        "annual_total": money(engine.annual(total), ctx.currency),
        "active_count": len(convertible),
        "trial_count": len(trials),
        "pending_trials_monthly": money(
            engine.monthly_total(trial_items, ctx.currency, ctx.rates), ctx.currency
        ),
        "unconverted_count": len(lines) - len(convertible),
        "converted": any(s.billing_currency != ctx.currency for s in convertible),
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


def _run_rate(subs, histories, as_of: date, ctx) -> Decimal:
    """Monthly recurring spend as it stood on `as_of`: what was active then, at
    the price and cycle in effect then."""
    items = []
    for sub in subs:
        if sub.start_date > as_of:
            continue
        if sub.cancelled_on and sub.cancelled_on <= as_of:
            continue
        if sub.is_trial and sub.trial_ends_on and sub.trial_ends_on >= as_of:
            continue
        history = histories[sub.pk]
        price = _price_on(sub, history, as_of)
        if not ctx.can_convert(price.currency):
            continue
        cycle = _cycle_on(sub, history, as_of)
        items.append(
            engine.LineItem(engine.normalize_to_monthly(price.price, cycle), price.currency, None)
        )
    return engine.monthly_total(items, ctx.currency, ctx.rates)


def spend_over_time(user, ctx: presenters.Context, months: int) -> dict:
    today = ctx.today
    this_month = date(today.year, today.month, 1)
    # Always at least two, so the delta exists even when one month is asked for.
    firsts = [add_months(this_month, -k) for k in range(max(months, 2) - 1, -1, -1)]
    subs = _subscriptions(user, {"start_date": {"$lte": _day(today)}})
    histories = _histories(subs)
    series = [
        (first, _run_rate(subs, histories, min(_month_end(first), today), ctx)) for first in firsts
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
            s.start_date <= last_month_end for s in subs if not _is_pending_trial(s, today)
        ),
    }


def upcoming(user, ctx: presenters.Context, start: date, end: date) -> dict:
    """Every bill from `start` to `end` inclusive: what was charged before today,
    and what will be after, each at the price in effect on its date."""
    subs = _subscriptions(
        user,
        {"start_date": {"$lte": _day(end)}},
        {"$or": [{"cancelled_on": None}, {"cancelled_on": {"$gt": _day(start)}}]},
    )
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
                    "days_until": (due - ctx.today).days,
                    "amount": ctx.display(price.price, price.currency),
                    "billing_amount": money(price.price, price.currency),
                    **presenters.cycle_fields(_cycle_on(sub, history, due)),
                    "is_trial": sub.is_trial and due == sub.trial_ends_on,
                }
            )
    items.sort(key=lambda item: (item["bill_date"], item["name"]))
    return {"display_currency": ctx.currency, "start": start, "end": end, "items": items}


def price_changes(
    user,
    ctx: presenters.Context,
    start: date,
    *,
    include_upcoming: bool = False,
    subscription: Subscription | None = None,
) -> dict:
    """Price changes effective from `start`, newest first. With include_upcoming,
    future changes too, plus trials about to convert (06 §2.4)."""
    today = ctx.today
    events = _price_change_events(
        user, start, None if include_upcoming else today, subscription=subscription
    )
    subs = {
        sub.pk: sub
        for sub in _subscriptions(user, {"_id": {"$in": [e.subscription_id for e in events]}})
    }
    histories = _histories(subs.values())
    # A price_change is always within one currency (a switch is a currency_change).
    currencies = {
        event.pk: new
        for sub in subs.values()
        for event, _, new in operations.price_events(sub, histories[sub.pk])
    }
    items = []
    for event in events:
        sub = subs[event.subscription_id]
        currency = currencies[event.pk]
        on = _event_day(event)
        old, new = Decimal(event.old_value["price"]), Decimal(event.new_value["price"])
        cycle = _cycle_on(sub, histories[sub.pk], on)
        monthly = engine.normalize_to_monthly(new, cycle) - engine.normalize_to_monthly(old, cycle)
        items.append(
            {
                "kind": "price_change",
                "subscription_id": str(sub.pk),
                "name": sub.name,
                "service_mark": ctx.marks.get(sub.name),
                "effective_on": on,
                "is_upcoming": on > today,
                "old_price": money(old, currency),
                "new_price": money(new, currency),
                "monthly_change": ctx.display(monthly, currency),
                "annual_change": ctx.display(engine.annual(monthly), currency),
                "direction": "up" if new > old else "down",
                "days_left": None,
                **presenters.cycle_fields(cycle),
            }
        )
    if include_upcoming:
        window = rules_for(user).trial_alert_days_before
        trials = _pending_trials(
            user,
            today,
            {"trial_ends_on": {"$lte": _day(today + timedelta(days=window))}},
            {"trial_decision": {"$ne": Decision.KEEP}},
        )
        for sub in trials:
            if subscription is not None and sub.pk != subscription.pk:
                continue
            items.append(
                {
                    "kind": "trial_ending",
                    "subscription_id": str(sub.pk),
                    "name": sub.name,
                    "service_mark": ctx.marks.get(sub.name),
                    "effective_on": sub.trial_ends_on,
                    "is_upcoming": sub.trial_ends_on > today,
                    "old_price": None,
                    "new_price": money(sub.billing_price, sub.billing_currency),
                    "monthly_change": None,
                    "annual_change": None,
                    "direction": None,
                    "days_left": (sub.trial_ends_on - today).days,
                    **presenters.cycle_fields(sub.cycle),
                }
            )
    items.sort(key=lambda item: item["name"])
    items.sort(key=lambda item: item["effective_on"], reverse=True)
    return {"display_currency": ctx.currency, "items": items}
