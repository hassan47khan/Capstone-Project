/**
 * Session provider tests.
 *
 * What these prove
 *   That a cold start only signs the user out when the server has actually
 *   rejected their refresh token — not when the phone is offline or the backend
 *   is having a bad moment — and that signing out cannot be undone by a refresh
 *   that was already on the wire.
 *
 * Why these exist
 *   The obvious implementation treats every restore failure as "revoked" and
 *   deletes the refresh token. That passes a happy-path test and then signs out
 *   every user who opens the app on the subway, permanently: once the token is
 *   gone, the signal coming back does not bring the session with it.
 */
import { act, render, screen, waitFor } from '@testing-library/react-native';
import { http, HttpResponse } from 'msw';
import { useEffect } from 'react';
import { Text } from 'react-native';

import { __resetRefreshState, request } from '@/api/client';
import { MOCK_EMAILS } from '@/test/fixtures';
import { server } from '@/test/server';

import { SessionProvider, useSession, type SessionValue } from './SessionContext';
import { tokenStore } from './tokenStore';

/** A refresh token the mock route table accepts. */
const VALID_REFRESH = `mock-refresh-${MOCK_EMAILS.full}`;

/** The latest session value, so a test can call signOut from outside the tree. */
let session: SessionValue | null = null;

function Probe() {
  const value = useSession();

  // Captured in an effect, not during render, per the React purity rules.
  useEffect(() => {
    session = value;
  }, [value]);

  return <Text testID="status">{value.status}</Text>;
}

async function renderSession() {
  await render(
    <SessionProvider>
      <Probe />
    </SessionProvider>,
  );
}

/** Waits until the provider has finished its cold-start restore. */
async function expectStatus(status: SessionValue['status']) {
  await waitFor(() => {
    expect(screen.getByTestId('status')).toHaveTextContent(status);
  });
}

beforeEach(async () => {
  __resetRefreshState();
  await tokenStore.clear();
  session = null;
});

describe('cold start', () => {
  it('us2_no_stored_token_starts_signed_out', async () => {
    await renderSession();

    await expectStatus('unauthenticated');
  });

  it('us2_valid_refresh_token_restores_session', async () => {
    await tokenStore.setRefreshToken(VALID_REFRESH);

    await renderSession();

    await expectStatus('authenticated');
    expect(tokenStore.getAccessToken()).toBe(`mock-access-${MOCK_EMAILS.full}`);
  });

  it('us2_revoked_refresh_token_signs_out_and_clears_it', async () => {
    await tokenStore.setRefreshToken('mock-refresh-nobody@subtrak.test');

    await renderSession();

    await expectStatus('unauthenticated');
    expect(await tokenStore.getRefreshToken()).toBeNull();
  });

  /**
   * The bug this file was written for. Offline at launch must not delete a
   * perfectly good refresh token.
   */
  it('us2_offline_at_launch_keeps_the_session', async () => {
    server.use(http.post('*/auth/refresh', () => HttpResponse.error()));
    await tokenStore.setRefreshToken(VALID_REFRESH);

    await renderSession();

    await expectStatus('authenticated');
    expect(await tokenStore.getRefreshToken()).toBe(VALID_REFRESH);
  });

  it.each([429, 500, 503])(
    'us2_server_error_%i_at_launch_keeps_the_session',
    async (status) => {
      server.use(
        http.post('*/auth/refresh', () =>
          HttpResponse.json(
            { error: { code: 'server_error', message: 'down' } },
            { status },
          ),
        ),
      );
      await tokenStore.setRefreshToken(VALID_REFRESH);

      await renderSession();

      await expectStatus('authenticated');
      expect(await tokenStore.getRefreshToken()).toBe(VALID_REFRESH);
    },
  );

  it('us2_session_kept_offline_recovers_on_first_request_once_online', async () => {
    // Launch offline...
    server.use(http.post('*/auth/refresh', () => HttpResponse.error()));
    await tokenStore.setRefreshToken(VALID_REFRESH);
    await renderSession();
    await expectStatus('authenticated');
    expect(tokenStore.getAccessToken()).toBeNull();

    // ...then the signal comes back. The first request 401s for lack of an
    // access token, the client refreshes, and the replay succeeds.
    server.resetHandlers();
    const dashboard = await request<{ monthly_total: string }>('/dashboard');

    expect(dashboard.monthly_total).toBe('220.44');
    expect(tokenStore.getAccessToken()).toBe(`mock-access-${MOCK_EMAILS.full}`);
  });
});

describe('sign out', () => {
  it('us2_sign_out_clears_tokens', async () => {
    await tokenStore.setRefreshToken(VALID_REFRESH);
    await renderSession();
    await expectStatus('authenticated');

    await act(async () => {
      await session!.signOut();
    });

    await expectStatus('unauthenticated');
    expect(tokenStore.getAccessToken()).toBeNull();
    expect(await tokenStore.getRefreshToken()).toBeNull();
  });

  /**
   * A refresh is on the wire when the user signs out, and resolves afterwards
   * with a fresh token pair. If that pair were persisted, the next cold start
   * would restore the session the user just ended.
   */
  it('us2_refresh_resolving_after_sign_out_does_not_revive_session', async () => {
    await tokenStore.setRefreshToken(VALID_REFRESH);
    await renderSession();
    await expectStatus('authenticated');

    let releaseRefresh!: () => void;
    const refreshGate = new Promise<void>((resolve) => {
      releaseRefresh = resolve;
    });
    let refreshStarted!: () => void;
    const refreshHasStarted = new Promise<void>((resolve) => {
      refreshStarted = resolve;
    });

    server.use(
      http.get('*/dashboard', () =>
        HttpResponse.json(
          { error: { code: 'token_invalid', message: 'expired' } },
          { status: 401 },
        ),
      ),
      http.post('*/auth/refresh', async () => {
        refreshStarted();
        await refreshGate;
        return HttpResponse.json({ access: 'late-access', refresh: 'late-refresh' });
      }),
    );

    const pending = request('/dashboard').catch(() => undefined);
    await refreshHasStarted;

    await act(async () => {
      await session!.signOut();
    });
    releaseRefresh();
    await pending;

    await expectStatus('unauthenticated');
    expect(tokenStore.getAccessToken()).toBeNull();
    expect(await tokenStore.getRefreshToken()).toBeNull();
  });
});
