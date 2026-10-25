/**
 * Turns a subscription's history into what the price chart draws (07 §4).
 *
 * Plain functions, no React, so they are easy to test.
 *
 * No money math: prices stay decimal strings. We only ever ask "which price
 * is higher?", and answer it by comparing the digits as text.
 *
 * Dates: event times are UTC instants, so `today` must be a UTC date too
 * (see utcToday in today.ts). Mixing in the phone's local date would push a
 * change made late in the evening outside the window.
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

// One spelling per value: "15.50", "15.5" and "015.5" all become "15.5".
export function normalizeDecimal(value: MoneyString): MoneyString {
  const { whole, fraction } = splitDecimal(value);
  const trimmed = fraction.replace(/0+$/, '');
  return trimmed ? `${whole}.${trimmed}` : whole;
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
  // Where the line starts: rangeStart, or later if the price before the first
  // change is unknown (then we don't invent an earlier segment).
  lineStart: DateOnly;
  startPrice: MoneyString; // the price at lineStart
  steps: PriceStep[]; // changes after lineStart, up to today, oldest first
}

// A price change, with the price before it when the server sent one.
interface PriceChange extends PriceStep {
  previous: MoneyString | undefined;
  at: string; // the exact instant, to order two changes on the same day
}

// Every price change, oldest first (by exact time, not just the day).
function priceChanges(history: HistoryEvent[]): PriceChange[] {
  const changes: PriceChange[] = [];
  for (const event of history) {
    const price = event.new_value?.price;
    if (event.event_type === 'price_change' && price) {
      changes.push({
        date: dateOf(event.occurred_at),
        price,
        previous: event.old_value?.price,
        at: event.occurred_at,
      });
    }
  }
  // Compare as times, not text: "…00Z" and "…00.123456Z" sort wrongly as text.
  return changes.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

// The first known price: from the `created` event, else the price before the first change.
function openingPrice(
  history: HistoryEvent[],
  changes: PriceChange[],
): MoneyString | undefined {
  const created = history.find((e) => e.event_type === 'created')?.new_value?.price;
  return created ?? changes[0]?.previous;
}

/**
 * The last 12 months of a subscription's price.
 *
 * @param history  the detail's history (any order)
 * @param current  today's billing price, used if the history has no prices
 * @param today    today's date in UTC, the same clock as the events
 */
export function buildPriceSeries(
  history: HistoryEvent[],
  current: MoneyString,
  today: DateOnly,
): PriceSeries {
  const rangeStart = monthsBefore(today, CHART_MONTHS);
  const changes = priceChanges(history);
  const inWindow: PriceStep[] = changes
    .filter((c) => c.date > rangeStart && c.date <= today)
    .map(({ date, price }) => ({ date, price }));

  // The price at the left edge: the opening price, updated by every change
  // on or before that day.
  let startPrice = openingPrice(history, changes);
  for (const change of changes) {
    if (change.date <= rangeStart) startPrice = change.price;
  }

  if (startPrice !== undefined) {
    return { rangeStart, today, lineStart: rangeStart, startPrice, steps: inWindow };
  }

  // Price before the first change is unknown: start the line at that change.
  const [first, ...rest] = inWindow;
  if (first) {
    return {
      rangeStart,
      today,
      lineStart: first.date,
      startPrice: first.price,
      steps: rest,
    };
  }

  // No price events at all: a flat line at today's price.
  return { rangeStart, today, lineStart: rangeStart, startPrice: current, steps: [] };
}

/**
 * Ranks each distinct price from lowest (0) up, so the chart can draw a
 * higher price higher. The line shows order, not scale: the exact prices
 * are written on the chart and in the text summary.
 *
 * Keyed by normalizeDecimal, so "15.5" and "15.50" share one level. Look
 * prices up with levelOf, which normalizes the same way.
 */
export function priceLevels(series: PriceSeries): Map<MoneyString, number> {
  const distinct = new Set(
    [series.startPrice, ...series.steps.map((s) => s.price)].map(normalizeDecimal),
  );
  const sorted = [...distinct].sort(compareDecimal);
  return new Map(sorted.map((price, rank) => [price, rank]));
}

// A price's level from priceLevels (0 if somehow missing).
export function levelOf(levels: Map<MoneyString, number>, price: MoneyString): number {
  return levels.get(normalizeDecimal(price)) ?? 0;
}

// --- What a screen reader hears (07 §11) ------------------------------------

/**
 * The chart in one sentence, covering exactly what the chart shows:
 * "Price history for the last 12 months: $13.99, increased to $15.49 on October 1, 2026."
 */
export function describePriceHistory(
  series: PriceSeries,
  currency: CurrencyCode,
): string {
  const money = (price: MoneyString) => formatMoney(price, currency).display;

  let sentence = `Price history for the last 12 months: ${money(series.startPrice)}`;
  if (series.lineStart !== series.rangeStart) {
    sentence += ` from ${formatDateSpoken(series.lineStart)}`;
  }
  if (series.steps.length === 0) return `${sentence}, with no changes.`;

  let price = series.startPrice;
  series.steps.forEach((step, index) => {
    const direction = compareDecimal(step.price, price) > 0 ? 'increased' : 'decreased';
    const joiner = index === 0 ? ', ' : ', then ';
    sentence += `${joiner}${direction} to ${money(step.price)} on ${formatDateSpoken(step.date)}`;
    price = step.price;
  });

  return `${sentence}.`;
}
