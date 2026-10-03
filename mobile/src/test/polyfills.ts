/**
 * Web platform globals that MSW needs and the React Native test environment lacks.
 *
 * What this is for
 *   MSW v3 is built for environments that implement the Fetch and Streams
 *   standards. The `jest-expo` environment emulates React Native, where several
 *   of those globals do not exist. Importing MSW without them throws before a
 *   single test runs.
 *
 * Why it is in `setupFiles` and not `setupFilesAfterEnv`
 *   `setupFiles` runs before the test framework and before any module imports
 *   are resolved. These globals must already exist at the moment `msw` is first
 *   imported, so they cannot wait for `setupFilesAfterEnv`.
 *
 * Why each one is here
 *   Every assignment below is guarded, so if a future Node or jest-expo version
 *   starts providing one natively, we defer to the real implementation rather
 *   than shadowing it with ours.
 *
 * This file is test-only. None of it ships in the app bundle — the app serves
 * mocks through a transport branch in src/api/client.ts, which needs no polyfills.
 */
import { ReadableStream, TransformStream, WritableStream } from 'node:stream/web';
import { URL as NodeURL, URLSearchParams as NodeURLSearchParams } from 'node:url';
import { TextDecoder, TextEncoder } from 'node:util';

import {
  fetch as undiciFetch,
  FormData as UndiciFormData,
  Headers as UndiciHeaders,
  Request as UndiciRequest,
  Response as UndiciResponse,
} from 'undici';

type Mutable = Record<string, unknown>;
const g = globalThis as unknown as Mutable;

/**
 * Restore Node's URL, replacing the React Native one.
 *
 * jest-expo installs `whatwg-url-minimum` as the global URL because that is what
 * React Native ships. It is minimal in a way that matters here: it rejects a
 * relative URL with no base. MSW's HTTP interceptor resolves its WASM parser with
 * `new URL('./llhttp/llhttp.wasm', import.meta.url)`, which the minimal polyfill
 * throws on — "TypeError: Invalid URL: ./llhttp/llhttp.wasm" — before a single
 * test runs.
 *
 * Assigning unconditionally (not behind a `typeof` guard like the others) is the
 * point: the global already exists, and it is the wrong implementation.
 *
 * The tradeoff, stated plainly: tests now parse URLs with Node's full
 * implementation while the app uses React Native's narrower one. A URL edge case
 * that only the RN polyfill mishandles would pass here and fail on device. We
 * accept that because the alternative is no API tests at all, and because the
 * app's own code builds URLs from a fixed base plus a path, which both
 * implementations handle identically.
 */
g.URL = NodeURL;
g.URLSearchParams = NodeURLSearchParams;

/**
 * Replace React Native's fetch with a standards-compliant one.
 *
 * This is the single most important line in this file, and the least obvious.
 *
 * React Native does not use Node's fetch — it ships a `whatwg-fetch`-style
 * polyfill implemented on top of XMLHttpRequest, and jest-expo installs that
 * polyfill in the test environment too. But the React Native Jest preset also
 * stubs XMLHttpRequest, so that fetch resolves to an object with `status`
 * undefined and a `text()` that returns nothing. Worse, MSW declines to patch
 * it, so interception never happens and every API test silently receives null.
 *
 * Swapping in undici's implementation — the same one Node's own global `fetch`
 * is built from — gives MSW a standard fetch to wrap, and gives us real
 * Response objects with real statuses and bodies.
 *
 * The tradeoff, stated plainly: tests exercise undici's fetch while the app
 * uses React Native's. A bug specific to RN's XHR-based implementation would
 * not be caught here. We accept that because the alternative is no API tests at
 * all, and because what these tests actually verify is OUR code — headers,
 * refresh behaviour, error mapping — not the transport underneath it.
 */
g.fetch = undiciFetch;
g.Request = UndiciRequest;
g.Response = UndiciResponse;
g.Headers = UndiciHeaders;
g.FormData = UndiciFormData;

// undici also needs `performance.markResourceTiming`, which it captures at
// module load. That patch cannot live here — this file's `import ... from
// 'undici'` is hoisted above every statement in it — so it runs from
// src/test/perf-shim.ts, listed before this file in jest.config.js setupFiles.

/** MSW encodes and decodes request bodies with these. */
if (typeof g.TextEncoder === 'undefined') {
  g.TextEncoder = TextEncoder;
}
if (typeof g.TextDecoder === 'undefined') {
  g.TextDecoder = TextDecoder;
}

/** Response bodies are streams internally, even when we only ever read JSON. */
if (typeof g.ReadableStream === 'undefined') {
  g.ReadableStream = ReadableStream;
}
if (typeof g.TransformStream === 'undefined') {
  g.TransformStream = TransformStream;
}
if (typeof g.WritableStream === 'undefined') {
  g.WritableStream = WritableStream;
}

/** MSW clones request bodies so a handler can read one the client also reads. */
if (typeof g.structuredClone === 'undefined') {
  // Not a faithful structuredClone — it loses Dates, Maps and cycles. That is
  // acceptable because the only things cloned here are plain JSON request and
  // response bodies, which survive a JSON round trip intact.
  g.structuredClone = (value: unknown) =>
    value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

/** MSW's internal event plumbing expects this to exist, even unused. */
if (typeof g.BroadcastChannel === 'undefined') {
  g.BroadcastChannel = class {
    readonly name: string;
    onmessage: ((event: unknown) => void) | null = null;

    constructor(name: string) {
      this.name = name;
    }

    postMessage(): void {}
    close(): void {}
    addEventListener(): void {}
    removeEventListener(): void {}
  };
}
