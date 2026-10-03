/**
 * The mock API route table.
 *
 * What this is for
 *   One implementation of the fake backend, shared by two consumers:
 *     - Jest, through the thin MSW wrappers in handlers.ts
 *     - the running app, through the mock transport branch in src/api/client.ts
 *
 * Why one table instead of two sets of mocks
 *   If the tests and the app had separate mocks they would drift, and a screen
 *   could pass its test while being broken in Expo Go. Sharing the table means
 *   the behaviour is identical in both, and a new endpoint is added in one place.
 *
 * Why the handlers are pure functions
 *   `(request) => response`, no I/O, no MSW types. That is what lets the same
 *   function serve a `fetch` interceptor in Jest and a synthetic `Response` in
 *   the app. It also makes the table trivially testable on its own.
 *
 * What it is NOT
 *   A simulator of the real backend. It validates only what the UI needs to
 *   branch on, and its auth is a string comparison, not a JWT. Anything subtle
 *   about the real API — serialization, headers, pagination edges — is only
 *   discovered against the real thing.
 */

import type { ApiErrorBody, Subscription, SubscriptionInput } from '@/api/types';

import {
  defaultAccount,
  MOCK_EMAILS,
  MOCK_PASSWORD,
  mockAccounts,
  mockCurrencies,
  mockNotificationPreferences,
} from './fixtures';

// ---------------------------------------------------------------------------
// Request and response shapes
// ---------------------------------------------------------------------------

export interface MockRequest {
  method: string;
  /** Path only, with the `/api/v1` prefix already stripped, e.g. `/subscriptions`. */
  path: string;
  /** Path parameters captured from the pattern, e.g. `{ id: 'sub_netflix' }`. */
  params: Record<string, string>;
  query: Record<string, string>;
  body: unknown;
  headers: Record<string, string>;
}

export interface MockResponse {
  status: number;
  body: unknown;
}

export type MockHandler = (request: MockRequest) => MockResponse;

