/**
 * Connectivity (11 §3.4). Feeds the phone's network state to TanStack Query's
 * `onlineManager`, so coming back online refetches what is on screen
 * (`refetchOnReconnect`), and lets the offline banner know when to show.
 *
 * Requests keep `networkMode: 'always'`, which is how they behaved before
 * this existed (React Native has no browser online events, so the manager
 * always said "online"): an offline request still fails fast with the
 * offline error each screen already shows, instead of pausing on a spinner.
 */
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { onlineManager, type QueryClient } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';

/** Connected, and not known to be cut off from the internet (captive portal, no route). */
export function isOnlineState(
  state: Pick<NetInfoState, 'isConnected' | 'isInternetReachable'>,
) {
  return state.isConnected !== false && state.isInternetReachable !== false;
}

/** Call once at startup. Returns the unsubscribe, for tests. */
export function watchConnectivity(client: QueryClient): () => void {
  const defaults = client.getDefaultOptions();
  client.setDefaultOptions({
    ...defaults,
    queries: { ...defaults.queries, networkMode: 'always' },
    mutations: { ...defaults.mutations, networkMode: 'always' },
  });
  onlineManager.setEventListener((setOnline) =>
    NetInfo.addEventListener((state) => setOnline(isOnlineState(state))),
  );
  return () => onlineManager.setEventListener(() => undefined);
}

/** Whether the phone is online, re-rendering when that changes. */
export function useIsOnline(): boolean {
  return useSyncExternalStore(
    (onChange) => onlineManager.subscribe(onChange),
    () => onlineManager.isOnline(),
  );
}
