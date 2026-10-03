/**
 * Epic C endpoints — the subscription records themselves (US-6, US-7).
 *
 * What this is for
 *   List, read, create, edit and delete for subscriptions.
 *
 * The 404 convention
 *   Another user's subscription returns 404, not 403, so ids cannot be probed
 *   (specification section 5). The client therefore treats 404 as "not found or
 *   not yours" and shows one neutral not-found state — it must never say
 *   "you do not have permission", because that would confirm the record exists.
 */

import { newIdempotencyKey, request } from '../client';
import type { Category } from '@/theme/tokens';
import type {
  Paginated,
  Subscription,
  SubscriptionInput,
  SubscriptionStatus,
} from '../types';

export interface SubscriptionFilters {
  status?: SubscriptionStatus;
  category?: Category;
}

/**
 * The subscription list, already sorted by next renewal on the server.
 *
 * Filters are passed through as query parameters. The Subscriptions screen also
 * filters the loaded list client-side for its category chips and search box,
 * because that is instant and the lists are small.
 */
export function listSubscriptions(
  filters: SubscriptionFilters = {},
): Promise<Subscription[]> {
  return request<Paginated<Subscription>>('/subscriptions', {
    query: { status: filters.status, category: filters.category ?? undefined },
  }).then((page) => page.results);
}

/** One subscription. Throws a 404 ApiError if it is not the caller's. */
export function getSubscription(id: string): Promise<Subscription> {
  return request<Subscription>(`/subscriptions/${encodeURIComponent(id)}`);
}

/**
 * Creates a subscription (US-7).
 *
 * Carries an Idempotency-Key so a phone that loses its connection mid-request
 * and retries does not create the same subscription twice. The key is generated
 * per call here; a screen that retries the SAME submission should pass its own
 * key so the retry is recognised as a repeat rather than a new record.
 */
export function createSubscription(
  input: SubscriptionInput,
  idempotencyKey: string = newIdempotencyKey(),
): Promise<Subscription> {
  return request<Subscription>('/subscriptions', {
    method: 'POST',
    body: input,
    idempotencyKey,
  });
}

/**
 * Edits a subscription (US-7).
 *
 * Changing the price appends a revision server-side, visible in the price
 * history on the detail screen. It raises no price-increase alert, because the
 * user made the change themselves (specification section 9).
 */
export function updateSubscription(
  id: string,
  patch: Partial<SubscriptionInput>,
): Promise<Subscription> {
  return request<Subscription>(`/subscriptions/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: patch,
  });
}

/**
 * Deletes a subscription (US-7).
 *
 * A soft delete on the server: the record leaves every list, but its billing
 * history survives so past spend stays accurate.
 */
export function deleteSubscription(id: string): Promise<void> {
  return request<void>(`/subscriptions/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
