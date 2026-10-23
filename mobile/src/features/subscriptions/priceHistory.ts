/**
 * Turns a subscription's history into what the price chart draws (07 §4).
 *
 * Plain functions, no React, so they are easy to test.
 *
 * No money math: prices stay decimal strings. We only ever ask "which price
 * is higher?", and answer it by comparing the digits as text.
 */
import { formatDateSpoken, formatMoney } from '@/api/format';
import type { CurrencyCode, DateOnly, MoneyString } from '@/api/types';

import type { HistoryEvent } from './api';

// The chart shows the last 12 months (07 §4).
export const CHART_MONTHS = 12;

const MONTHS_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

// --- Comparing prices without turning them into numbers -------------------

// "015.4" -> whole "15", fraction "4".
function splitDecimal(value: MoneyString): { whole: string; fraction: string } {
  const [rawWhole = '0', rawFraction = ''] = value.trim().split('.');
  return { whole: rawWhole.replace(/^0+(?=\d)/, '') || '0', fraction: rawFraction };
}

/**
 * Orders two prices: negative if a < b, 0 if equal, positive if a > b.
 * Pads both to the same length, then compares the digits as text,
 * so "9.5" < "10.00" and "15.49" equals "15.490".
 */
export function compareDecimal(a: MoneyString, b: MoneyString): number {
  const x = splitDecimal(a);
  const y = splitDecimal(b);
  const wholeLength = Math.max(x.whole.length, y.whole.length);
  const fractionLength = Math.max(x.fraction.length, y.fraction.length);
  const left =
    x.whole.padStart(wholeLength, '0') + x.fraction.padEnd(fractionLength, '0');
  const right =
    y.whole.padStart(wholeLength, '0') + y.fraction.padEnd(fractionLength, '0');
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

// --- Calendar dates ---------------------------------------------------------

// "2026-10-01T00:00:00Z" -> "2026-10-01". The server records events in UTC.
export function dateOf(instant: string): DateOnly {
  return instant.slice(0, 10);
}

// "2026-10-01" -> { year: 2026, month: 10, day: 1 }
function parts(date: DateOnly): { year: number; month: number; day: number } {
  const [year = 0, month = 1, day = 1] = date.split('-').map(Number);
  return { year, month, day };
}

// Whole days from one calendar date to another.
export function daysBetween(from: DateOnly, to: DateOnly): number {
  const a = parts(from);
  const b = parts(to);
  const ms = Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day);
  return Math.round(ms / 86_400_000);
}

// The same day `months` earlier. Mar 31 minus 1 month -> Feb 28 (or 29).
export function monthsBefore(date: DateOnly, months: number): DateOnly {
  const { year, month, day } = parts(date);
  const index = year * 12 + (month - 1) - months;
  const y = Math.floor(index / 12);
  const m = (index % 12) + 1;
  const lastDayOfMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const d = Math.min(day, lastDayOfMonth);
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// "2025-10-23" -> "Oct 2025". The chart's left-hand label.
export function formatMonthYear(date: DateOnly): string {
  const { year, month } = parts(date);
  return `${(MONTHS_LONG[month - 1] ?? '').slice(0, 3)} ${year}`;
}

// --- The chart's data -------------------------------------------------------

// On `date`, the price became `price`.
export interface PriceStep {
  date: DateOnly;
  price: MoneyString;
}

export interface PriceSeries {
  rangeStart: DateOnly; // left edge: 12 months before today
  today: DateOnly; // right edge
  startPrice: MoneyString; // the price at the left edge
  steps: PriceStep[]; // changes inside the window, oldest first
}

// The price it was created at, from the `created` event.
function createdPrice(history: HistoryEvent[]): MoneyString | undefined {
  return history.find((e) => e.event_type === 'created')?.new_value?.price;
}

// Every price change, oldest first.
function priceChanges(history: HistoryEvent[]): PriceStep[] {
  const steps: PriceStep[] = [];
  for (const event of history) {
    const price = event.new_value?.price;
    if (event.event_type === 'price_change' && price) {
      steps.push({ date: dateOf(event.occurred_at), price });
    }
  }
  return steps.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * The last 12 months of a subscription's price.
 *
 * @param history  the detail's history (any order)
 * @param current  today's billing price, used if the history is empty
 * @param today    today's calendar date
 */
export function buildPriceSeries(
  history: HistoryEvent[],
  current: MoneyString,
  today: DateOnly,
): PriceSeries {
  const rangeStart = monthsBefore(today, CHART_MONTHS);
  const changes = priceChanges(history);

  // The price at the left edge: the original price, updated by every
  // change that happened on or before that day.
  let startPrice = createdPrice(history) ?? changes[0]?.price ?? current;
  for (const change of changes) {
    if (change.date <= rangeStart) startPrice = change.price;
  }

  // Changes after the left edge, up to and including today.
  const steps = changes.filter((c) => c.date > rangeStart && c.date <= today);
  return { rangeStart, today, startPrice, steps };
}

/**
 * Ranks each distinct price from lowest (0) up, so the chart can draw a
 * higher price higher. The line shows order, not scale: the exact prices
 * are written on the chart and in the text summary.
 */
export function priceLevels(series: PriceSeries): Map<MoneyString, number> {
  const distinct: MoneyString[] = [];
  for (const price of [series.startPrice, ...series.steps.map((s) => s.price)]) {
    if (!distinct.some((p) => compareDecimal(p, price) === 0)) distinct.push(price);
  }
  distinct.sort(compareDecimal);
  return new Map(distinct.map((price, rank) => [price, rank]));
}

// --- What a screen reader hears (07 §11) ------------------------------------

/**
 * The whole price history as one sentence:
 * "Price history: $13.99 from March 2024, increased to $15.49 on October 1, 2026."
 */
export function describePriceHistory(
  history: HistoryEvent[],
  currency: CurrencyCode,
  current: MoneyString,
): string {
  const money = (price: MoneyString) => formatMoney(price, currency).display;
  const created = history.find((e) => e.event_type === 'created');
  const changes = priceChanges(history);

  let price = createdPrice(history) ?? changes[0]?.price ?? current;
  let sentence = `Price history: ${money(price)}`;
  if (created) {
    const { year, month } = parts(dateOf(created.occurred_at));
    sentence += ` from ${MONTHS_LONG[month - 1]} ${year}`;
  }

  changes.forEach((change, index) => {
    const direction = compareDecimal(change.price, price) > 0 ? 'increased' : 'decreased';
    const joiner = index === 0 ? ', ' : ', then ';
    sentence += `${joiner}${direction} to ${money(change.price)} on ${formatDateSpoken(change.date)}`;
    price = change.price;
  });

  return `${sentence}.`;
}
