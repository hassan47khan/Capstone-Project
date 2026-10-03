/**
 * HTTP client tests.
 *
 * What these prove
 *   That the token lifecycle behaves correctly under the conditions that
 *   actually occur on a phone — several queries firing at once against an
 *   expired token, a dropped connection, a refresh token that has been revoked.
 *
 * The one that matters most is the single-flight test. Without it, the naive
 * "refresh on 401" implementation passes every other test here and still signs
 * users out at random, because the bug only appears when requests overlap.
 *
 * These run against MSW rather than the in-app mock transport, so the real
 * `fetch` path, headers and status handling are exercised.
 */
import { http, HttpResponse } from 'msw';

import {
  __resetRefreshState,
  configureTokenHooks,
  newIdempotencyKey,
  request,
} from './client';
import { ApiError } from './errors';
import { server } from '@/test/server';
import { MOCK_EMAILS, MOCK_PASSWORD } from '@/test/fixtures';

/**
 * Awaits a request that is expected to fail and returns its ApiError, typed.
 *
 * Written as a helper rather than `.catch((e) => e as ApiError)` because that
 * cast lies: if the promise RESOLVES, the test silently asserts against a
 * success value as though it were an error, and passes for the wrong reason.
 * This fails loudly instead.
 */
async function expectApiError(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ApiError) return error;
    throw error;
  }
  throw new Error('Expected the request to reject with an ApiError, but it resolved.');
}

/** A controllable stand-in for the session layer. */
function installTokens(options: {
  access?: string | null;
  refresh?: string | null;
  onRefreshed?: jest.Mock;
  onFailed?: jest.Mock;
}) {
  let access = options.access ?? null;

  const onTokensRefreshed =
    options.onRefreshed ??
    jest.fn(async (tokens: { access: string }) => {
      access = tokens.access;
    });

  configureTokenHooks({
    getAccessToken: () => access,
    getRefreshToken: async () => options.refresh ?? null,
    onTokensRefreshed: async (tokens) => {
      access = tokens.access;
      await onTokensRefreshed(tokens);
    },
    onRefreshFailed: options.onFailed ?? jest.fn(async () => {}),
  });

  return { onTokensRefreshed };
}

beforeEach(() => {
  __resetRefreshState();
  installTokens({ access: `mock-access-${MOCK_EMAILS.full}` });
});

describe('successful requests', () => {
  it('returns the parsed body', async () => {
    const dashboard = await request<{ monthly_total: string }>('/dashboard');
    expect(dashboard.monthly_total).toBe('220.44');
  });

  it('sends the access token as a bearer header', async () => {
    let seen: string | null = null;
    server.use(
      http.get('*/dashboard', ({ request: req }) => {
        seen = req.headers.get('authorization');
        return HttpResponse.json({ ok: true });
      }),
    );

    await request('/dashboard');
    expect(seen).toBe(`Bearer mock-access-${MOCK_EMAILS.full}`);
  });

  it('omits the token on an anonymous request', async () => {
    // Auth endpoints must not send a stale token: a 401 from them means "wrong
    // password", and sending a token would muddy that.
    let seen: string | null = 'not-checked';
    server.use(
      http.post('*/auth/login', ({ request: req }) => {
        seen = req.headers.get('authorization');
        return HttpResponse.json({ access: 'a', refresh: 'b' });
      }),
    );

    await request('/auth/login', {
      method: 'POST',
      body: { email: MOCK_EMAILS.full, password: MOCK_PASSWORD },
      anonymous: true,
    });

    expect(seen).toBeNull();
  });

  it('appends query parameters and drops undefined ones', async () => {
    let url = '';
    server.use(
      http.get('*/subscriptions', ({ request: req }) => {
        url = req.url;
        return HttpResponse.json({ results: [], next: null, count: 0 });
      }),
    );

    await request('/subscriptions', { query: { status: 'active', category: undefined } });

    expect(url).toContain('status=active');
    expect(url).not.toContain('category');
  });

  it('sends an Idempotency-Key when one is supplied', async () => {
    // Specification section 12: protects against a retried create producing a
    // duplicate subscription.
    let seen: string | null = null;
    server.use(
      http.post('*/subscriptions', ({ request: req }) => {
        seen = req.headers.get('idempotency-key');
        return HttpResponse.json({ id: 'sub_1' }, { status: 201 });
      }),
    );

    await request('/subscriptions', {
      method: 'POST',
      body: { name: 'Test' },
      idempotencyKey: 'key-123',
    });

    expect(seen).toBe('key-123');
  });

  it('handles a 204 with no body', async () => {
    // Calling .json() on a 204 throws, so this is its own path.
    await expect(
      request('/subscriptions/sub_netflix', { method: 'DELETE' }),
    ).resolves.toBeNull();
  });
});

