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

import { configureTokenHooks } from '@/api/client';
import { authApi } from '@/api/endpoints';
import type { TokenPair } from '@/api/types';

import { tokenStore } from './tokenStore';

export type SessionStatus = 'loading' | 'authenticated' | 'unauthenticated';

export interface SessionValue {
  status: SessionStatus;

  /** Stores the tokens and flips the app into its authenticated state. */
  signIn: (tokens: TokenPair) => Promise<void>;

  /** Clears the tokens and returns to the auth stack. */
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>('loading');

  /**
   * Lets the token hooks call the latest `signOut` without being reinstalled on
   * every render. Reinstalling them mid-flight would be a race: a request could
   * read one version of the hooks and its retry another.
   */
  const signOutRef = useRef<() => Promise<void>>(async () => {});

  const signIn = useCallback(async (tokens: TokenPair) => {
    await tokenStore.setTokens(tokens);
    setStatus('authenticated');
  }, []);

  const signOut = useCallback(async () => {
    await tokenStore.clear();
    setStatus('unauthenticated');
  }, []);

  /**
   * Keeps the ref pointing at the current `signOut`.
   *
   * In an effect, not inline during render: writing a ref while rendering is a
   * React rule violation, and in a concurrent render it can be executed twice or
   * discarded entirely, leaving the hook holding a stale closure.
   */
  useEffect(() => {
    signOutRef.current = signOut;
  }, [signOut]);

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
      onRefreshFailed: () => signOutRef.current(),
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
      } catch {
        // Covers both a revoked token and being offline at launch. Signing out
        // is the safe reading: the user can log in again, and an offline user
        // could not have used the app anyway.
        if (cancelled) return;
        await tokenStore.clear();
        setStatus('unauthenticated');
      }
    })();

    // Guards against setting state after unmount, which happens in tests that
    // unmount before the restore resolves.
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<SessionValue>(
    () => ({ status, signIn, signOut }),
    [status, signIn, signOut],
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
