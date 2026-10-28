"""Subscription changes that touch the database, and their history events.

The calculators in services/ are pure; this module is the adapter between them
and the models. Every write that the spec says must leave a trace goes through
here, so a price, category or cycle change always writes exactly one
PriceHistoryEvent (handoff 04 §5, §6).
"""

from datetime import date, datetime, time
from decimal import Decimal

from django.utils import timezone
from django_mongodb_backend import transaction

from .models import FxRate, PriceHistoryEvent, Subscription
from .services import money
from .services.cycles import Cycle, CycleChange, next_bill_date

Event = PriceHistoryEvent.EventType
Status = Subscription.Status

CYCLE_FIELDS = ("billing_cycle", "custom_cycle_count", "custom_cycle_unit")


def _cycle_value(cycle: Cycle) -> dict:
    return {
        "billing_cycle": cycle.kind,
        "custom_cycle_count": cycle.count,
        "custom_cycle_unit": cycle.unit,
    }


def _cycle_from(value: dict) -> Cycle:
    return Cycle(
        value["billing_cycle"], value.get("custom_cycle_count"), value.get("custom_cycle_unit")
    )


def _category_value(sub: Subscription) -> str | None:
    return sub.category.slug if sub.category_id else None


def at_start_of(day: date) -> datetime:
    """A calendar date as a UTC instant, for events recorded "on" a day."""
    return datetime.combine(day, time.min, tzinfo=timezone.UTC)


def refresh_next_bill_date(sub: Subscription, *, today: date) -> None:
    """Recompute, never trust, next_bill_date (handoff 04 §5)."""
    if sub.status != Status.ACTIVE:
        sub.next_bill_date = None
        return
    initial, changes = cycle_timeline(sub)
    sub.next_bill_date = next_bill_date(sub.start_date, initial, changes, today=today)


@transaction.atomic
def create_subscription(*, today: date, at: datetime | None = None, **fields) -> Subscription:
    sub = Subscription(**fields)
    sub.full_clean()
    refresh_next_bill_date(sub, today=today)
    sub.save()
    PriceHistoryEvent.objects.create(
        subscription=sub,
        event_type=Event.CREATED,
        occurred_at=at or timezone.now(),
        new_value={
            "price": str(sub.billing_price),
            "currency": sub.billing_currency,
            "category": _category_value(sub),
            **_cycle_value(sub.cycle),
        },
    )
    return sub


@transaction.atomic
def update_subscription(
    sub: Subscription, *, today: date, at: datetime | None = None, **changes
) -> list[PriceHistoryEvent]:
    """Apply `changes` and write one history event per tracked change.

    Price events carry the currency on both sides. Any change of currency is
    one currency_change from the old price and currency to the new ones, even
    when the price changed too; a price_change is only ever within one
    currency, so the price-changes feed never compares across currencies.
    """
    at = at or timezone.now()
    old_price, old_currency = sub.billing_price, sub.billing_currency
    old_category, old_cycle = _category_value(sub), sub.cycle
    for field, value in changes.items():
        setattr(sub, field, value)
    sub.full_clean()

    events = []
    old_money = {"price": str(old_price), "currency": old_currency}
    new_money = {"price": str(sub.billing_price), "currency": sub.billing_currency}
    if sub.billing_currency != old_currency:
        events.append((Event.CURRENCY_CHANGE, old_money, new_money))
    elif sub.billing_price != old_price:
        events.append((Event.PRICE_CHANGE, old_money, new_money))
    if _category_value(sub) != old_category:
        events.append(
            (Event.CATEGORY_CHANGE, {"category": old_category}, {"category": _category_value(sub)})
        )
    if sub.cycle != old_cycle:
        events.append((Event.CYCLE_CHANGE, _cycle_value(old_cycle), _cycle_value(sub.cycle)))

    written = [
        PriceHistoryEvent.objects.create(
            subscription=sub, event_type=kind, occurred_at=at, old_value=old, new_value=new
        )
        for kind, old, new in events
    ]
    refresh_next_bill_date(sub, today=today)
    sub.save()
    return written


@transaction.atomic
def cancel_subscription(sub: Subscription, *, today: date) -> Subscription:
    """Cancel keeps all history and drops the subscription out of totals."""
    sub.status = Status.CANCELLED
    sub.cancelled_on = today
    sub.next_bill_date = None
    sub.save()
    PriceHistoryEvent.objects.create(
        subscription=sub,
        event_type=Event.CANCELLED,
        occurred_at=timezone.now(),
        new_value={"cancelled_on": today.isoformat()},
    )
    return sub


