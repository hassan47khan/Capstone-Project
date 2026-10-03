/**
 * Money and date formatting.
 *
 * What this is for
 *   Turning the decimal strings the API sends into the text the design shows,
 *   and nothing more. This module FORMATS; it never calculates. Totals, monthly
 *   equivalents, percentages and currency conversion all happen on the server
 *   (specification section 9, prompt section 6).
 *
 * Why it never touches a float
 *   `parseFloat("15.49")` gives 15.489999999999998. Format that back and you can
 *   lose a cent; sum a column of them and the total disagrees with the rows. So
 *   every operation below is string surgery — split on the decimal point, pad or
 *   trim the fraction, group the integer digits. No `Number`, no `parseFloat`,
 *   no arithmetic on amounts anywhere in this file.
 *
 * Why it does not use Intl.NumberFormat
 *   Jest runs on Node with full ICU; the app runs on Hermes with a cut-down ICU.
 *   The same call produces different output in the two, so a formatting test
 *   would pass in CI and the app would be wrong on the phone. A deterministic
 *   implementation is worth more than the convenience.
 */

import type { CurrencyCode, MoneyString } from './types';

/**
 * ISO 4217 minor-unit exponents — how many decimal places a currency has.
 *
 * Specification section 9 requires a per-currency exponent table so JPY renders
 * with no decimals. Most currencies are 2, so only the exceptions are listed and
 * `DEFAULT_MINOR_UNITS` covers the rest.
 */
const MINOR_UNITS: Record<string, number> = {
  // Zero-decimal currencies.
  JPY: 0,
  KRW: 0,
  VND: 0,
  CLP: 0,
  ISK: 0,
  XAF: 0,
  XOF: 0,
  XPF: 0,
  RWF: 0,
  UGX: 0,
  PYG: 0,
  // Three-decimal currencies.
  BHD: 3,
  IQD: 3,
  JOD: 3,
  KWD: 3,
  OMR: 3,
  TND: 3,
};

const DEFAULT_MINOR_UNITS = 2;

/** Symbols for the currencies the picker offers. Falls back to the code itself. */
const SYMBOLS: Record<string, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
  CAD: '$',
  AUD: '$',
  CHF: 'CHF',
  INR: '₹',
};

/** Decimal places for a currency. Unknown codes get the 2-decimal default. */
export function minorUnits(currency: CurrencyCode): number {
  return MINOR_UNITS[currency.toUpperCase()] ?? DEFAULT_MINOR_UNITS;
}

/** Display symbol for a currency, or the code when we have no symbol for it. */
export function currencySymbol(currency: CurrencyCode): string {
  return SYMBOLS[currency.toUpperCase()] ?? currency.toUpperCase();
}

/** Groups an integer digit string into thousands: "1733" -> "1,733". */
function groupThousands(digits: string): string {
  // Walk from the right in threes. Done with a regex-free loop so the behaviour
  // is obvious and there is no backtracking surprise on long strings.
  let out = '';
  for (let i = 0; i < digits.length; i += 1) {
    const fromRight = digits.length - i;
    out += digits[i];
    if (fromRight > 1 && (fromRight - 1) % 3 === 0) {
      out += ',';
    }
  }
  return out;
}

/**
 * Splits a decimal string into sign, integer digits and fraction digits,
 * normalising the fraction to the currency's minor units.
 *
 * Padding and truncation are both string operations. Truncation is deliberate
 * rather than rounding: the server is the authority on the value, so if it ever
 * sends more precision than the currency has, showing fewer digits is honest
 * while rounding here would invent a number the server never computed.
 */
function splitAmount(
  amount: MoneyString,
  places: number,
): { negative: boolean; whole: string; fraction: string } {
  const trimmed = String(amount).trim();
  const negative = trimmed.startsWith('-');
  const unsigned = negative ? trimmed.slice(1) : trimmed;

  const [rawWhole = '0', rawFraction = ''] = unsigned.split('.');

  // Strip leading zeros but keep a single "0" so ".49" and "0.49" agree.
  const whole = rawWhole.replace(/^0+(?=\d)/, '') || '0';

  const fraction =
    places === 0
      ? ''
      : rawFraction.length >= places
        ? rawFraction.slice(0, places)
        : rawFraction.padEnd(places, '0');

  return { negative, whole, fraction };
}

/**
 * The pieces of a formatted amount, kept separate so the `Amount` component can
 * render the cents smaller and in `ink2` the way the design does:
 *
 *     $144.45   ->   symbol "$", whole "144", fraction "45"
 *
 * `fraction` is an empty string for zero-decimal currencies such as JPY, and the
 * component then renders no decimal point at all.
 */
