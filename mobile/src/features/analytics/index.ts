/**
 * Epic G seam — billing history and category trends (US-16, US-17, trends gap).
 *
 * What this is for
 *   The types for billing history and month-by-month trends, so the query key
 *   and the data shape are settled before Epic G builds the UI.
 *
 * Note on where this sits
 *   The Insights SCREEN is Epic C and ships in Phase 2 — it reads `/analytics`,
 *   which is already typed in src/api/types.ts. What lives here is the part that
 *   is NOT in scope: per-subscription billing history and the trailing-12-month
 *   trend chart.
 *
 * The rule Epic G must keep (specification section 9)
 *   Trends are aggregated on the server from confirmed and scheduled billing
 *   events, converted at current rates, with the chart footnote saying so. The
 *   client renders the numbers it is given, and — as with every other chart —
 *   shows the same figures as text beside the graphic.
 */

import type { BillingEvent, CurrencyCode, MoneyString } from '@/api/types';
import type { Category } from '@/theme';

export type { BillingEvent };

/** One month of one category's spend, for the trends chart. */
export interface TrendPoint {
  /** "2026-10" — a month, not a date. */
  month: string;
  category: Category | null;
  amount: MoneyString;
}

export interface CategoryTrends {
  currency: CurrencyCode;
  points: TrendPoint[];
  /**
   * Amounts are converted at CURRENT rates, not the rate on the day of each
   * charge. The chart must say so — otherwise a user comparing months is
   * silently comparing two different things.
   */
  converted_at_current_rates: true;
}
