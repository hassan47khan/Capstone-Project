/**
 * Calendar month arithmetic (11 §1). Dates only, as "YYYY-MM-DD" strings, and
 * all of it in UTC so no device zone or daylight-saving change can move a day.
 *
 * No money here: every total the Calendar shows comes from the server.
 */
import type { DateOnly } from '@/api/types';

/** "YYYY-MM". */
export type MonthKey = string;

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
] as const;

/** Sunday first, as the US-based design does. Spoken names for the column headers. */
export const WEEKDAYS = [
  { short: 'S', long: 'Sunday' },
  { short: 'M', long: 'Monday' },
  { short: 'T', long: 'Tuesday' },
  { short: 'W', long: 'Wednesday' },
  { short: 'T', long: 'Thursday' },
  { short: 'F', long: 'Friday' },
  { short: 'S', long: 'Saturday' },
] as const;

const pad = (n: number) => String(n).padStart(2, '0');

function parts(month: MonthKey): { year: number; month: number } {
  const [year, m] = month.split('-').map(Number) as [number, number];
  return { year, month: m };
}

export function monthOf(date: DateOnly): MonthKey {
  return date.slice(0, 7);
}

/** `count` months later (or earlier, when negative). */
export function addMonths(month: MonthKey, count: number): MonthKey {
  const { year, month: m } = parts(month);
  const index = year * 12 + (m - 1) + count;
  return `${Math.floor(index / 12)}-${pad((index % 12) + 1)}`;
}

export function daysInMonth(month: MonthKey): number {
  const { year, month: m } = parts(month);
  return new Date(Date.UTC(year, m, 0)).getUTCDate();
}

export function firstDay(month: MonthKey): DateOnly {
  return `${month}-01`;
}

export function lastDay(month: MonthKey): DateOnly {
  return `${month}-${pad(daysInMonth(month))}`;
}

/** "October". */
export function monthName(month: MonthKey): string {
  return MONTHS_LONG[parts(month).month - 1] ?? month;
}

/** "October 2026". */
export function monthTitle(month: MonthKey): string {
  return `${monthName(month)} ${parts(month).year}`;
}

/**
 * The month as weeks of seven cells, Sunday first. Cells before the 1st and
 * after the last day are null, so every week has exactly seven.
 */
export function weeksOf(month: MonthKey): (DateOnly | null)[][] {
  const { year, month: m } = parts(month);
  const lead = new Date(Date.UTC(year, m - 1, 1)).getUTCDay();
  const cells: (DateOnly | null)[] = Array.from({ length: lead }, () => null);
  for (let d = 1; d <= daysInMonth(month); d += 1) cells.push(`${month}-${pad(d)}`);
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (DateOnly | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** Whether a month is behind, on, or ahead of today's. */
export function tense(month: MonthKey, today: DateOnly): 'past' | 'current' | 'future' {
  const current = monthOf(today);
  if (month < current) return 'past';
  if (month > current) return 'future';
  return 'current';
}

/** True when the whole month ends before the user's first subscription started. */
export function beforeTracking(month: MonthKey, trackingSince: DateOnly | null): boolean {
  return trackingSince !== null && lastDay(month) < trackingSince;
}

/** Day of the month, for a cell: "2026-10-05" -> "5". */
export function dayNumber(date: DateOnly): string {
  return String(Number(date.slice(8, 10)));
}