export interface FormattedMoney {
  symbol: string;
  /** Grouped integer part, e.g. "1,733". Includes the minus sign if negative. */
  whole: string;
  /** Digits after the point, with no separator. Empty for zero-decimal currencies. */
  fraction: string;
  /** The whole thing as one string, e.g. "$1,733.40". For labels and screen readers. */
  display: string;
}

/**
 * Formats an amount for display.
 *
 * @param amount   Decimal string from the API. Never a number.
 * @param currency ISO 4217 code, which decides both symbol and decimal places.
 */
export function formatMoney(amount: MoneyString, currency: CurrencyCode): FormattedMoney {
  const places = minorUnits(currency);
  const symbol = currencySymbol(currency);
  const { negative, whole, fraction } = splitAmount(amount, places);

  const groupedWhole = `${negative ? '-' : ''}${groupThousands(whole)}`;
  const display =
    fraction.length > 0
      ? `${symbol}${groupedWhole}.${fraction}`
      : `${symbol}${groupedWhole}`;

  return { symbol, whole: groupedWhole, fraction, display };
}

/**
 * Marker shown in place of a converted total when a subscription's currency has
 * no stored exchange rate.
 *
 * US-4 is explicit: such an amount is shown unconverted with a visible marker and
 * is never silently summed. `formatUnconverted` produces the text; excluding it
 * from the total is the server's job, and `Dashboard.unconverted_count` tells the
 * UI that it happened.
 */
export function formatUnconverted(
  amount: MoneyString,
  currency: CurrencyCode,
): FormattedMoney & { converted: false } {
  return { ...formatMoney(amount, currency), converted: false };
}

/**
 * Describes a billing cycle in words: "per month", "every 6 weeks".
 *
 * Used under the big price on the detail screen, where the design shows
 * "per month" for the common case.
 */
export function formatCycle(unit: string, count: number): string {
  const singular: Record<string, string> = {
    day: 'day',
    week: 'week',
    month: 'month',
    year: 'year',
  };
  const noun = singular[unit] ?? unit;

  if (count === 1) {
    return `per ${noun}`;
  }
  return `every ${count} ${noun}s`;
}

/** Month names for the compact date style the design uses ("Renews Oct 3"). */
const MONTHS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

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

const WEEKDAYS_LONG = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

/**
 * Parses a "YYYY-MM-DD" calendar date into its parts WITHOUT constructing a Date.
 *
 * `new Date("2026-10-03")` is parsed as UTC midnight and then rendered in the
 * device's local zone, so for anyone west of Greenwich it displays as October 2.
 * That off-by-one is exactly the class of bug the specification warns about, so
 * calendar dates are handled as text.
 */
function parseDateOnly(
  value: string,
): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

/** "2026-10-03" -> "Oct 3". The list-row and renewal style. */
export function formatDateShort(value: string): string {
  const parsed = parseDateOnly(value);
  if (!parsed) return value;
  return `${MONTHS_SHORT[parsed.month - 1]} ${parsed.day}`;
}

/** "2026-10-03" -> "Oct 3, 2026". The detail-screen style. */
export function formatDateLong(value: string): string {
  const parsed = parseDateOnly(value);
  if (!parsed) return value;
  return `${MONTHS_SHORT[parsed.month - 1]} ${parsed.day}, ${parsed.year}`;
}

/** "2026-09-30" -> "Wednesday, September 30". The Home screen eyebrow. */
export function formatDateEyebrow(value: string): string {
  const parsed = parseDateOnly(value);
  if (!parsed) return value;

  // Zeller-style weekday via UTC avoids any local-zone shift; we only ever read
  // the weekday back out, never the date itself.
  const weekday = new Date(
    Date.UTC(parsed.year, parsed.month - 1, parsed.day),
  ).getUTCDay();

  return `${WEEKDAYS_LONG[weekday]}, ${MONTHS_LONG[parsed.month - 1]} ${parsed.day}`;
}

/**
 * Days between two calendar dates, for "in 3 days" on the Home screen.
 *
 * Both dates are treated as UTC midnight so the subtraction is a whole number of
 * days regardless of the device's zone or any daylight-saving change in between.
 */
export function daysUntil(target: string, today: string): number | null {
  const a = parseDateOnly(target);
  const b = parseDateOnly(today);
  if (!a || !b) return null;

  const ms = Date.UTC(a.year, a.month - 1, a.day) - Date.UTC(b.year, b.month - 1, b.day);
  return Math.round(ms / 86_400_000);
}

/** "in 3 days", "tomorrow", "today", "overdue". Null when the dates are unparseable. */
export function formatRelativeDays(target: string, today: string): string | null {
  const days = daysUntil(target, today);
  if (days === null) return null;

  if (days < 0) return 'overdue';
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  return `in ${days} days`;
}
