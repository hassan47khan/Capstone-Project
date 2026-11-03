/**
 * The spend-over-time chart's data (handoff 08 §2.1, §7). Plain functions, no
 * React, so they are easy to test.
 *
 * Every figure is the server's (GET /analytics/spend-over-time). Amounts become
 * numbers only to place points on the chart; anything a person reads (the
 * callout, the axis, the summary) is formatted from the server's strings, and
 * "highest" is found by comparing those strings as decimals, not as floats.
 */
import type { SpendOverTime } from '@/api/analyticsTypes';
import { formatMoney } from '@/api/format';
import { deltaFor } from '@/features/home/homeCopy';
import { compareDecimal } from '@/features/subscriptions/priceHistory';

const MONTHS = [
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

// "2026-10" -> "October".
export function monthName(month: string): string {
  return MONTHS[Number(month.slice(5, 7)) - 1] ?? month;
}

// "2026-10" -> "O", the axis label (08 §2.1: month initials).
export function monthInitial(month: string): string {
  return monthName(month).slice(0, 1);
}

/**
 * The top of the Y axis: the series max rounded up to a round figure, so the
 * axis reads "$150" rather than "$129.20" (08 §2.1), without leaving most of
 * the chart empty. A flat zero series still gets a non-zero top.
 */
export function niceCeiling(max: number): number {
  if (!(max > 0)) return 1;
  const power = 10 ** Math.floor(Math.log10(max));
  for (const step of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) {
    if (step * power >= max) return step * power;
  }
  return 10 * power;
}

export interface ChartPoint {
  x: number;
  y: number;
  month: string;
}

/**
 * Where each month sits: evenly spaced left to right, and from the bottom of
 * the plot (0) up to `top` (niceCeiling of the largest month).
 */
export function chartPoints(
  spend: SpendOverTime,
  width: number,
  height: number,
  pad: { top: number; bottom: number; side: number },
): { points: ChartPoint[]; top: number } {
  const values = spend.months.map((m) => Number(m.amount.amount));
  const top = niceCeiling(Math.max(0, ...values));
  const plotWidth = width - pad.side * 2;
  const plotHeight = height - pad.top - pad.bottom;
  const step = spend.months.length > 1 ? plotWidth / (spend.months.length - 1) : 0;
  const points = spend.months.map((m, index) => ({
    x: pad.side + index * step,
    y: pad.top + (1 - (values[index] ?? 0) / top) * plotHeight,
    month: m.month,
  }));
  return { points, top };
}

// SVG paths through the points: the line, and the same line closed down to
// the baseline for the 8% fill underneath (08 §2.1).
export function linePath(points: readonly ChartPoint[]): string {
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join(' ');
}

export function areaPath(points: readonly ChartPoint[], baseline: number): string {
  if (points.length === 0) return '';
  const first = points[0]!;
  const last = points[points.length - 1]!;
  return `${linePath(points)} L${last.x} ${baseline} L${first.x} ${baseline} Z`;
}

// The line's length, so it can be drawn in from left to right.
export function pathLength(points: readonly ChartPoint[]): number {
  let length = 0;
  for (let i = 1; i < points.length; i += 1) {
    length += Math.hypot(
      points[i]!.x - points[i - 1]!.x,
      points[i]!.y - points[i - 1]!.y,
    );
  }
  return length;
}

// 08 §2.1: every 2nd month label when there isn't room for all 12. All of
// them until the width is known.
export function labelEvery(width: number, count: number, minLabelWidth: number): number {
  return count > 0 && width > 0 && width / count < minLabelWidth ? 2 : 1;
}

/** "up 1.2% from last month", "No change from last month", or null. */
export function deltaPhrase(spend: SpendOverTime): string | null {
  const delta = deltaFor(spend);
  if (!delta) return null;
  if (!delta.percent) return delta.rest;
  return `${delta.direction === 'down' ? 'down' : 'up'} ${delta.percent} ${delta.rest}`;
}

/**
 * The chart in words (08 §7): "Spending over 12 months. Current month $129.20,
 * up 1.2% from last month. Highest was $129.20 in October."
 */
export function describeSpend(spend: SpendOverTime): string {
  const money = (amount: string) => formatMoney(amount, spend.current.currency).display;
  let sentence = `Spending over ${spend.months.length} months. Current month ${money(spend.current.amount)}`;
  const delta = deltaPhrase(spend);
  if (delta) sentence += `, ${delta.charAt(0).toLowerCase()}${delta.slice(1)}`;
  sentence += '.';
  // The first month with the largest amount, compared as decimals.
  const highest = spend.months.reduce<SpendOverTime['months'][number] | undefined>(
    (best, m) =>
      !best || compareDecimal(m.amount.amount, best.amount.amount) > 0 ? m : best,
    undefined,
  );
  if (highest) {
    sentence += ` Highest was ${money(highest.amount.amount)} in ${monthName(highest.month)}.`;
  }
  return sentence;
}
