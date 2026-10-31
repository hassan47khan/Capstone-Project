/**
 * Session state.
 *
 * What this is for
 *   Answering one question for the whole app: is somebody signed in? The root
 *   navigator reads it to choose between the auth stack and the tab navigator,
 *   and the auth screens write to it.
 *
 * Why there are three states and not a boolean
 *   On a cold start the refresh token has to be read out of secure storage,
 *   which is asynchronous. With a boolean, the app renders "signed out" for a
 *   frame or two and a returning user sees the login screen flash before being
 *   thrown into the dashboard. `status: 'loading'` holds the splash until the
 *   answer is actually known.
 *
 * Why it wires the HTTP client's token hooks
 *   `src/api/client.ts` deliberately knows nothing about React, so it reads
 *   tokens through callbacks. This provider installs them, which is also how a
 *   failed refresh reaches the UI: the client calls `onRefreshFailed`, this
 *   clears the session, and the navigator swaps to the auth stack by itself. No
 *   screen has to handle "my token died" on its own.
 *
 * Phase 1 will add the screens that call `signIn`. The shape is settled now so
 * the navigation shell can be built and tested against it.
 */
import { useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import {
  configureTokenHooks,
  invalidateRefresh,
  isRefreshRejected,
  refreshSession,
} from '@/api/client';
import { authApi } from '@/api/endpoints';
import { ApiError } from '@/api/errors';
import type { TokenPair } from '@/api/types';

import { biometricStore } from './biometricStore';
import { tokenStore } from './tokenStore';

export type SessionStatus = 'loading' | 'authenticated' | 'unauthenticated';

export interface SessionValue {
  status: SessionStatus;

  /** Stores the tokens and flips the app into its authenticated state. */
  signIn: (tokens: TokenPair) => Promise<void>;

  /**
   * Clears the tokens and returns to the auth stack. A normal sign-out parks
   * the refresh token for biometric unlock on the next Log In; pass
   * `{ park: false }` when the user is abandoning the session (leaving an
   * unverified account) so it is discarded and cannot be resurrected.
   */
  signOut: (options?: { park?: boolean }) => Promise<void>;

  /**
   * Restores the session parked at sign-out, for biometric unlock on Log In.
   * The parked refresh token goes through the client's single-flight refresh,
   * the same path every other refresh takes. Throws ParkedSessionRejected when
   * the token is dead (it is forgotten), or ParkedSessionUnavailable when the
   * server cannot be reached (it is kept for next time).
   */
  restoreParked: () => Promise<void>;
}

/** The parked session is dead (expired or revoked) and has been forgotten. */
export class ParkedSessionRejected extends Error {
  constructor() {
    super('The saved session is no longer valid.');
    this.name = 'ParkedSessionRejected';
  }
}

/** The server could not restore the parked session right now; it is kept. */
export class ParkedSessionUnavailable extends Error {
  constructor() {
    super('The server could not be reached.');
    this.name = 'ParkedSessionUnavailable';
  }
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>('loading');

  /**
   * Lets the token hooks call the latest `endDeadSession` without being reinstalled on
   * every render. Reinstalling them mid-flight would be a race: a request could
   * read one version of the hooks and its retry another.
   */
  const endDeadSessionRef = useRef<() => Promise<void>>(async () => {});
  const queryClient = useQueryClient();

  // Both start by abandoning any in-flight refresh, synchronously and before
  // touching storage, so a refresh from the previous session cannot resolve
  // afterwards and write its tokens over the new state.
  const signIn = useCallback(async (tokens: TokenPair) => {
    invalidateRefresh();
    await tokenStore.setTokens(tokens);
    // Biometric unlock is offered once a session has existed here (05 §5).
    await biometricStore.markEstablished();
    setStatus('authenticated');
  }, []);

  // Signing out parks the refresh token for biometric unlock on Log In
  // (biometricStore). A dead session, below, discards it instead — and so does
  // an abandoned one (`park: false`), or biometric would resurrect the very
  // session the user backed out of (an unverified account leaving Verify Email
  // Sent), looping them straight back to it.
  //
  // The server cache goes with the session, or the next person to log in on
  // this phone would see the last one's profile and figures.
  const signOut = useCallback(
    async (options?: { park?: boolean }) => {
      invalidateRefresh();
      const refresh = await tokenStore.getRefreshToken();
      if (refresh && options?.park !== false) await biometricStore.park(refresh);
      await tokenStore.clear();
      setStatus('unauthenticated');
      queryClient.clear();
    },
    [queryClient],
  );

  /** The refresh token was rejected: nothing is worth keeping for biometrics. */
  const restoreParked = useCallback(async () => {
    const parked = await biometricStore.parkedRefreshToken();
    if (!parked) throw new ParkedSessionRejected();
    // The parked token becomes the active one, so the client's own refresh
    // (single-flight, rotation-aware) is what exchanges it. No
    // invalidateRefresh() here: a second restore while one is in flight joins
    // it rather than abandoning it.
    await tokenStore.setRefreshToken(parked);
    const outcome = await refreshSession();
    if (outcome === 'refreshed') {
      // onTokensRefreshed has stored the rotated pair; the parked copy is stale.
      await biometricStore.markEstablished();
      setStatus('authenticated');
      return;
    }
    if (outcome === 'rejected') {
      // onRefreshFailed has already ended the session and forgotten the token.
      throw new ParkedSessionRejected();
    }
    // Transient: take the token back out of the active slot, keep it parked.
    await tokenStore.clear();
    throw new ParkedSessionUnavailable();
  }, []);

  const endDeadSession = useCallback(async () => {
    invalidateRefresh();
    await tokenStore.clear();
    await biometricStore.forget();
    setStatus('unauthenticated');
    queryClient.clear();
  }, [queryClient]);

  /**
   * Keeps the ref pointing at the current `endDeadSession`.
   *
   * In an effect, not inline during render: writing a ref while rendering is a
   * React rule violation, and in a concurrent render it can be executed twice or
   * discarded entirely, leaving the hook holding a stale closure.
   */
  useEffect(() => {
    endDeadSessionRef.current = endDeadSession;
  }, [endDeadSession]);

  /**
   * Installs the HTTP client's token hooks once, on mount.
   *
   * `onRefreshFailed` is the important one: when a refresh token is revoked
   * (a password reset elsewhere, say), the client calls it and the whole app
   * returns to the login screen without any screen having to notice.
   */
  useEffect(() => {
    configureTokenHooks({
      getAccessToken: () => tokenStore.getAccessToken(),
      getRefreshToken: () => tokenStore.getRefreshToken(),
      onTokensRefreshed: (tokens) => tokenStore.setTokens(tokens),
      onRefreshFailed: () => endDeadSessionRef.current(),
    });
  }, []);

  /**
   * Restores a session on cold start.
   *
   * A stored refresh token is not proof of a valid session — it may have
   * expired, or been revoked by a password reset on another device. So we spend
   * one round trip exchanging it for an access token. That is the difference
   * between a returning user landing on their dashboard and landing on a screen
   * full of 401s.
   */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const refresh = await tokenStore.getRefreshToken();

      if (!refresh) {
        if (!cancelled) setStatus('unauthenticated');
        return;
      }

      try {
        const tokens = await authApi.refresh({ refresh });
        if (cancelled) return;
        await tokenStore.setTokens(tokens);
        setStatus('authenticated');
      } catch (error) {
        if (cancelled) return;

        // Only a rejection from the server proves the refresh token is dead.
        if (error instanceof ApiError && isRefreshRejected(error.status)) {
          await tokenStore.clear();
          setStatus('unauthenticated');
          return;
        }

        // Offline, timed out, or the server is having a bad moment. None of that
        // says the session is invalid, and clearing here would delete a good
        // refresh token and force a fresh login once the signal returns.
        //
        // So keep it and enter the app with no access token. The first request
        // gets a 401, the client's normal refresh-on-401 path runs, and the user
        // either sees the offline state or recovers transparently. If the token
        // really was revoked, that refresh is rejected and `onRefreshFailed`
        // signs them out then.
        setStatus('authenticated');
      }
    })();

    // Guards against setting state after unmount, which happens in tests that
    // unmount before the restore resolves.
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<SessionValue>(
    () => ({ status, signIn, signOut, restoreParked }),
    [status, signIn, signOut, restoreParked],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

/**
 * Reads the session.
 *
 * Throws outside a provider rather than returning a default, because a silently
 * "unauthenticated" app that is merely missing its provider is a confusing bug
 * to chase.
 */
export function useSession(): SessionValue {
  const value = useContext(SessionContext);

  if (!value) {
    throw new Error('useSession must be used inside a SessionProvider');
  }

  return value;
}
