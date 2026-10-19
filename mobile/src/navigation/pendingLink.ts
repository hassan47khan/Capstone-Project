/**
 * Pending deep-link intent (handoff 03 §6).
 *
 * The problem
 *   `subtrak://subscription/sub_1` opens a screen in the App stack. If the user
 *   is signed out when it arrives — a cold start from a notification, say — the
 *   App stack is not mounted and React Navigation would silently drop the link.
 *
 * The fix
 *   `linking.getInitialURL` and `linking.subscribe` route every URL through
 *   `routeIncomingUrl`. An App-only URL that arrives while the App stack is not
 *   mounted is parked here instead of being handed to the navigator. When the
 *   user signs in and the App stack mounts, RootNavigator takes it and opens it.
 *
 * Auth links (verify-email, reset-password) never need parking: the Auth stack
 * is exactly where they belong when the user is signed out.
 */

/** App-stack URL paths that need a signed-in session to open. */
const APP_ONLY = /^subtrak:\/\/subscription\//;

let pending: string | null = null;
let appMounted = false;

/** RootNavigator reports whether the App stack is currently mounted. */
export function setAppMounted(mounted: boolean): void {
  appMounted = mounted;
}

/**
 * Decides what the navigator should see for an incoming URL: the URL itself,
 * or null when it has been parked until the App stack mounts.
 */
export function routeIncomingUrl(url: string | null): string | null {
  if (url && APP_ONLY.test(url) && !appMounted) {
    pending = url;
    return null;
  }
  return url;
}

/** Hands over the parked URL, once. */
export function takePendingLink(): string | null {
  const url = pending;
  pending = null;
  return url;
}

/** Test helper: clears the parked URL and the mount flag. */
export function resetPendingLink(): void {
  pending = null;
  appMounted = false;
}
