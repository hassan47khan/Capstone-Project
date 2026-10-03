/**
 * The TanStack Query client.
 *
 * What this is for
 *   One configured cache for the whole app, plus a factory the tests use to get
 *   a clean one per test.
 *
 * Why these defaults
 *   Each one below is a decision about a mobile app specifically, not a copy of
 *   the library defaults. The comments say what would go wrong otherwise.
 */

import { QueryClient } from '@tanstack/react-query';

import { ApiError } from './errors';

/**
 * How many times to retry a failed query.
 *
 * Retrying a 400 resubmits the same invalid data; retrying a 401 races the
 * refresh logic in client.ts; retrying a 404 cannot help. Only genuinely
 * transient failures — offline, throttled, 5xx — are worth a second attempt,
 * and `ApiError.isRetryable` already encodes that judgement in one place.
 */
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= 2) return false;
  if (error instanceof ApiError) return error.isRetryable;
  return false;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: shouldRetry,
        // Exponential backoff, capped so a user staring at a spinner is never
        // waiting more than a few seconds for the next attempt.
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 5000),

        /**
         * Data is considered fresh for 30 seconds. Short, because subscription
         * totals change when the user edits something, and a stale total is
         * exactly the kind of wrong number people notice. Long enough that
         * moving between tabs does not refetch everything.
         */
        staleTime: 30_000,

        /**
         * Unused data is dropped from the cache after five minutes. (`gcTime` is
         * what v4 called `cacheTime`.)
         */
        gcTime: 5 * 60_000,

        /**
         * Refetch when the app returns from the background. On a phone this is
         * the main way a screen goes stale — the user switches away for an hour
         * and comes back expecting current figures.
         */
        refetchOnReconnect: true,
        refetchOnMount: true,
      },
      mutations: {
        // Never retry a mutation automatically. A retried create could produce a
        // duplicate subscription; the Idempotency-Key in client.ts protects
        // against a retry the user asks for, which is the only kind we want.
        retry: false,
      },
    },
  });
}

/** The app's shared client. Tests build their own with `createQueryClient()`. */
export const queryClient = createQueryClient();