def soft_delete(sub: Subscription) -> Subscription:
    """Delete is soft: status=deleted, history kept (handoff 04 §2).

    Like cancel, it clears next_bill_date; restore recomputes it.
    """
    if sub.status != Status.DELETED:
        sub.status_before_delete = sub.status
        sub.status = Status.DELETED
        sub.next_bill_date = None
        sub.save()
    return sub


def restore(sub: Subscription, *, today: date) -> Subscription:
    """Put back the status from before the delete. Powers the Undo toast."""
    if sub.status == Status.DELETED:
        sub.status = sub.status_before_delete or Status.ACTIVE
        sub.status_before_delete = None
        refresh_next_bill_date(sub, today=today)
        sub.save()
    return sub


def convert_due_trials(*, today: date) -> int:
    """Flip trials that end on or before `today` into paying subscriptions (§6a)."""
    return Subscription.objects.filter(
        is_trial=True, status=Status.ACTIVE, trial_ends_on__lte=today
    ).update(is_trial=False)


# Reading -------------------------------------------------------------------


def _history(sub: Subscription) -> list[PriceHistoryEvent]:
    # The id breaks ties: a currency_change and its price_change share an instant.
    events = PriceHistoryEvent.objects.filter(subscription=sub)
    return list(events.order_by("occurred_at", "pk"))


def cycle_timeline(
    sub: Subscription, history: list[PriceHistoryEvent] | None = None
) -> tuple[Cycle, list[CycleChange]]:
    if sub.pk is None:
        return sub.cycle, []
    if history is None:
        history = _history(sub)
    changes = [e for e in history if e.event_type == Event.CYCLE_CHANGE]
    if not changes:
        return sub.cycle, []
    initial = _cycle_from(changes[0].old_value)
    return initial, [CycleChange(e.occurred_at.date(), _cycle_from(e.new_value)) for e in changes]


_PRICE_EVENTS = (Event.PRICE_CHANGE, Event.CURRENCY_CHANGE)


def price_events(
    sub: Subscription, history: list[PriceHistoryEvent]
) -> list[tuple[PriceHistoryEvent, str, str]]:
    """Price and currency changes, oldest first, as (event, old currency, new
    currency).

    A price_change written before currency was recorded has only "price". It
    was in the currency in effect after it: the old side of the next event that
    names one, or the current billing currency if none does.
    """
    events = [e for e in history if e.event_type in _PRICE_EVENTS]
    known = sub.billing_currency
    sided = []
    for event in reversed(events):
        new = event.new_value.get("currency", known)
        old = event.old_value.get("currency", new)
        sided.append((event, old, new))
        known = old
    return sided[::-1]


def price_timeline(
    sub: Subscription, history: list[PriceHistoryEvent] | None = None
) -> tuple[money.PriceChange, list[money.PriceChange]]:
    """The price the subscription started at and every change since, each in
    its own currency."""
    if history is None:
        history = _history(sub)
    events = price_events(sub, history)
    if not events:
        return money.PriceChange(sub.start_date, sub.billing_price, sub.billing_currency), []
    first, first_currency, _ = events[0]
    initial = money.PriceChange(sub.start_date, Decimal(first.old_value["price"]), first_currency)
    return initial, [
        money.PriceChange(e.occurred_at.date(), Decimal(e.new_value["price"]), currency)
        for e, _, currency in events
    ]


def total_spent_to_date(sub: Subscription, *, today: date) -> dict[str, Decimal]:
    """What has been charged so far, by the currency it was charged in."""
    history = _history(sub)
    initial_price, price_changes = price_timeline(sub, history)
    initial_cycle, cycle_changes = cycle_timeline(sub, history)
    return money.spent_by_currency(
        sub.start_date,
        initial_cycle,
        initial_price,
        today=today,
        price_changes=price_changes,
        cycle_changes=cycle_changes,
        ended_on=sub.cancelled_on,
        first_charge_on=sub.trial_ends_on if sub.trial_ends_on else None,
    )


def line_items(subs, *, today: date) -> list[money.LineItem]:
    """The subscriptions that count toward totals, as engine line items."""
    return [
        money.LineItem(
            monthly=money.normalize_to_monthly(sub.billing_price, sub.cycle),
            currency=sub.billing_currency,
            category=_category_value(sub),
        )
        for sub in subs
        if money.counts_toward_totals(sub.status, sub.is_trial, sub.trial_ends_on, today=today)
    ]


def fx_rates() -> dict[str, Decimal]:
    return {money.BASE_CURRENCY: Decimal(1), **{r.currency: r.rate for r in FxRate.objects.all()}}
