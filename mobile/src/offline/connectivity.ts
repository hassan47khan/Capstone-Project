/**
 * Connectivity (11 §3.4). Feeds the phone's network state to TanStack Query's
 * `onlineManager`, so coming back online refetches what is on screen
 * (`refetchOnReconnect`), and lets the offline banner know when to show.
 *
 * Whether an offline request fails or waits is `networkMode`, set in
 * src/api/queryClient.ts, not here.
 *
 * The banner's dismissal lives here too, in one module-level store: every tab
 * draws its own banner, so state inside the component would only hide the
 * one in the tab you're on.
 */
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { onlineManager } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';

/** Connected, and not known to be cut off from the internet (captive portal, no route). */
export function isOnlineState(
  state: Pick<NetInfoState, 'isConnected' | 'isInternetReachable'>,
) {
  return state.isConnected !== false && state.isInternetReachable !== false;
}

/** Call once at startup. Returns the unsubscribe, for tests. */
export function watchConnectivity(): () => void {
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

// Dismissing the offline banner -------------------------------------------------

let dismissed = false;
const dismissListeners = new Set<() => void>();

function emitDismissed() {
  dismissListeners.forEach((listener) => listener());
}

// Each new outage shows the banner again: forget the dismissal on reconnect.
onlineManager.subscribe((online) => {
  if (online && dismissed) {
    dismissed = false;
    emitDismissed();
  }
});

/** Hides the offline banner in every tab until the connection comes back. */
export function dismissOfflineBanner() {
  if (dismissed) return;
  dismissed = true;
  emitDismissed();
}

/** Whether the banner was dismissed during this outage. */
export function useOfflineBannerDismissed(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      dismissListeners.add(onChange);
      return () => dismissListeners.delete(onChange);
    },
    () => dismissed,
  );
}
