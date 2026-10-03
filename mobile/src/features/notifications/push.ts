/**
 * Epic E seam — push notifications (US-12, US-13).
 *
 * What this is for
 *   A no-op `registerForPush()` that the app can already call, so the call site
 *   is settled before the implementation exists.
 *
 * Why it does nothing, deliberately
 *   Two reasons, and the second is the important one.
 *
 *   1. There is no server endpoint to register a token with yet.
 *   2. **It must not ask for notification permission.** Prompt section 8 is
 *      explicit about this, and it is a real product decision, not a technicality:
 *      iOS gives an app exactly one chance to ask. Spend it at first launch,
 *      before the user has anything to be notified about, and most people say no
 *      — permanently. The app then cannot deliver a trial-ending alert, which is
 *      the feature users came for.
 *
 *      Epic E asks at the moment it earns the right to: the first time somebody
 *      saves a trial or a subscription with a reminder.
 *
 * Why it exists at all right now
 *   So the seam is visible. A reviewer reading the app can see where push will
 *   plug in, and nobody is tempted to scatter permission requests through the
 *   screens.
 */

import { FEATURE_PUSH } from '@/config/features';

/** A device token registered with the server. Epic E fills this in. */
export interface DeviceRegistration {
  expo_token: string;
  platform: 'ios' | 'android';
}

/**
 * Registers this device for push.
 *
 * No-op while `FEATURE_PUSH` is false. Asks for NO permission — see above.
 *
 * Epic E will: check the existing permission status, request it if the user has
 * not been asked, obtain an Expo push token, and POST it to `/devices`. If the
 * user declines, it will show the one-time explanation that alerts will appear
 * in the in-app inbox only, and will not ask again.
 */
export async function registerForPush(): Promise<DeviceRegistration | null> {
  if (!FEATURE_PUSH) {
    return null;
  }

  // Unreachable until Epic E flips the flag and implements this.
  return null;
}
