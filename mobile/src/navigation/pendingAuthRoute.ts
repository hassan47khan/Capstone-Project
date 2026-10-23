/**
 * An Auth-stack route to open after the stack remounts.
 *
 * Signing out of a signed-in but unverified session swaps RootNavigator's
 * keyed Auth stack from Verify Email Sent to a fresh one at Log In, so a
 * `navigate('Register', …)` issued just before or after `signOut()` lands on
 * an unmounted navigator and is lost. A screen that needs to end up somewhere
 * else parks the route here first; the remounted stack opens on it, once.
 * The same idea as pendingLink, for in-app intents rather than URLs.
 */
import type { AuthStackParamList } from './types';

export interface PendingAuthRoute {
  name: keyof AuthStackParamList;
  params?: object;
}

let pending: PendingAuthRoute | null = null;

/** Parks a route for the next Auth stack mount. Call before signOut(). */
export function parkAuthRoute(route: PendingAuthRoute): void {
  pending = route;
}

/** Hands over the parked route, once. */
export function takePendingAuthRoute(): PendingAuthRoute | null {
  const route = pending;
  pending = null;
  return route;
}

/** Test helper. */
export function resetPendingAuthRoute(): void {
  pending = null;
}
