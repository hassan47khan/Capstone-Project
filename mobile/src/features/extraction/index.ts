/**
 * Epic D seam — AI extraction (US-9 to US-11).
 *
 * What this is for
 *   Types and a single availability check, so Phases 1–3 can be written against
 *   the shape Epic D will fill in. There is no UI here and none is coming until
 *   Epic D.
 *
 * Why the seam exists now
 *   The add-subscription flow branches on whether the AI path is offered. If
 *   that branch is introduced later, every Add button and its tests change. By
 *   routing Add through `AddEntry` today and having that screen ask
 *   `isExtractionAvailable()`, Epic D replaces one function and one screen.
 *
 * The rule Epic D must keep (specification section 7)
 *   The model proposes a draft; the user edits and confirms; only then does the
 *   ordinary subscription endpoint write anything. The model never writes to the
 *   database, and every failure path ends at the manual form.
 */

import { FEATURE_EXTRACTION } from '@/config/features';
import type { BillingCycle, DateOnly, MoneyString } from '@/api/types';

/**
 * The draft an extraction returns.
 *
 * Every field is optional: a partial draft is a legitimate result, and the
 * review screen highlights the blanks rather than rejecting the whole thing.
 */
export interface ExtractedSubscription {
  service_name?: string;
  price?: MoneyString;
  currency?: string;
  billing_cycle?: BillingCycle;
  next_renewal_on?: DateOnly;
  is_free_trial?: boolean;
  trial_ends_on?: DateOnly;
  /**
   * Fields the server flagged as uncertain — a hallucinated price caught by the
   * grounding check, an ambiguous date, or a low model confidence. The review
   * screen marks each one with an icon AND the words "Check this", never colour
   * alone.
   */
  low_confidence_fields?: string[];
}

/** One attempt. The id ties a confirmation back to the attempt that produced it. */
export interface ExtractionAttempt {
  attempt_id: string;
  draft: ExtractedSubscription;
}

/**
 * Whether the AI path should be offered right now.
 *
 * Epic D will make this a cached call to `GET /extractions/availability`, which
 * returns false when the circuit breaker is open, the per-user daily cap is
 * reached, or the kill switch is off. Until then the feature flag answers for it.
 *
 * Always false in Phases 0–3, so `AddEntry` routes straight to the manual form.
 */
export async function isExtractionAvailable(): Promise<boolean> {
  return FEATURE_EXTRACTION;
}
