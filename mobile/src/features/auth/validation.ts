/**
 * Client-side checks for the auth forms. They only decide when a field shows
 * its message and when the primary is enabled; the server re-checks
 * everything and its answer wins.
 */

/** 04 §5 and 05 §3: minimum length only, the same rule as the server. */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_RULE = `Use at least ${PASSWORD_MIN_LENGTH} characters.`;

// Deliberately loose: something@something.tld. The server decides the rest.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: string): boolean {
  return EMAIL.test(value.trim());
}

export function isValidPassword(value: string): boolean {
  return value.length >= PASSWORD_MIN_LENGTH;
}
