/**
 * What biometric unlock on Log In needs to remember (handoff 05 §5).
 *
 * 05 §5 offers Face ID / Touch ID "after a session has been established at
 * least once". Two keychain entries carry that:
 *
 *   established   set on every sign-in; this device has had a session
 *   parked        the refresh token at sign-out, so a biometric unlock can
 *                 restore the session through the normal refresh call
 *
 * Signing out parks the token instead of discarding it, which is what lets the
 * prompt appear on the next Log In. A refresh the server rejects (expired, or
 * revoked by a password reset) clears both, and Log In falls back to the form.
 *
 * Nothing here talks to the biometric hardware; useBiometricUnlock does.
 */
import * as SecureStore from 'expo-secure-store';

const ESTABLISHED_KEY = 'subtrak.biometric.established';
const PARKED_REFRESH_KEY = 'subtrak.biometric.refresh';

async function read(key: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

async function write(key: string, value: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(key, value);
  } catch {
    // No secure storage on this device: biometric unlock is simply not offered.
  }
}

async function remove(key: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(key);
  } catch {
    // Already gone, or storage is unavailable.
  }
}

export const biometricStore = {
  /** After a sign-in: the device has had a session, and any parked token is stale. */
  async markEstablished(): Promise<void> {
    await write(ESTABLISHED_KEY, '1');
    await remove(PARKED_REFRESH_KEY);
  },

  async isEstablished(): Promise<boolean> {
    return (await read(ESTABLISHED_KEY)) === '1';
  },

  /** At sign-out, only on a device that has had a session. */
  async park(refresh: string): Promise<void> {
    if (await biometricStore.isEstablished()) await write(PARKED_REFRESH_KEY, refresh);
  },

  async parkedRefreshToken(): Promise<string | null> {
    return read(PARKED_REFRESH_KEY);
  },

  /** The parked token is dead: stop offering biometric unlock. */
  async forget(): Promise<void> {
    await remove(PARKED_REFRESH_KEY);
    await remove(ESTABLISHED_KEY);
  },
};