interface Route {
  method: string;
  /** Pattern with `:name` segments, e.g. `/subscriptions/:id`. */
  pattern: string;
  handler: MockHandler;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Builds the standard error envelope from specification section 5. */
function fail(
  status: number,
  code: string,
  message: string,
  fields?: Record<string, string[]>,
): MockResponse {
  const body: ApiErrorBody = { error: { code, message, ...(fields ? { fields } : {}) } };
  return { status, body };
}

const ok = (body: unknown, status = 200): MockResponse => ({ status, body });

/**
 * Mock tokens are readable on purpose: `mock-access-alex@subtrak.test` says who
 * it belongs to at a glance when you are debugging a failing test. A real JWT
 * would add nothing here except noise.
 */
const accessTokenFor = (email: string) => `mock-access-${email}`;
const refreshTokenFor = (email: string) => `mock-refresh-${email}`;

/**
 * Resolves the caller from the Authorization header.
 *
 * Returns null for a missing or unrecognised token, which every protected route
 * turns into a 401 — the same thing the real API does, and what drives the
 * client's token-refresh path.
 */
function authenticate(request: MockRequest) {
  const header = request.headers.authorization ?? request.headers.Authorization ?? '';
  const token = header.replace(/^Bearer\s+/i, '');

  const email = token.startsWith('mock-access-')
    ? token.slice('mock-access-'.length)
    : null;
  if (!email) return null;

  return mockAccounts[email] ?? null;
}

const UNAUTHORIZED = fail(
  401,
  'token_invalid',
  'Your session has expired. Please log in again.',
);

/** Wraps a handler so it only runs for an authenticated caller. */
function protectedRoute(
  handler: (
    request: MockRequest,
    account: NonNullable<ReturnType<typeof authenticate>>,
  ) => MockResponse,
): MockHandler {
  return (request) => {
    const account = authenticate(request);
    if (!account) return UNAUTHORIZED;
    return handler(request, account);
  };
}

/**
 * Mutable copy of the subscription list, so creates, edits and deletes persist
 * for the lifetime of the app session or the test file. `resetMockState()` puts
 * it back, and setup.tsx calls that between tests.
 */
let subscriptionOverrides: Record<string, Subscription[]> = {};
let preferences = { ...mockNotificationPreferences };
let nextId = 1;

export function resetMockState(): void {
  subscriptionOverrides = {};
  preferences = { ...mockNotificationPreferences };
  nextId = 1;
}

function subscriptionsFor(email: string): Subscription[] {
  return subscriptionOverrides[email] ?? mockAccounts[email]?.subscriptions ?? [];
}

function setSubscriptions(email: string, next: Subscription[]): void {
  subscriptionOverrides[email] = next;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export const routes: Route[] = [
  // --- Epic A: Account Management -----------------------------------------

  {
    method: 'POST',
    pattern: '/auth/register',
    handler: (request) => {
      const { email, password } = (request.body ?? {}) as {
        email?: string;
        password?: string;
      };

      if (!email || !password) {
        return fail(400, 'validation_error', 'Enter an email address and a password.', {
          ...(email ? {} : { email: ['Enter your email address.'] }),
          ...(password ? {} : { password: ['Enter a password.'] }),
        });
      }

      // Password policy, specification section 6: 8+ characters, one number, one
      // special character. The API returns the UNMET rule so the form can show
      // it inline rather than repeating the whole policy as an error.
      const unmet: string[] = [];
      if (password.length < 8) unmet.push('Use at least 8 characters.');
      if (!/\d/.test(password)) unmet.push('Include at least one number.');
      if (!/[^A-Za-z0-9]/.test(password))
        unmet.push('Include at least one special character.');

      if (unmet.length > 0) {
        return fail(400, 'validation_error', unmet[0]!, { password: unmet });
      }

      // 409 is the duplicate-email case the sign-up form must show inline.
      if (mockAccounts[email]) {
        return fail(409, 'duplicate_email', 'An account with this email already exists.');
      }

      // Registration creates an INACTIVE user and emails a link. No tokens yet.
      return ok({ email, verification_sent: true }, 201);
    },
  },

  {
    method: 'POST',
    pattern: '/auth/login',
    handler: (request) => {
      const { email, password } = (request.body ?? {}) as {
        email?: string;
        password?: string;
      };

      // Lockout is checked BEFORE the password (specification section 6), so a
      // locked account reports 423 whether or not the password is right.
      if (email === MOCK_EMAILS.locked) {
        return fail(
          423,
          'account_locked',
          'Too many failed attempts. Try again in 15 minutes.',
        );
      }

      const account = email ? mockAccounts[email] : undefined;

      // One generic message for both unknown email and wrong password, so the
      // endpoint cannot be used to discover which addresses are registered.
      if (!account || password !== MOCK_PASSWORD) {
        return fail(401, 'invalid_credentials', 'Incorrect email or password');
      }

      return ok({
        access: accessTokenFor(account.profile.email),
        refresh: refreshTokenFor(account.profile.email),
      });
    },
  },

  {
    method: 'POST',
    pattern: '/auth/refresh',
    handler: (request) => {
      const { refresh } = (request.body ?? {}) as { refresh?: string };

      if (!refresh?.startsWith('mock-refresh-')) {
        return fail(
          401,
          'token_invalid',
          'Your session has expired. Please log in again.',
        );
      }

      const email = refresh.slice('mock-refresh-'.length);
      if (!mockAccounts[email]) {
        return fail(
          401,
          'token_invalid',
          'Your session has expired. Please log in again.',
        );
      }

      // Refresh rotation: a new refresh token comes back alongside the access one.
      return ok({ access: accessTokenFor(email), refresh: refreshTokenFor(email) });
    },
  },

  {
    method: 'POST',
    pattern: '/auth/verify-email',
    handler: (request) => {
      const { token } = (request.body ?? {}) as { token?: string };

      if (token === 'expired') {
        return fail(400, 'token_expired', 'This link has expired. Request a new one.');
      }
      if (!token) {
        return fail(400, 'token_invalid', 'This link is not valid.');
      }
      return ok({ verified: true });
    },
  },

  {
    method: 'POST',
    pattern: '/auth/resend-verification',
    handler: () => ok({ verification_sent: true }),
  },

  {
    method: 'POST',
    pattern: '/auth/password-reset/request',
    // Always the same answer, registered or not, so the endpoint reveals nothing
    // about which addresses exist (specification section 6).
    handler: () => ok({ sent: true }),
  },

  {
    method: 'POST',
    pattern: '/auth/password-reset/confirm',
    handler: (request) => {
      const { token, password } = (request.body ?? {}) as {
        token?: string;
        password?: string;
      };

      if (token === 'expired' || token === 'used') {
        return fail(400, 'token_expired', 'This link has expired. Request a new one.');
      }
      if (!password || password.length < 8) {
        return fail(400, 'validation_error', 'Use at least 8 characters.', {
          password: ['Use at least 8 characters.'],
        });
      }
      return ok({ reset: true });
    },
  },

  // --- Epic B: Settings and Preferences ------------------------------------

  {
    method: 'GET',
    pattern: '/me',
    handler: protectedRoute((_request, account) => ok(account.profile)),
  },

  {
    method: 'PATCH',
    pattern: '/me',
    handler: protectedRoute((request, account) =>
      ok({ ...account.profile, ...(request.body as object) }),
    ),
  },

  {
    method: 'GET',
    pattern: '/me/settings',
    handler: protectedRoute((_request, account) => ok(account.settings)),
  },

  {
    method: 'PATCH',
    pattern: '/me/settings',
    handler: protectedRoute((request, account) => {
      const patch = (request.body ?? {}) as { currency?: string };

      // A currency with no stored rate must not be selectable (US-4). The server
      // rejects it rather than trusting the client to have filtered the list.
      if (patch.currency) {
        const option = mockCurrencies.find((c) => c.code === patch.currency);
        if (!option || !option.rate_available) {
          return fail(
            400,
            'validation_error',
            'That currency is not available right now.',
            {
              currency: ['No exchange rate is available for this currency.'],
            },
          );
        }
      }

      const next = { ...account.settings, ...patch };
      if (patch.currency) next.currency = patch.currency;
      return ok(next);
    }),
  },

  {
    method: 'GET',
    pattern: '/me/notification-preferences',
    handler: protectedRoute(() => ok(preferences)),
  },

  {
    method: 'PUT',
    pattern: '/me/notification-preferences',
    handler: protectedRoute((request) => {
      preferences = { ...preferences, ...(request.body as object) };
      return ok(preferences);
    }),
  },

  {
    method: 'GET',
    pattern: '/currencies',
    handler: protectedRoute(() => ok({ results: mockCurrencies })),
  },

  // --- Epic C: Dashboard and Expense Tracking ------------------------------

  {
    method: 'GET',
    pattern: '/dashboard',
    handler: protectedRoute((_request, account) => ok(account.dashboard)),
  },

  {
    method: 'GET',
    pattern: '/dashboard/category-breakdown',
    handler: protectedRoute((_request, account) =>
      ok({
        currency: account.dashboard.currency,
        rows: account.dashboard.category_breakdown,
      }),
    ),
  },

  {
    method: 'GET',
    pattern: '/analytics',
    handler: protectedRoute((_request, account) => ok(account.analytics)),
  },

  {
    method: 'GET',
    pattern: '/subscriptions',
    handler: protectedRoute((request, account) => {
      let results = subscriptionsFor(account.profile.email);

      // Server-side filters the list screen relies on.
      if (request.query.status) {
        results = results.filter((s) => s.status === request.query.status);
      }
      if (request.query.category) {
        results = results.filter((s) => s.category === request.query.category);
      }

      return ok({ results, next: null, count: results.length });
    }),
  },

  {
    method: 'POST',
    pattern: '/subscriptions',
    handler: protectedRoute((request, account) => {
      const input = (request.body ?? {}) as Partial<SubscriptionInput>;

      if (!input.name?.trim()) {
        return fail(400, 'validation_error', 'Enter a name.', {
          name: ['Enter a name.'],
        });
      }

      // US-7: the price must be greater than zero. Compared as a string-safe
      // numeric check, since the value arrives as a decimal string.
      if (
        !input.price ||
        !/^\d+(\.\d+)?$/.test(input.price) ||
        Number(input.price) <= 0
      ) {
        return fail(400, 'price_invalid', 'Enter a valid price greater than $0.', {
          price: ['Enter a valid price greater than $0.'],
        });
      }

      const created: Subscription = {
        id: `sub_new_${nextId++}`,
        name: input.name.trim(),
        category: input.category ?? null,
        price: input.price,
        currency: input.currency ?? 'USD',
        cycle: input.cycle ?? { unit: 'month', count: 1 },
        next_renewal_on: input.next_renewal_on ?? '2026-11-01',
        status: input.status ?? 'active',
        trial: input.trial ?? null,
        monthly_equivalent: input.price,
        reminder_enabled: input.reminder_enabled ?? true,
        revisions: [],
        created_at: '2026-09-30T12:00:00Z',
      };

      setSubscriptions(account.profile.email, [
        ...subscriptionsFor(account.profile.email),
        created,
      ]);

      return ok(created, 201);
    }),
  },

  {
    method: 'GET',
    pattern: '/subscriptions/:id',
    handler: protectedRoute((request, account) => {
      const found = subscriptionsFor(account.profile.email).find(
        (s) => s.id === request.params.id,
      );

      // 404 rather than 403 for someone else's record, so ids cannot be probed
      // (specification section 5).
      if (!found) return fail(404, 'not_found', 'This subscription could not be found.');
      return ok(found);
    }),
  },

  {
    method: 'PATCH',
    pattern: '/subscriptions/:id',
    handler: protectedRoute((request, account) => {
      const list = subscriptionsFor(account.profile.email);
      const index = list.findIndex((s) => s.id === request.params.id);
      if (index === -1)
        return fail(404, 'not_found', 'This subscription could not be found.');

      const patch = (request.body ?? {}) as Partial<SubscriptionInput>;

      if (
        patch.price !== undefined &&
        (!/^\d+(\.\d+)?$/.test(patch.price) || Number(patch.price) <= 0)
      ) {
        return fail(400, 'price_invalid', 'Enter a valid price greater than $0.', {
          price: ['Enter a valid price greater than $0.'],
        });
      }

      const previous = list[index]!;
      const updated: Subscription = {
        ...previous,
        ...patch,
        // Editing a price appends a revision but raises no alert, because the
        // user made the change themselves (specification section 9).
        revisions:
          patch.price && patch.price !== previous.price
            ? [
                ...previous.revisions,
                {
                  changed_at: '2026-09-30T12:00:00Z',
                  field: 'price',
                  old: previous.price,
                  new: patch.price,
                },
              ]
            : previous.revisions,
        monthly_equivalent: patch.price ?? previous.monthly_equivalent,
      };

      const next = [...list];
      next[index] = updated;
      setSubscriptions(account.profile.email, next);

      return ok(updated);
    }),
  },

  {
    method: 'DELETE',
    pattern: '/subscriptions/:id',
    handler: protectedRoute((request, account) => {
      const list = subscriptionsFor(account.profile.email);
      if (!list.some((s) => s.id === request.params.id)) {
        return fail(404, 'not_found', 'This subscription could not be found.');
      }

      // Soft delete: the record leaves the list, and billing history would
      // survive on the server (US-7).
      setSubscriptions(
        account.profile.email,
        list.filter((s) => s.id !== request.params.id),
      );
      return { status: 204, body: null };
    }),
  },

  // --- Operations -----------------------------------------------------------

  {
    method: 'GET',
    pattern: '/health',
    handler: () => ok({ status: 'ok', mocked: true }),
  },

  /**
   * Deliberate failure endpoints, so a screen's error, throttle and outage states
   * are reachable in the running app and not only in tests.
   */
  {
    method: 'GET',
    pattern: '/__mock__/throttled',
    handler: () => fail(429, 'throttled', 'Too many requests. Try again in a moment.'),
  },
  {
    method: 'GET',
    pattern: '/__mock__/server-error',
    handler: () => fail(503, 'server_error', 'SubTrak is temporarily unavailable.'),
  },
];

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

/**
 * Matches a concrete path against a `:param` pattern.
 * Returns the captured parameters, or null when the pattern does not apply.
 */
function matchPattern(pattern: string, path: string): Record<string, string> | null {
  const patternParts = pattern.split('/').filter(Boolean);
  const pathParts = path.split('/').filter(Boolean);

  if (patternParts.length !== pathParts.length) return null;

  const params: Record<string, string> = {};

  for (let i = 0; i < patternParts.length; i += 1) {
    const expected = patternParts[i]!;
    const actual = pathParts[i]!;

    if (expected.startsWith(':')) {
      params[expected.slice(1)] = decodeURIComponent(actual);
    } else if (expected !== actual) {
      return null;
    }
  }

  return params;
}

/**
 * Finds the handler for a method and path.
 *
 * Routes are tried in declaration order, so a literal pattern such as
 * `/subscriptions` is matched before `/subscriptions/:id` could ever shadow it.
 */
export function resolveRoute(
  method: string,
  path: string,
): { handler: MockHandler; params: Record<string, string> } | null {
  const upper = method.toUpperCase();

  for (const route of routes) {
    if (route.method !== upper) continue;
    const params = matchPattern(route.pattern, path);
    if (params) return { handler: route.handler, params };
  }

  return null;
}

/**
 * Runs the table for one request. This is the single entry point both consumers
 * call: MSW in Jest, and the mock transport in src/api/client.ts.
 *
 * An unmatched route returns 404 with the standard envelope rather than throwing,
 * so a typo in an endpoint path surfaces as a visible "not found" in the app
 * instead of an unhandled rejection.
 */
export function handleMockRequest(input: {
  method: string;
  path: string;
  query?: Record<string, string>;
  body?: unknown;
  headers?: Record<string, string>;
}): MockResponse {
  const match = resolveRoute(input.method, input.path);

  if (!match) {
    return fail(404, 'not_found', `No mock route for ${input.method} ${input.path}`);
  }

  return match.handler({
    method: input.method.toUpperCase(),
    path: input.path,
    params: match.params,
    query: input.query ?? {},
    body: input.body ?? null,
    headers: input.headers ?? {},
  });
}

/** Re-exported so tests can sign in without duplicating the token convention. */
export const mockTokens = {
  accessFor: accessTokenFor,
  refreshFor: refreshTokenFor,
  /** A valid access token for the full-featured account. */
  default: accessTokenFor(defaultAccount.profile.email),
};
