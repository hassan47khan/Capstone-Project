/**
 * The Gmail consent step on its own (the screens' tests replace this module).
 * Covers what the screens can't see: the state check that keeps a forged
 * callback from reaching the code exchange, cancel versus fail, and the PKCE
 * challenge.
 */
import { createHash } from 'crypto';

import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';

import {
  APP_CALLBACK,
  authorizeGmail,
  GMAIL_SCOPE,
  MOCK_CODE_VERIFIER,
  MOCK_GMAIL_CODE,
  parseCallback,
} from './gmailAuth';

const mockEnv = {
  useMocks: false,
  googleClientId: 'client-123.apps.googleusercontent.com',
  gmailRedirectUri: 'https://api.subtrak.test/integrations/gmail/callback',
};
// A getter, because jest.mock is hoisted above this const.
jest.mock('@/config/env', () => ({
  get env() {
    return mockEnv;
  },
}));

let mockByte = 0;
jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  CryptoEncoding: { BASE64: 'base64' },
  // Different bytes on every call, so the verifier and state differ.
  getRandomBytes: jest.fn((n: number) => {
    mockByte += 1;
    return Uint8Array.from({ length: n }, (_, i) => (mockByte * 37 + i * 101) % 256);
  }),
  // Real SHA-256 in standard base64, as expo-crypto returns it.
  digestStringAsync: jest.fn(async (_alg: string, data: string) =>
    jest
      .requireActual<typeof import('crypto')>('crypto')
      .createHash('sha256')
      .update(data)
      .digest('base64'),
  ),
}));

jest.mock('expo-web-browser', () => ({ openAuthSessionAsync: jest.fn() }));
const openAuth = WebBrowser.openAuthSessionAsync as jest.MockedFunction<
  typeof WebBrowser.openAuthSessionAsync
>;

/** The query of the Google URL authorizeGmail opened. */
function sentParams(): Record<string, string> {
  const url = openAuth.mock.calls[0]![0];
  return parseCallback(url);
}

/** Answers the browser with a callback built from what was sent. */
function answerWith(build: (sent: Record<string, string>) => string) {
  openAuth.mockImplementation(async (url) => ({
    type: 'success',
    url: build(parseCallback(url)),
  }));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockEnv.useMocks = false;
  mockEnv.googleClientId = 'client-123.apps.googleusercontent.com';
  mockEnv.gmailRedirectUri = 'https://api.subtrak.test/integrations/gmail/callback';
});

describe('parseCallback', () => {
  it('reads code, state and error, decoding them', () => {
    expect(
      parseCallback('subtrak://gmail-callback?code=4%2F0Ab&state=s1&error=access_denied'),
    ).toEqual({ code: '4/0Ab', state: 's1', error: 'access_denied' });
  });

  it('turns + into a space and survives no query at all', () => {
    expect(parseCallback('subtrak://gmail-callback?error_description=no+thanks')).toEqual(
      {
        error_description: 'no thanks',
      },
    );
    expect(parseCallback('subtrak://gmail-callback')).toEqual({});
  });
});

describe('authorizeGmail', () => {
  it('returns the code with the verifier that the challenge was made from', async () => {
    answerWith((sent) => `${APP_CALLBACK}?code=the-code&state=${sent.state}`);

    const result = await authorizeGmail();

    expect(result).toEqual({
      kind: 'code',
      code: 'the-code',
      codeVerifier: expect.any(String),
      redirectUri: mockEnv.gmailRedirectUri,
    });
    const sent = sentParams();
    expect(openAuth.mock.calls[0]![1]).toBe(APP_CALLBACK);
    expect(sent).toMatchObject({
      client_id: mockEnv.googleClientId,
      redirect_uri: mockEnv.gmailRedirectUri,
      response_type: 'code',
      scope: GMAIL_SCOPE,
      access_type: 'offline',
      code_challenge_method: 'S256',
    });

    // RFC 7636: base64url(SHA-256(verifier)), no padding.
    const verifier = (result as { codeVerifier: string }).codeVerifier;
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(sent.code_challenge).toBe(
      createHash('sha256').update(verifier).digest('base64url'),
    );
    expect(sent.code_challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(sent.state).not.toBe(verifier);
  });

  it('a callback with a different state fails, so its code is never used', async () => {
    answerWith(() => `${APP_CALLBACK}?code=forged&state=someone-else`);
    expect(await authorizeGmail()).toEqual({ kind: 'failed' });
  });

  it('a callback with no state fails', async () => {
    answerWith(() => `${APP_CALLBACK}?code=forged`);
    expect(await authorizeGmail()).toEqual({ kind: 'failed' });
  });

  it('a refusal on the consent screen fails', async () => {
    answerWith((sent) => `${APP_CALLBACK}?error=access_denied&state=${sent.state}`);
    expect(await authorizeGmail()).toEqual({ kind: 'failed' });
  });

  it.each(['cancel', 'dismiss'] as const)(
    'closing the browser (%s) is cancelled, not failed',
    async (type) => {
      // The enum isn't in the mocked module; its values are these strings.
      openAuth.mockResolvedValue({ type } as WebBrowser.WebBrowserAuthSessionResult);
      expect(await authorizeGmail()).toEqual({ kind: 'cancelled' });
    },
  );

  it('a browser that throws fails', async () => {
    openAuth.mockRejectedValue(new Error('no browser'));
    expect(await authorizeGmail()).toEqual({ kind: 'failed' });
  });

  it('without a client id or redirect it fails and opens nothing', async () => {
    mockEnv.googleClientId = '';
    expect(await authorizeGmail()).toEqual({ kind: 'failed' });
    mockEnv.googleClientId = 'client';
    mockEnv.gmailRedirectUri = '';
    expect(await authorizeGmail()).toEqual({ kind: 'failed' });
    expect(openAuth).not.toHaveBeenCalled();
  });

  it('with mocks on it answers the fixed code and touches nothing native', async () => {
    mockEnv.useMocks = true;
    expect(await authorizeGmail()).toEqual({
      kind: 'code',
      code: MOCK_GMAIL_CODE,
      codeVerifier: MOCK_CODE_VERIFIER,
      redirectUri: 'https://mock.subtrak.test/integrations/gmail/callback',
    });
    expect(Crypto.getRandomBytes).not.toHaveBeenCalled();
    expect(Crypto.digestStringAsync).not.toHaveBeenCalled();
    expect(openAuth).not.toHaveBeenCalled();
  });
});
