/**
 * Token storage.
 *
 * What this is for
 *   Holding the access and refresh tokens, with the right storage for each.
 *
 * The rule, from specification section 6
 *   - The ACCESS token lives in memory only. It expires in 15 minutes, so
 *     persisting it buys almost nothing and leaves a credential on disk.
 *   - The REFRESH token goes in `expo-secure-store`, which is the Keychain on
 *     iOS and EncryptedSharedPreferences on Android. Never AsyncStorage: that is
 *     plain text on disk, readable by anything with file access on a rooted or
 *     jailbroken device.
 *
 * Why this is an object and not a React hook
 *   `src/api/client.ts` needs the access token on every request, including from
 *   plain functions outside the component tree. A module-level store can be read
 *   from anywhere; the session context in SessionContext.tsx layers React state
 *   on top of it for the UI.
 *
 * Nothing here is logged, ever. A token in a log is a token in a crash report.
 */
import * as SecureStore from 'expo-secure-store';

/** Keychain key. Changing it signs every existing user out on next launch. */
const REFRESH_TOKEN_KEY = 'subtrak.refreshToken';

/**
 * The access token, in memory for the life of the process.
 *
 * Deliberately a module variable, not React state: it must be readable
 * synchronously by the HTTP client, which has no access to a hook.
 */
let accessToken: string | null = null;

export const tokenStore = {
  /** The current access token, or null when signed out. Synchronous by design. */
  getAccessToken(): string | null {
    return accessToken;
  },

  setAccessToken(token: string | null): void {
    accessToken = token;
  },

  /**
   * The persisted refresh token.
   *
   * Returns null rather than throwing if secure storage is unavailable — on a
   * device with no passcode, or in a simulator with a broken keychain. Treating
   * that as "signed out" sends the user to the login screen, which is recoverable;
   * throwing would crash the app on launch, which is not.
   */
  async getRefreshToken(): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
    } catch {
      return null;
    }
  },

  async setRefreshToken(token: string): Promise<void> {
    try {
      await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token);
    } catch {
      // The session still works for this launch — the access token is in
      // memory — it just will not survive a restart. Better than blocking login.
    }
  },

  /** Clears both tokens. Called on sign-out and on a failed refresh. */
  async clear(): Promise<void> {
    accessToken = null;
    try {
      await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
    } catch {
      // Already gone, or storage is unavailable. Either way there is nothing
      // left to clear and nothing useful to tell the user.
    }
  },

  /** Saves both after a login or a refresh. */
  async setTokens(tokens: { access: string; refresh: string }): Promise<void> {
    accessToken = tokens.access;
    await tokenStore.setRefreshToken(tokens.refresh);
  },
};
