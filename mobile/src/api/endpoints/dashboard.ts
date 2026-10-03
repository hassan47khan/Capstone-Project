/**
 * Epic C endpoints — the pre-computed figures for Home and Insights.
 *
 * What this is for
 *   The two read-only summaries the app displays but never calculates.
 *
 * Why these are separate endpoints at all
 *   Everything they return — monthly total, annual projection, per-category
 *   amounts, percentages, the "if trials convert" line — is arithmetic over
 *   decimal money in the user's display currency, at the current exchange rate.
 *   Specification section 9 puts all of it on the server so there is exactly one
 *   implementation of the rules, tested without a device. The client's entire
 *   job is to format what arrives.
 *
 *   In particular, percentages are computed with the largest-remainder method so
 *   they sum to exactly 100. Re-deriving them from the amounts on the client
 *   would reintroduce the rounding error the server just removed.
 */

import { request } from '../client';
import type { Analytics, CategoryBreakdown, Dashboard } from '../types';

/**
 * The Home screen payload (US-6, US-8).
 *
 * Includes the category breakdown inline, so the screen renders in one round
 * trip rather than two.
 */
export function getDashboard(): Promise<Dashboard> {
  return request<Dashboard>('/dashboard');
}

/**
 * The category breakdown on its own (US-8).
 *
 * Separate from `/dashboard` for the case where only the breakdown needs
 * refreshing. Most screens should read it from the dashboard payload instead of
 * making this second call.
 */
export function getCategoryBreakdown(): Promise<CategoryBreakdown> {
  return request<CategoryBreakdown>('/dashboard/category-breakdown');
}

/**
 * The Insights screen payload (US-17).
 *
 * `annual_projection` is the sum of annual equivalents at current prices, so a
 * mid-year price change applies going forward — which is what the acceptance
 * criteria require, and is not the same as "monthly total times twelve" once
 * prices have moved.
 */
export function getAnalytics(): Promise<Analytics> {
  return request<Analytics>('/analytics');
}
