/**
 * API error handling.
 *
 * What this is for
 *   Turning every failure — an HTTP error, a dropped connection, a malformed
 *   response — into one `ApiError` object that screens can branch on, plus a
 *   user-facing message that is safe to display.
 *
 * Why one error type for everything
 *   Without it, every screen ends up with its own `catch` that guesses at the
 *   shape of what it caught. One type means a form knows it can read
 *   `error.fields` to highlight an input, and a screen knows it can read
 *   `error.code` to decide between "retry" and "log in again".
 *
 * The copy rule
 *   Messages shown to a user come from the SERVER wherever possible, because the
 *   acceptance criteria specify exact wording ("Incorrect email or password").
 *   The fallbacks here are only for cases the server never got to answer — no
 *   network, a non-JSON body, a timeout.
 *
 * The privacy rule
 *   Nothing in this file logs a request body, a token, or an email address.
 *   Specification section 11 forbids it, and an error path is exactly where that
 *   kind of logging tends to creep in.
 */

import type { ApiErrorBody } from './types';

/**
 * A single failure, however it arose.
 *
 * Extends `Error` so it behaves normally in a `catch`, with the structured
 * fields screens actually need attached to it.
 */
export class ApiError extends Error {
  /** HTTP status, or 0 when the request never reached the server. */
  readonly status: number;

  /** Machine-readable code. Screens branch on this, never on the message text. */
  readonly code: string;

  /** Per-field validation messages from a 400, for inline form errors. */
  readonly fields: Record<string, string[]> | undefined;

  constructor(options: {
    status: number;
    code: string;
    message: string;
    fields?: Record<string, string[]>;
  }) {
    super(options.message);
    this.name = 'ApiError';
    this.status = options.status;
    this.code = options.code;
    this.fields = options.fields;
  }

  /** The caller's session is gone; the app must send them back to Log in. */
  get isAuthFailure(): boolean {
    return this.status === 401;
  }

  /** The account is temporarily locked (US-2). Distinct from bad credentials. */
  get isLockout(): boolean {
    return this.status === 423;
  }

  /** Nothing reached the server — show the offline state, not a server error. */
  get isOffline(): boolean {
    return this.status === 0;
  }

  /**
   * Worth offering a Retry button for. A 400 is not: retrying the same invalid
   * form submits the same invalid data.
   */
  get isRetryable(): boolean {
    return this.status === 0 || this.status === 429 || this.status >= 500;
  }
}

/** Fallback copy, used only when the server did not supply its own message. */
const FALLBACK_MESSAGES: Record<string, string> = {
  network_error: 'You appear to be offline. Check your connection and try again.',
  timeout: 'That took too long. Try again.',
  server_error: 'Something went wrong on our end. Try again in a moment.',
  parse_error: 'We received an unexpected response. Try again.',
  throttled: 'Too many attempts. Wait a moment and try again.',
  not_found: 'We could not find that.',
  unknown: 'Something went wrong. Try again.',
};

/** Type guard for the `{ error: { code, message } }` envelope. */
function isApiErrorBody(value: unknown): value is ApiErrorBody {
  if (typeof value !== 'object' || value === null) return false;

  const candidate = (value as { error?: unknown }).error;
  if (typeof candidate !== 'object' || candidate === null) return false;

  return typeof (candidate as { code?: unknown }).code === 'string';
}

/**
 * Builds an `ApiError` from a failed response body.
 *
 * Falls back to a status-appropriate message when the body is not the expected
 * envelope — which happens with a proxy error page, or a 502 from a load
 * balancer that never reached Django.
 */
export function toApiError(status: number, body: unknown): ApiError {
  if (isApiErrorBody(body)) {
    return new ApiError({
      status,
      code: body.error.code,
      // Prefer the server's wording: the acceptance criteria specify it exactly.
      message: body.error.message || FALLBACK_MESSAGES.unknown!,
      fields: body.error.fields,
    });
  }

  const code = status >= 500 ? 'server_error' : status === 429 ? 'throttled' : 'unknown';

  return new ApiError({
    status,
    code,
    message: FALLBACK_MESSAGES[code] ?? FALLBACK_MESSAGES.unknown!,
  });
}

/** The error for a request that never reached the server. */
export function networkError(): ApiError {
  return new ApiError({
    status: 0,
    code: 'network_error',
    message: FALLBACK_MESSAGES.network_error!,
  });
}

/** The error for a request that exceeded the client timeout. */
export function timeoutError(): ApiError {
  return new ApiError({
    status: 0,
    code: 'timeout',
    message: FALLBACK_MESSAGES.timeout!,
  });
}

/**
 * The message to show the user for any thrown value.
 *
 * Deliberately defensive: a screen must never render a raw exception, because
 * an exception message can contain a URL, a header, or part of a payload. An
 * unrecognised throw becomes the generic fallback.
 */
export function messageFor(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return FALLBACK_MESSAGES.unknown!;
}

/**
 * Validation messages for one form field, or undefined if that field is fine.
 *
 * Lets a form do `fieldError(error, 'price')` and show the message under the
 * price input, which is what the acceptance criteria describe.
 */
export function fieldError(error: unknown, field: string): string | undefined {
  if (!(error instanceof ApiError) || !error.fields) return undefined;
  return error.fields[field]?.[0];
}
