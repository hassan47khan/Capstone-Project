/**
 * Performance-API shim. Must run BEFORE undici is imported.
 *
 * What this is for
 *   Giving the global `performance` object a `markResourceTiming` method.
 *
 * Why it is a separate file rather than a few lines in polyfills.ts
 *   Timing, and only timing. undici captures the function once, at module load:
 *
 *       const markResourceTiming = performance.markResourceTiming   // line ~330
 *
 *   ES module imports are hoisted, so an `import ... from 'undici'` at the top
 *   of polyfills.ts runs before any statement in that file — including a patch
 *   written above it in the source. undici would capture `undefined` and every
 *   successfully completed response would then throw
 *   "TypeError: markResourceTiming is not a function" after its body had already
 *   been read, which looks for all the world like a bug in our response
 *   handling.
 *
 *   Listing this file first in `setupFiles` guarantees it runs before the module
 *   that reads it. Jest runs setup files in array order.
 *
 * Why discarding the data is correct
 *   `markResourceTiming` feeds the browser Resource Timing API. Nothing in the
 *   test suite reads it, and React Native has no such API, so a no-op is the
 *   honest implementation rather than a stub that pretends to record something.
 */
import { performance as nodePerformance } from 'node:perf_hooks';

type TimingCapable = { markResourceTiming?: unknown };

const globalPerformance = (globalThis as { performance?: TimingCapable }).performance;

if (globalPerformance && typeof globalPerformance.markResourceTiming !== 'function') {
  const nodeImplementation = (nodePerformance as unknown as TimingCapable)
    .markResourceTiming;

  // Prefer Node's real implementation when the environment exposes it; fall back
  // to a no-op when it does not.
  globalPerformance.markResourceTiming =
    typeof nodeImplementation === 'function' ? nodeImplementation : () => {};
}
