/**
 * Feature flags.
 *
 * What this is for
 *   Compile-time switches for work that is designed but not yet in scope. The
 *   visual prototype includes screens for epics we are not building in Phases
 *   0–3; the flags let those screens exist in the design without shipping half
 *   an implementation.
 *
 * Why these are `const` booleans and not runtime config
 *   Metro's bundler drops `false &&` branches, so a disabled feature is not just
 *   hidden — its code paths are gone from the bundle. A merely hidden screen is
 *   still a navigable route, which would leak a half-built feature to anyone who
 *   guessed the link.
 *
 * How to turn one on
 *   Flip the constant to `true`, then build the feature behind it. Every flag
 *   below names the epic that owns it, so nobody has to guess what enabling it
 *   would require.
 */

/**
 * Epic D — AI-Powered Extraction (US-9 to US-11).
 *
 * Gates the "Add via AI" entry point. When false, the Add button routes straight
 * to the manual form. When true, it routes to a choice screen first. The seam
 * lives in src/features/extraction/.
 */
export const FEATURE_EXTRACTION = false;

/**
 * Epic E — Trial Shield and Notifications (US-12, US-13).
 *
 * Gates push registration and the notification inbox. While false,
 * `registerForPush()` is a no-op and the app never asks for notification
 * permission — asking for a permission the app cannot yet honour trains users
 * to deny it.
 */
export const FEATURE_PUSH = false;

/**
 * Epic G/H — Billing history, price-change and contract alerts (US-16 to US-19).
 *
 * Gates the price-increase notice banner and the billing-history list on the
 * subscription detail screen.
 */
export const FEATURE_BILLING_HISTORY = false;
