/**
 * The HTTP client.
 *
 * What this is for
 *   The single place the app talks to the API. It attaches the access token,
 *   refreshes it when it expires, normalises every failure into an `ApiError`,
 *   and — when mocks are on — serves the whole thing locally without touching
 *   the network.
 *
 * Why everything goes through one function
 *   Three rules have to hold on every single request, and the only way to
 *   guarantee that is to have one door:
 *     1. Never log a request body, a token, or a header. (Specification 11.)
 *     2. Refresh the access token at most once at a time. (See below.)
 *     3. Creates carry an Idempotency-Key. (Specification 12.)
 *
 * Single-flight refresh, and why the naive version is broken
 *   The Home screen fires several queries at once. If the access token has just
 *   expired they all get a 401 at the same moment. The obvious implementation —
 *   "on 401, refresh, then retry" — then fires five refresh calls in parallel.
 *   With refresh-token rotation, the first one succeeds and invalidates the
 *   token the other four are holding, so four of them fail and the user is
 *   thrown back to the login screen while their session was in fact fine.
 *
 *   The fix is to keep the in-flight refresh promise in a module variable. The
 *   first 401 starts the refresh; the rest await the same promise. One refresh
 *   call, one rotation, five successful retries.
 *
 * Mock transport
 *   When `env.useMocks` is true, requests are answered from the shared route
 *   table in src/test/routes.ts — the same table the Jest suite serves through
 *   MSW. The app therefore needs no MSW, no interceptors, and no URL or stream
 *   polyfills in its bundle. The tradeoff is that this path does not exercise
 *   real `fetch`, so serialization and header bugs show up only in Jest or
 *   against the real backend.
 */

import { env } from '@/config/env';

import { networkError, timeoutError, toApiError } from './errors';

/** Requests are abandoned after this long. Specification section 12. */
const REQUEST_TIMEOUT_MS = 15_000;

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export interface RequestOptions {
  method?: HttpMethod;
  /** Serialised as JSON. Never logged. */
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  /**
   * Skips the Authorization header and the refresh-on-401 retry. Used by the
   * auth endpoints themselves, where a 401 means "wrong password", not "token
   * expired" — retrying those would be both pointless and confusing.
   */
  anonymous?: boolean;
  /**
   * Opts this request into retry-safety. The server de-duplicates repeats with
   * the same key, so a phone that retries after a dropped connection does not
   * create two subscriptions.
   */
  idempotencyKey?: string;
}

// ---------------------------------------------------------------------------
// Token access
//
// The client does not own the tokens — the session layer does. It reads them
// through these hooks so that `client.ts` has no dependency on React, which is
// what lets it be used from plain functions and tested without a component.
// ---------------------------------------------------------------------------

export interface TokenHooks {
  getAccessToken: () => string | null;
  getRefreshToken: () => Promise<string | null>;
  /** Called after a successful refresh so the session layer can persist them. */
  onTokensRefreshed: (tokens: { access: string; refresh: string }) => Promise<void>;
  /** Called when refresh fails. The session layer signs the user out. */
  onRefreshFailed: () => Promise<void>;
}

/** No-op defaults, so the client is usable before the session provider mounts. */
let tokenHooks: TokenHooks = {
  getAccessToken: () => null,
  getRefreshToken: async () => null,
  onTokensRefreshed: async () => {},
  onRefreshFailed: async () => {},
};

/** Installed once by the session provider. */
export function configureTokenHooks(hooks: TokenHooks): void {
  tokenHooks = hooks;
}

// ---------------------------------------------------------------------------
// Single-flight refresh
// ---------------------------------------------------------------------------

/**
 * The in-flight refresh, or null when none is running.
 *
 * This module-level variable IS the single-flight mechanism. Everything else is
 * detail.
 */
let refreshInFlight: Promise<string | null> | null = null;

/**
 * Bumped whenever the session changes hands (sign-in, sign-out). A refresh
 * started under an older generation must not write its tokens back.
 *
 * Without this, a refresh that resolves just after the user taps Sign out
 * persists a brand-new refresh token into a signed-out app, and the next cold
 * start silently restores the session the user ended.
 */
let refreshGeneration = 0;

/**
 * Abandons any in-flight refresh. Called by the session layer on sign-in and
 * sign-out, BEFORE it touches token storage, so a late refresh result is
 * discarded rather than written over the new state.
 */
export function invalidateRefresh(): void {
  refreshGeneration += 1;
  refreshInFlight = null;
}

/**
 * Whether a refresh endpoint status means the refresh token itself is dead.
 *
 * Only these do. A 5xx or 429 says the server is struggling, not that the
 * session is invalid — signing everyone out because the backend restarted
 * would turn a blip into a mass logout.
 */
export function isRefreshRejected(status: number): boolean {
  return status === 400 || status === 401 || status === 403;
}

/**
 * Refreshes the access token, collapsing concurrent callers onto one request.
 * Resolves to the new access token, or null if the session is truly gone.
 */
