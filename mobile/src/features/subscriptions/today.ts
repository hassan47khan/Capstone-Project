/**
 * Today's date on this phone, as "YYYY-MM-DD".
 *
 * In its own file so tests can replace it with a fixed date; otherwise a
 * test that passes today could fail next year.
 *
 * TODO(contract): use the user's time zone setting once /me/settings exists.
 */
import type { DateOnly } from '@/api/types';

export function localToday(now: Date = new Date()): DateOnly {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}