describe('token refresh', () => {
  it('refreshes once and replays the original request on a 401', async () => {
    let dashboardCalls = 0;
    let refreshCalls = 0;

    server.use(
      http.get('*/dashboard', () => {
        dashboardCalls += 1;
        // Expired on the first attempt, fine once the token is refreshed.
        if (dashboardCalls === 1) {
          return HttpResponse.json(
            { error: { code: 'token_invalid', message: 'expired' } },
            { status: 401 },
          );
        }
        return HttpResponse.json({ monthly_total: '220.44' });
      }),
      http.post('*/auth/refresh', () => {
        refreshCalls += 1;
        return HttpResponse.json({ access: 'fresh-access', refresh: 'fresh-refresh' });
      }),
    );

    installTokens({ access: 'stale', refresh: 'valid-refresh' });

    const result = await request<{ monthly_total: string }>('/dashboard');

    expect(result.monthly_total).toBe('220.44');
    expect(refreshCalls).toBe(1);
    expect(dashboardCalls).toBe(2);
  });

  /**
   * The single-flight guarantee, and the reason this module has a module-level
   * promise rather than a plain async function.
   *
   * Five queries fire together against an expired token. The naive
   * implementation sends five refresh requests; with refresh-token rotation the
   * first invalidates the other four, and the user is signed out mid-session
   * even though nothing was wrong.
   */
  it('sends only ONE refresh when several requests 401 at the same time', async () => {
    let refreshCalls = 0;
    const expired = new Set([
      '/dashboard',
      '/analytics',
      '/subscriptions',
      '/me',
      '/currencies',
    ]);

    server.use(
      http.post('*/auth/refresh', async () => {
        refreshCalls += 1;
        // A real refresh takes time; the delay is what gives a broken
        // implementation the window to fire duplicates.
        await new Promise((resolve) => setTimeout(resolve, 20));
        return HttpResponse.json({ access: 'fresh-access', refresh: 'fresh-refresh' });
      }),
      http.get('*', ({ request: req }) => {
        const path = new URL(req.url).pathname.replace(/^.*\/api\/v1/, '');
        const token = req.headers.get('authorization');

        if (token === 'Bearer stale' && expired.has(path)) {
          return HttpResponse.json(
            { error: { code: 'token_invalid', message: 'expired' } },
            { status: 401 },
          );
        }
        return HttpResponse.json({ path });
      }),
    );

    installTokens({ access: 'stale', refresh: 'valid-refresh' });

    const results = await Promise.all(
      [...expired].map((path) => request<{ path: string }>(path)),
    );

    expect(refreshCalls).toBe(1);
    expect(results).toHaveLength(5);
    // Every one of them succeeded; none was sacrificed to the rotation.
    expect(results.every((r) => typeof r.path === 'string')).toBe(true);
  });

  it('signs the user out when the refresh token is rejected', async () => {
    const onFailed = jest.fn(async () => {});

    server.use(
      http.get('*/dashboard', () =>
        HttpResponse.json(
          { error: { code: 'token_invalid', message: 'expired' } },
          { status: 401 },
        ),
      ),
      http.post('*/auth/refresh', () =>
        HttpResponse.json(
          { error: { code: 'token_invalid', message: 'revoked' } },
          { status: 401 },
        ),
      ),
    );

    installTokens({ access: 'stale', refresh: 'revoked-refresh', onFailed });

    await expect(request('/dashboard')).rejects.toBeInstanceOf(ApiError);
    expect(onFailed).toHaveBeenCalled();
  });

  it('does not attempt a refresh for an anonymous request', async () => {
    // A 401 from /auth/login is a wrong password, not an expired session.
    let refreshCalls = 0;
    server.use(
      http.post('*/auth/refresh', () => {
        refreshCalls += 1;
        return HttpResponse.json({});
      }),
    );

    await expect(
      request('/auth/login', {
        method: 'POST',
        body: { email: MOCK_EMAILS.full, password: 'wrong' },
        anonymous: true,
      }),
    ).rejects.toMatchObject({ code: 'invalid_credentials' });

    expect(refreshCalls).toBe(0);
  });

  it('does not sign the user out when the refresh itself fails offline', async () => {
    // Losing signal during a refresh is not evidence the session is invalid.
    const onFailed = jest.fn(async () => {});

    server.use(
      http.get('*/dashboard', () =>
        HttpResponse.json(
          { error: { code: 'token_invalid', message: 'x' } },
          { status: 401 },
        ),
      ),
      http.post('*/auth/refresh', () => HttpResponse.error()),
    );

    installTokens({ access: 'stale', refresh: 'valid-refresh', onFailed });

    await expect(request('/dashboard')).rejects.toBeInstanceOf(ApiError);
    expect(onFailed).not.toHaveBeenCalled();
  });
});

