"""Stored subscriptions as API payloads, every figure from the money engine.

Real code, not a mock: whatever slice 3 puts behind the endpoints, a
subscription is described this way. Amounts are converted to the display
currency and rounded here, at the boundary, and nowhere earlier.
"""

from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from accounts.models import settings_for
from core.contract import money

from . import operations
from .models import Category, PriceHistoryEvent, ServiceCatalogEntry, Subscription
from .services import money as engine


@dataclass(frozen=True)
class Context:
    """What every figure for one user depends on."""

    today: date
    currency: str
    rates: dict[str, Decimal]
    marks: dict[str, dict]

    @classmethod
    def for_user(cls, user, *, today: date) -> "Context":
        return cls(
            today=today,
            currency=settings_for(user).display_currency,
            rates=operations.fx_rates(),
            marks=service_marks(),
        )

    def can_convert(self, currency: str) -> bool:
        return currency == self.currency or (currency in self.rates and self.currency in self.rates)

    def convert(self, amount: Decimal, currency: str) -> Decimal | None:
        """Unrounded, in the display currency; None when there is no rate."""
        try:
            return engine.convert(amount, currency, self.currency, self.rates)
        except engine.MissingRate:
            return None

    def display(self, amount: Decimal, currency: str) -> dict | None:
        return money(self.convert(amount, currency), self.currency)


def service_marks() -> dict[str, dict]:
    return {
        entry.name: {"mark": entry.mark, "brand_hex": entry.brand_hex, "tint_hex": entry.tint_hex}
        for entry in ServiceCatalogEntry.objects.all()
    }


def category_ref(category: Category | None) -> dict | None:
    if category is None:
        return None
    return {
        "slug": category.slug,
        "display_name": category.display_name,
        "color_token_key": category.color_token_key,
    }


def cycle_fields(cycle) -> dict:
    return {
        "billing_cycle": cycle.kind,
        "custom_cycle_count": cycle.count,
        "custom_cycle_unit": cycle.unit,
    }


def counts(sub: Subscription, today: date) -> bool:
    return engine.counts_toward_totals(sub.status, sub.is_trial, sub.trial_ends_on, today=today)


def subscription(sub: Subscription, ctx: Context) -> dict:
    monthly = engine.normalize_to_monthly(sub.billing_price, sub.cycle)
    return {
        "id": str(sub.pk),
        "name": sub.name,
        "billing_price": str(sub.billing_price),
        "billing_currency": sub.billing_currency,
        **cycle_fields(sub.cycle),
        "start_date": sub.start_date,
        "next_bill_date": sub.next_bill_date,
        "category": category_ref(sub.category),
        "notes": sub.notes,
        "payment_label": sub.payment_label,
        "status": sub.status,
        "cancelled_on": sub.cancelled_on,
        "is_trial": sub.is_trial,
        "trial_ends_on": sub.trial_ends_on,
        "trial_length_days": sub.trial_length_days,
        "trial_reminder_enabled": sub.trial_reminder_enabled,
        "trial_decision": sub.trial_decision,
        "counts_toward_totals": counts(sub, ctx.today),
        "normalized_monthly": ctx.display(monthly, sub.billing_currency),
        "service_mark": ctx.marks.get(sub.name),
        "created_at": sub.created_at,
        "updated_at": sub.updated_at,
    }


def history_event(event: PriceHistoryEvent) -> dict:
    return {
        "id": str(event.pk),
        "event_type": event.event_type,
        "occurred_at": event.occurred_at,
        "old_value": event.old_value,
        "new_value": event.new_value,
    }


def history(sub: Subscription) -> list[dict]:
    events = PriceHistoryEvent.objects.filter(subscription=sub).order_by("-occurred_at", "-pk")
    return [history_event(event) for event in events]


def _spent(sub: Subscription, ctx: Context) -> dict | None:
    """Total spent in the display currency, each period converted from the
    currency it was charged in; None if any of them has no rate."""
    by_currency = operations.total_spent_to_date(sub, today=ctx.today)
    converted = [ctx.convert(amount, currency) for currency, amount in by_currency.items()]
    if None in converted:
        return None
    return money(sum(converted, Decimal(0)), ctx.currency)


def subscription_detail(sub: Subscription, ctx: Context) -> dict:
    saved = None
    if sub.status == Subscription.Status.CANCELLED:
        monthly = engine.normalize_to_monthly(sub.billing_price, sub.cycle)
        saved = ctx.display(engine.annual(monthly), sub.billing_currency)
    return {
        **subscription(sub, ctx),
        "total_spent_to_date": _spent(sub, ctx),
        "saved_per_year": saved,
        "history": history(sub),
    }
