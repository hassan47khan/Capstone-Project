/**
 * Typed access to the app's environment.
 *
 * What this is for
 *   One place that reads environment values, coerces them, and hands the rest of
 *   the app a typed object. Nothing else in `src/` should touch `process.env`.
 *
 * Why it exists
 *   `EXPO_PUBLIC_*` values are strings. A typo like `EXPO_PUBLIC_USE_MOCK`
 *   silently yields `undefined`, and the app quietly tries to reach a backend
 *   nobody is running. Centralising the reads means that decision is made once,
 *   in a file you can open and read, instead of in five call sites.
 *
 * How the values get here
 *   Metro INLINES every `process.env.EXPO_PUBLIC_*` reference at build time —
 *   it is a textual substitution, not a runtime lookup. Two consequences worth
 *   knowing:
 *     - The variable must be written out in full. `process.env[name]` with a
 *       computed `name` is not substituted and will be undefined.
 *     - Editing a .env file does not affect a running bundler. Restart with
 *       `--clear`, which `npm run start:mocks` and `start:api` already do.
 *
 * Nothing secret may be read here. Inlined values ship inside the bundle and
 * can be read off any device.
 */

/** Base URL of the SubTrak API, including the `/api/v1` prefix. */
const rawApiUrl = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000/api/v1';

/**
 * Only the exact string "true" enables mocks.
 *
 * Anything else — unset, empty, "TRUE", "1" — means talk to the real API. The
 * asymmetry is deliberate: a misconfigured build should fail visibly against a
 * missing backend rather than silently serve fake data to someone giving a demo.
 */
const rawUseMocks = process.env.EXPO_PUBLIC_USE_MOCKS ?? 'false';

/**
 * Gmail OAuth (handoff 11 §2.1). Both are public: a client id is not a secret,
 * and the redirect is the backend's HTTPS callback page
 * (`{SUBTRAK_PUBLIC_BASE_URL}/integrations/gmail/callback`), which must also be
 * listed in the backend's GOOGLE_OAUTH_REDIRECT_URIS. Unset means Connect Gmail
 * shows the "Couldn't connect" card instead of opening a browser.
 */
const rawGoogleClientId = process.env.EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID ?? '';
const rawGmailRedirectUri = process.env.EXPO_PUBLIC_GMAIL_REDIRECT_URI ?? '';

export const env = {
  /** API base URL, with any trailing slashes removed so paths concatenate cleanly. */
  apiUrl: rawApiUrl.replace(/\/+$/, ''),

  /**
   * When true, `src/api/client.ts` answers every request from the in-app mock
   * transport instead of the network. See src/test/routes.ts for the table.
   */
  useMocks: rawUseMocks === 'true',

  /** Google OAuth Web-application client id, for Connect Gmail. Empty when unset. */
  googleClientId: rawGoogleClientId.trim(),

  /** The backend's Gmail callback URL, registered with Google. Empty when unset. */
  gmailRedirectUri: rawGmailRedirectUri.trim(),

  /** True in a Metro dev build. Gates developer-only warnings. */
  isDev: __DEV__,
} as const;

export type Env = typeof env;
