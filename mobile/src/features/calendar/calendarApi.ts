/**
 * The Calendar's one request (11 §1): every bill in a calendar month, with the
 * month and per-day totals the server computed. Kept in this folder so
 * src/api (Hassan's) is not edited; it uses the shared client.
 */
import type { Upcoming } from '@/api/analyticsTypes';
import { request } from '@/api/client';
import { queryKeys } from '@/api/queryKeys';

import { firstDay, lastDay, type MonthKey } from './month';

/**
 * Under `analytics` so anything that invalidates analytics after a
 * subscription changes refreshes the Calendar too.
 */
export const calendarMonthKey = (month: MonthKey) =>
  [...queryKeys.analytics.all, 'calendar-month', month] as const;

export function getMonth(month: MonthKey): Promise<Upcoming> {
  return request<Upcoming>('/analytics/upcoming', {
    query: { start: firstDay(month), end: lastDay(month) },
  });
}