describe('error mapping', () => {
  it('maps the standard error envelope onto ApiError', async () => {
    await expect(
      request('/auth/login', {
        method: 'POST',
        body: { email: MOCK_EMAILS.full, password: 'wrong' },
        anonymous: true,
      }),
    ).rejects.toMatchObject({
      status: 401,
      code: 'invalid_credentials',
      // The exact wording from the acceptance criteria.
      message: 'Incorrect email or password',
    });
  });

  it('exposes per-field messages so a form can show them inline', async () => {
    try {
      await request('/subscriptions', {
        method: 'POST',
        body: { name: 'Test', price: '0' },
      });
      throw new Error('should have rejected');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      const apiError = error as ApiError;
      expect(apiError.code).toBe('price_invalid');
      expect(apiError.fields?.price?.[0]).toBe('Enter a valid price greater than $0.');
    }
  });

  it('reports a lockout distinctly from bad credentials', async () => {
    const error = await expectApiError(
      request('/auth/login', {
        method: 'POST',
        body: { email: MOCK_EMAILS.locked, password: MOCK_PASSWORD },
        anonymous: true,
      }),
    );

    expect(error.status).toBe(423);
    expect(error.isLockout).toBe(true);
    expect(error.isAuthFailure).toBe(false);
  });

  it('turns a dropped connection into an offline error, not a server error', async () => {
    server.use(http.get('*/dashboard', () => HttpResponse.error()));

    const error = await expectApiError(request('/dashboard'));

    expect(error.isOffline).toBe(true);
    expect(error.code).toBe('network_error');
    expect(error.isRetryable).toBe(true);
  });

  it('does not leak a non-JSON error body into the message', async () => {
    // A proxy error page must not end up rendered on screen as HTML.
    server.use(
      http.get('*/dashboard', () =>
        HttpResponse.text('<html><body>502 Bad Gateway</body></html>', { status: 502 }),
      ),
    );

    const error = await expectApiError(request('/dashboard'));

    expect(error.message).not.toContain('<html>');
    expect(error.code).toBe('server_error');
  });

  it('marks a 400 as not retryable', async () => {
    // Retrying the same invalid form sends the same invalid data.
    const error = await expectApiError(
      request('/subscriptions', { method: 'POST', body: { name: '', price: '1.00' } }),
    );

    expect(error.status).toBe(400);
    expect(error.isRetryable).toBe(false);
  });
});

describe('idempotency keys', () => {
  it('generates a different key each time', () => {
    const keys = new Set(Array.from({ length: 100 }, () => newIdempotencyKey()));
    expect(keys.size).toBe(100);
  });
});
