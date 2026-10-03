/**
 * Epic A endpoints — registration, verification, login, password reset.
 *
 * What this is for
 *   A typed function per auth endpoint, so screens call `login(...)` instead of
 *   hand-writing a path and casting the response.
 *
 * Why every call here is `anonymous: true`
 *   These endpoints are reached when there is no valid session, and a 401 from
 *   them means "wrong password", not "token expired". Marking them anonymous
 *   stops the client's refresh-and-retry logic from firing, which would both
 *   waste a round trip and turn a clear "Incorrect email or password" into a
 *   confusing sign-out.
 *
 * Nothing here logs. These payloads contain passwords and reset tokens.
 */

import { request } from '../client';
import type {
  PasswordResetConfirmBody,
  PasswordResetRequestBody,
  RefreshRequest,
  RegisterRequest,
  RegisterResponse,
  TokenPair,
  VerifyEmailRequest,
} from '../types';

/**
 * Creates an inactive account and triggers the verification email (US-1).
 *
 * Returns no tokens — the user cannot sign in until they follow the emailed
 * link. A 409 means the email is already registered, which the sign-up form
 * shows inline.
 */
export function register(body: RegisterRequest): Promise<RegisterResponse> {
  return request<RegisterResponse>('/auth/register', {
    method: 'POST',
    body,
    anonymous: true,
  });
}

/**
 * Exchanges credentials for a token pair (US-2).
 *
 * Failure modes the Log in screen must handle:
 *   401 invalid_credentials  — "Incorrect email or password" (same for an
 *                              unknown email, so the endpoint cannot be used to
 *                              discover who is registered)
 *   401 email_not_verified   — correct password, unverified account; route to
 *                              Confirm email
 *   423 account_locked       — too many failed attempts; show the lockout copy
 */
export function login(body: { email: string; password: string }): Promise<TokenPair> {
  return request<TokenPair>('/auth/login', { method: 'POST', body, anonymous: true });
}

/**
 * Exchanges a refresh token for a new pair.
 *
 * Used in exactly two places and nowhere else:
 *   - `SessionProvider` on cold start, to decide whether a stored refresh token
 *     still represents a live session
 *   - the client's own single-flight refresh, which calls `/auth/refresh`
 *     directly rather than through this function to avoid importing itself
 *
 * A screen should never call this. Expired access tokens are handled inside
 * `src/api/client.ts` without the UI being involved.
 */
export function refresh(body: RefreshRequest): Promise<TokenPair> {
  return request<TokenPair>('/auth/refresh', { method: 'POST', body, anonymous: true });
}

/** Activates an account from the emailed token (US-1). */
export function verifyEmail(body: VerifyEmailRequest): Promise<{ verified: boolean }> {
  return request('/auth/verify-email', { method: 'POST', body, anonymous: true });
}

/**
 * Issues a fresh verification link, invalidating the previous one.
 * The Confirm email screen rate-limits this behind a cooldown.
 */
export function resendVerification(body: {
  email: string;
}): Promise<{ verification_sent: boolean }> {
  return request('/auth/resend-verification', { method: 'POST', body, anonymous: true });
}

/**
 * Starts a password reset (US-3).
 *
 * Always succeeds, registered or not. The generic response is deliberate: a
 * different answer for an unknown address would reveal who has an account.
 */
export function requestPasswordReset(
  body: PasswordResetRequestBody,
): Promise<{ sent: boolean }> {
  return request('/auth/password-reset/request', {
    method: 'POST',
    body,
    anonymous: true,
  });
}

/**
 * Completes a password reset (US-3).
 *
 * Succeeding also bumps the user's `token_version` server-side, which signs out
 * every other session — the point of the feature if the account was compromised.
 */
export function confirmPasswordReset(
  body: PasswordResetConfirmBody,
): Promise<{ reset: boolean }> {
  return request('/auth/password-reset/confirm', {
    method: 'POST',
    body,
    anonymous: true,
  });
}