async function refreshAccessToken(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;

  const generation = refreshGeneration;
  const isStale = () => generation !== refreshGeneration;

  // Declared before assignment so the `finally` below can compare against it
  // even if the body settles synchronously.
  let attempt: Promise<string | null> | null = null;

  attempt = (async () => {
    try {
      const refresh = await tokenHooks.getRefreshToken();
      if (!refresh || isStale()) return null;

      const response = await rawRequest('/auth/refresh', {
        method: 'POST',
        body: { refresh },
        anonymous: true,
      });

      // The session changed while we were waiting. Whatever came back belongs
      // to a session that no longer exists; act on none of it.
      if (isStale()) return null;

      if (isRefreshRejected(response.status)) {
        await tokenHooks.onRefreshFailed();
        return null;
      }

      // Any other failure is transient. Returning null surfaces the original
      // 401 to the caller without ending the session; the next request retries.
      if (response.status < 200 || response.status >= 300) {
        return null;
      }

      const tokens = response.body as { access?: string; refresh?: string };
      if (!tokens.access || !tokens.refresh) {
        await tokenHooks.onRefreshFailed();
        return null;
      }

      await tokenHooks.onTokensRefreshed({
        access: tokens.access,
        refresh: tokens.refresh,
      });
      return tokens.access;
    } catch {
      // A network failure during refresh is NOT a sign-out: the session may be
      // perfectly valid and the user merely in a lift. Returning null surfaces
      // the original error to the caller, which shows the offline state.
      return null;
    } finally {
      // Cleared whatever happened, so the next 401 can start a fresh attempt —
      // unless this attempt was abandoned and a newer one now holds the slot.
      if (refreshInFlight === attempt) refreshInFlight = null;
    }
  })();

  refreshInFlight = attempt;
  return attempt;
}

/** Test-only reset, so one test's in-flight refresh cannot leak into the next. */
export function __resetRefreshState(): void {
  invalidateRefresh();
}

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

interface RawResponse {
  status: number;
  body: unknown;
}

function buildUrl(path: string, query: RequestOptions['query']): string {
  const base = `${env.apiUrl}${path.startsWith('/') ? path : `/${path}`}`;
  if (!query) return base;

  const pairs = Object.entries(query)
    .filter(([, value]) => value !== undefined)
    .map(
      ([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`,
    );

  return pairs.length > 0 ? `${base}?${pairs.join('&')}` : base;
}

/**
 * Serves a request from the shared route table, without touching the network.
 *
 * The import is dynamic so the mock table and its fixtures are only pulled into
 * the bundle when mocks are actually enabled — a production build that never
 * calls this never loads them.
 */
async function mockRequest(path: string, options: RequestOptions): Promise<RawResponse> {
  const { handleMockRequest } = await import('@/test/routes');

  const headers: Record<string, string> = {};
  if (!options.anonymous) {
    const token = tokenHooks.getAccessToken();
    if (token) headers.authorization = `Bearer ${token}`;
  }

  const query: Record<string, string> = {};
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined) query[key] = String(value);
  }

  return handleMockRequest({
    method: options.method ?? 'GET',
    path,
    query,
    body: options.body,
    headers,
  });
}

/**
 * One network round trip. No auth retry, no error mapping — those live in
 * `request` below. Split out so the refresh call can use it without recursing.
 */
async function rawRequest(path: string, options: RequestOptions): Promise<RawResponse> {
  if (env.useMocks) {
    return mockRequest(path, options);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };

    if (!options.anonymous) {
      const token = tokenHooks.getAccessToken();
      if (token) headers.Authorization = `Bearer ${token}`;
    }

    if (options.idempotencyKey) {
      headers['Idempotency-Key'] = options.idempotencyKey;
    }

    const response = await fetch(buildUrl(path, options.query), {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });

    // 204 has no body, and calling .json() on it throws.
    if (response.status === 204) {
      return { status: 204, body: null };
    }

    const text = await response.text();
    let body: unknown = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        // A non-JSON body means something upstream of Django answered — a proxy
        // error page, say. Leaving body null lets toApiError produce a sensible
        // status-based message rather than leaking HTML into the UI.
        body = null;
      }
    }

    return { status: response.status, body };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Makes an API request.
 *
 * Resolves with the parsed body on success, and throws an `ApiError` on any
 * failure — HTTP error, timeout, or no connection at all.
 *
 * @throws {ApiError} always, rather than returning an error value, so that
 *   TanStack Query's error state and a plain try/catch both work naturally.
 */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  let response: RawResponse;

  try {
    response = await rawRequest(path, options);
  } catch (error) {
    // Deliberately not logged: the error can carry the URL and headers.
    if (error instanceof Error && error.name === 'AbortError') {
      throw timeoutError();
    }
    throw networkError();
  }

  // A 401 on an authenticated request means the access token expired. Refresh
  // once (shared across concurrent callers) and replay the original request.
  if (response.status === 401 && !options.anonymous) {
    const newToken = await refreshAccessToken();

    if (newToken) {
      try {
        response = await rawRequest(path, options);
      } catch {
        throw networkError();
      }
    }
  }

  if (response.status < 200 || response.status >= 300) {
    throw toApiError(response.status, response.body);
  }

  return response.body as T;
}

/**
 * Generates an Idempotency-Key for a create request.
 *
 * `Math.random` is fine here: this is a de-duplication token with no security
 * meaning, it only needs to be unique within one user's few seconds of retries,
 * and reaching for a crypto polyfill would add a dependency for nothing.
 */
export function newIdempotencyKey(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
