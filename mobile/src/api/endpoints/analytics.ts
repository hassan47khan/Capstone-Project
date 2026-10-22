/**
 * The /analytics endpoints of the frozen contract (handoff 04 §5), used by
 * Home (06 §3) and later by Analytics (08).
 *
 * TODO(generated client): replaced when src/api is generated from schema.yml.
 */
import { request } from '../client';
import type {
  AnalyticsSummary,
  PriceChanges,
  SpendOverTime,
  Upcoming,
} from '../analyticsTypes';

/** Totals and the category breakdown. The one source for Home's donut and Analytics' bars. */
export function getSummary(): Promise<AnalyticsSummary> {
  return request<AnalyticsSummary>('/analytics/summary', {
    query: { period: 'current_month' },
  });
}

/** Monthly recurring spend per month, ending with this one. Home asks for 2. */
export function getSpendOverTime(months: number): Promise<SpendOverTime> {
  return request<SpendOverTime>('/analytics/spend-over-time', { query: { months } });
}

/** Home's Urgent attention: changes in the last 30 days, upcoming ones, and trials ending. */
export function getUrgentChanges(): Promise<PriceChanges> {
  return request<PriceChanges>('/analytics/price-changes', {
    query: { since: '-30d', include_upcoming: true },
  });
}

/** Every bill from today through today + `days`, soonest first. */
export function getUpcoming(days: number): Promise<Upcoming> {
  return request<Upcoming>('/analytics/upcoming', { query: { days } });
}
