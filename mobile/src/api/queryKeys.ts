/**
 * TanStack Query cache keys.
 *
 * What this is for
 *   Every key the query cache uses, in one place. Hooks read from here instead
 *   of writing array literals inline.
 *
 * Why it matters more than it looks
 *   A cache key typed as a literal in two files is two different caches. The
 *   classic symptom: you add a subscription, the list refreshes, and the Home
 *   total does not — because the mutation invalidated `['dashboard']` while the
 *   screen was reading `['dashboard', undefined]`. Centralising the keys makes
 *   that impossible, and makes "what does this mutation invalidate?" answerable
 *   by reading one file.
 *
 * The hierarchy
 *   Keys are arrays ordered general to specific, so a broad invalidation sweeps
 *   the narrow ones. Invalidating `queryKeys.subscriptions.all` also clears
 *   every filtered list and every detail view beneath it, because TanStack Query
 *   matches keys by prefix.
 */

import type { Category } from '@/theme/tokens';

import type { SubscriptionStatus } from './types';

export const queryKeys = {
  /** Epic A — the signed-in user's own identity. */
  session: {
    all: ['session'] as const,
    profile: () => [...queryKeys.session.all, 'profile'] as const,
  },

  /** Epic B — settings and preferences. */
  settings: {
    all: ['settings'] as const,
    detail: () => [...queryKeys.settings.all, 'detail'] as const,
    notificationPreferences: () => [...queryKeys.settings.all, 'notifications'] as const,
  },

  /** Epic B — the currency picker list. */
  currencies: {
    all: ['currencies'] as const,
    list: () => [...queryKeys.currencies.all, 'list'] as const,
  },

  /** Epic C — the Home screen. */
  dashboard: {
    all: ['dashboard'] as const,
    summary: () => [...queryKeys.dashboard.all, 'summary'] as const,
    categoryBreakdown: () => [...queryKeys.dashboard.all, 'categories'] as const,
  },

  /** Epic C — the subscription list and detail screens. */
  subscriptions: {
    all: ['subscriptions'] as const,
    /**
     * Filters are part of the key, so switching a chip fetches (or serves from
     * cache) the right list rather than reusing the previous one.
     */
    list: (filters?: { status?: SubscriptionStatus; category?: Category }) =>
      [...queryKeys.subscriptions.all, 'list', filters ?? {}] as const,
    detail: (id: string) => [...queryKeys.subscriptions.all, 'detail', id] as const,
  },

  /** Epic C — the Insights screen. */
  analytics: {
    all: ['analytics'] as const,
    summary: () => [...queryKeys.analytics.all, 'summary'] as const,
  },

  /**
   * Epic G seam (US-16). Nothing fetches this yet.
   *
   * It is declared now so that when billing history is built, the key is already
   * nested under its subscription — which means
   * `invalidateQueries({ queryKey: queryKeys.subscriptions.detail(id) })` will
   * not accidentally miss it, and the shape of the cache does not have to change
   * later.
   */
  billingEvents: {
    all: ['billingEvents'] as const,
    forSubscription: (subscriptionId: string) =>
      [...queryKeys.billingEvents.all, subscriptionId] as const,
  },
} as const;

/**
 * Everything a change to a subscription invalidates.
 *
 * Creating, editing or deleting a subscription moves the dashboard totals, the
 * category breakdown and the Insights figures as well as the list itself.
 * Exporting the set means a new mutation cannot forget one — which is how the
 * "I deleted it but the total did not change" class of bug happens.
 */
export const subscriptionWriteInvalidations = [
  queryKeys.subscriptions.all,
  queryKeys.dashboard.all,
  queryKeys.analytics.all,
] as const;

/**
 * Everything a settings change invalidates.
 *
 * Changing the display currency re-converts every total on the server, so the
 * dashboard, the analytics and the subscription list all need refetching — not
 * just the settings screen the user is looking at.
 */
export const settingsWriteInvalidations = [
  queryKeys.settings.all,
  queryKeys.dashboard.all,
  queryKeys.analytics.all,
  queryKeys.subscriptions.all,
] as const;
