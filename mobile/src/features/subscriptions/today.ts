/**
 * Today's date as "YYYY-MM-DD", in two flavours. In their own file so tests
 * can pin a fixed date; otherwise a test that passes today could fail next year.
 *
 * TODO(contract): use the user's time zone setting once /me/settings exists.
 */
import type { DateOnly } from '@/api/types';

// The phone's own date. For dates the user picks (e.g. "start date can't be in the future").
export function localToday(now: Date = new Date()): DateOnly {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

// Today in UTC. For comparing against server event times, which are UTC.
export function utcToday(now: Date = new Date()): DateOnly {
  return now.toISOString().slice(0, 10);
}
