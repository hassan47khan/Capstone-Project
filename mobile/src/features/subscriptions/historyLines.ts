/**
 * Turns history events into the lines Edit History shows (07 §6):
 * a date, a badge and a sentence. Plain functions, so they are easy to test.
 *
 * Badge colours are neutral except Price update (warning) and Creation
 * (success): these are log entries, not alerts, and red is never used.
 *
 * Prices use the currency the event recorded, else the current billing
 * currency (currencyOf, the same rule as the price chart). The server doesn't
 * record a currency on price changes yet, so that fallback is a best guess.
 */
import {
  formatCycleSuffix,
  formatDateLong,
  formatDateSpoken,
  formatMoney,
} from '@/api/format';
import type { BadgeTone } from '@/components';
import { CATEGORY_LABELS, UNCATEGORIZED_LABEL, type Category } from '@/theme';

import type { BillingCycle, CustomCycleUnit, HistoryEvent, HistoryValue } from './api';
import { describeCycle } from './formRules';
import { currencyOf, dateOf } from './priceHistory';

export interface HistoryLine {
  id: string;
  date: string; // "Oct 1, 2026"
  spokenDate: string; // "October 1, 2026", for screen readers
  badge: { label: string; tone: BadgeTone };
  text: string;
}

// "entertainment" -> "Entertainment"; null or unknown -> "Uncategorized".
function categoryName(slug: string | null | undefined): string {
  return slug && slug in CATEGORY_LABELS
    ? CATEGORY_LABELS[slug as Category]
    : UNCATEGORIZED_LABEL;
}

// The cycle in a history value, in words ("Monthly", "Every 2 months").
function cycleName(value: HistoryValue | null): string {
  return describeCycle({
    billing_cycle: value?.billing_cycle ?? 'monthly',
    custom_cycle_count: value?.custom_cycle_count ?? null,
    custom_cycle_unit: value?.custom_cycle_unit ?? null,
  });
}

// "/mo", "/yr", "/2mo" for a cycle (quarterly is every 3 months).
const SUFFIX_UNIT: Record<CustomCycleUnit, string> = {
  days: 'day',
  weeks: 'week',
  months: 'month',
  years: 'year',
};
function cycleSuffix(value: HistoryValue | null): string {
  const cycle: BillingCycle = value?.billing_cycle ?? 'monthly';
  if (cycle === 'weekly') return formatCycleSuffix('week', 1);
  if (cycle === 'quarterly') return formatCycleSuffix('month', 3);
  if (cycle === 'yearly') return formatCycleSuffix('year', 1);
  if (cycle === 'custom') {
    const unit = SUFFIX_UNIT[value?.custom_cycle_unit ?? 'months'];
    return formatCycleSuffix(unit, value?.custom_cycle_count ?? 1);
  }
  return formatCycleSuffix('month', 1);
}

// "Price changed from $13.99 to $15.49". A side the server left out is
// skipped rather than shown as $0.00, which would look like a real price.
function priceSentence(
  before: HistoryValue | null,
  after: HistoryValue | null,
  currency: string,
): string {
  const money = (value: HistoryValue | null) =>
    value?.price === undefined
      ? null
      : formatMoney(value.price, currencyOf(value, currency)).display;
  const from = money(before);
  const to = money(after);
  if (from && to) return `Price changed from ${from} to ${to}`;
  if (to) return `Price changed to ${to}`;
  if (from) return `Price changed from ${from}`;
  return 'Price changed';
}

/**
 * One event as a line. `currency` is the subscription's billing currency,
 * used when the event doesn't carry its own.
 */
export function describeEvent(event: HistoryEvent, currency: string): HistoryLine {
  const before = event.old_value;
  const after = event.new_value;
  const day = dateOf(event.occurred_at);
  const base = {
    id: event.id,
    date: formatDateLong(day),
    spokenDate: formatDateSpoken(day),
  };

  switch (event.event_type) {
    case 'price_change':
      return {
        ...base,
        badge: { label: 'Price update', tone: 'warning' },
        text: priceSentence(before, after, currency),
      };
    case 'category_change':
      return {
        ...base,
        badge: { label: 'Category', tone: 'neutral' },
        text: `Category changed from ${categoryName(before?.category)} to ${categoryName(after?.category)}`,
      };
    case 'cycle_change':
      return {
        ...base,
        badge: { label: 'Cycle', tone: 'neutral' },
        text: `Billing cycle changed from ${cycleName(before)} to ${cycleName(after)}`,
      };
    case 'created':
      return {
        ...base,
        badge: { label: 'Creation', tone: 'success' },
        text:
          after?.price === undefined
            ? `Subscription added, ${categoryName(after?.category)}`
            : `Subscription added, ${formatMoney(after.price, currencyOf(after, currency)).display}${cycleSuffix(after)}, ${categoryName(after?.category)}`,
      };
    case 'cancelled':
      return {
        ...base,
        badge: { label: 'Cancelled', tone: 'neutral' },
        text: 'Marked as cancelled',
      };
    // A kind of event this app doesn't know yet (a newer server): show a plain
    // row rather than take the whole screen down.
    default:
      return {
        ...base,
        badge: { label: 'Update', tone: 'neutral' },
        text: 'Subscription updated',
      };
  }
}

// Newest first, by real time (the API sends them that way; this makes sure).
export function historyLines(events: HistoryEvent[], currency: string): HistoryLine[] {
  return [...events]
    .sort((a, b) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at))
    .map((event) => describeEvent(event, currency));
}

// 07 §9: only a creation event means "nothing changed yet".
export function onlyCreation(events: HistoryEvent[]): boolean {
  return events.every((event) => event.event_type === 'created');
}
