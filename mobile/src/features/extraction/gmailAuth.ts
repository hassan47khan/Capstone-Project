/**
 * The Gmail consent step (handoff 11 §2.1): open Google's screen, get a code.
 *
 * How it fits together
 *   Google redirects to the backend's HTTPS callback page (a Web-application
 *   client can't redirect to `subtrak://`), and that page forwards `code`,
 *   `state` or `error` to `subtrak://gmail-callback`. The auth session closes
 *   when it sees that URL. We check `state` against the one we sent, then the
 *   screen posts the code with our PKCE verifier to
 *   POST /integrations/gmail/connect. Only the app ever holds the verifier, so
 *   a code that leaks on the way is useless on its own.
 *
 * Scope: `gmail.readonly`, the narrowest one that can search (CLAUDE.md).
 *
 * With mocks on, no browser opens: it answers with a fixed code the mock
 * route accepts, so the whole flow runs in Expo Go with no Google account.
 * The real flow needs a dev or standalone build: Expo Go only claims exp://
 * links, so `subtrak://gmail-callback` would never come back to it.
 */
import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';

import { env } from '@/config/env';

export const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
export const APP_CALLBACK = 'subtrak://gmail-callback';
export const MOCK_GMAIL_CODE = 'mock-gmail-code';
export const MOCK_CODE_VERIFIER = 'mock-code-verifier';

export type GmailAuthResult =
  | { kind: 'code'; code: string; codeVerifier: string; redirectUri: string }
  /** The user closed the browser. Not an error: back to where they were. */
  | { kind: 'cancelled' }
  /** Denied, timed out, state mismatch, or Gmail isn't configured. */
  | { kind: 'failed' };

/** Base64url without padding (RFC 7636). */
function base64Url(base64: string): string {
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomToken(bytes: number): string {
  const raw = Crypto.getRandomBytes(bytes);
  let binary = '';
  raw.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return base64Url(globalThis.btoa(binary));
}

/** Reads `code`, `state` and `error` off the callback URL. */
export function parseCallback(url: string): Record<string, string> {
  const query = url.split('?')[1] ?? '';
  const out: Record<string, string> = {};
  for (const pair of query.split('&')) {
    if (!pair) continue;
    const [key, value = ''] = pair.split('=');
    if (key) out[decodeURIComponent(key)] = decodeURIComponent(value.replace(/\+/g, ' '));
  }
  return out;
}

export async function authorizeGmail(): Promise<GmailAuthResult> {
  // Before any crypto, so the mock flow needs nothing native (getRandomBytes,
  // and `btoa`, which comes from Hermes rather than react-native).
  if (env.useMocks) {
    return {
      kind: 'code',
      code: MOCK_GMAIL_CODE,
      codeVerifier: MOCK_CODE_VERIFIER,
      redirectUri: 'https://mock.subtrak.test/integrations/gmail/callback',
    };
  }

  if (!env.googleClientId || !env.gmailRedirectUri) return { kind: 'failed' };

  const codeVerifier = randomToken(32);
  const state = randomToken(16);
  const challenge = base64Url(
    await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, codeVerifier, {
      encoding: Crypto.CryptoEncoding.BASE64,
    }),
  );

  const params: Record<string, string> = {
    client_id: env.googleClientId,
    redirect_uri: env.gmailRedirectUri,
    response_type: 'code',
    scope: GMAIL_SCOPE,
    // A refresh token, so scans keep working after the hour is up.
    access_type: 'offline',
    prompt: 'consent',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
  };
  const query = Object.entries(params)
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&');

  let result: WebBrowser.WebBrowserAuthSessionResult;
  try {
    result = await WebBrowser.openAuthSessionAsync(
      `https://accounts.google.com/o/oauth2/v2/auth?${query}`,
      APP_CALLBACK,
    );
  } catch {
    return { kind: 'failed' };
  }

  if (result.type === 'cancel' || result.type === 'dismiss') return { kind: 'cancelled' };
  if (result.type !== 'success') return { kind: 'failed' };

  const back = parseCallback(result.url);
  // A different state means this answer isn't for our request: never use it.
  if (back.error || !back.code || back.state !== state) return { kind: 'failed' };

  return {
    kind: 'code',
    code: back.code,
    codeVerifier,
    redirectUri: env.gmailRedirectUri,
  };
}
