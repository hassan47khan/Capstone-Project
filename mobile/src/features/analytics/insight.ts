/**
 * The Analytics AI insight (handoff 08 §2.0): GET /analytics/insight.
 *
 * The server words one sentence from figures it computed itself, checks every
 * number in it against those figures (11 §2.7), and falls back to a template
 * sentence when the model is unavailable or strays. The client shows the text
 * exactly as sent: it never rewords, recomputes or reformats it.
 *
 * Kept in this folder so we don't edit src/api; the types come straight from
 * the generated schema, so a contract change is a compile error here.
 */
import { request } from '@/api/client';
import type { components } from '@/api/contract';
import { queryKeys } from '@/api/queryKeys';

export type Insight = components['schemas']['Insight'];
export type InsightResponse = components['schemas']['InsightResponse'];

/**
 * Under analytics.all, so a subscription add, edit or delete refreshes it with
 * the rest of the figures (subscriptionWriteInvalidations).
 */
export const insightKey = () => [...queryKeys.analytics.all, 'insight'] as const;

export function getInsight(): Promise<InsightResponse> {
  return request<InsightResponse>('/analytics/insight');
}
