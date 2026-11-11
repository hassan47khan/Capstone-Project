/**
 * The rules behind Review extraction (handoff 11 §2.2, §2.4), kept apart from
 * the screen so they can be tested on their own.
 *
 *   - Rows: the Price row is three fields (amount, currency, cycle) edited
 *     together. Each row's confidence is the lowest of its fields'.
 *   - Bands: ≥ 90% high (green chip), 60–89% medium (amber chip), < 60% low.
 *     A low row, or any row with a field the server flagged, is "flagged".
 *   - A flagged row must be resolved before "Confirm and track": either its
 *     value changed, or the user said "Looks right". This is the
 *     human-in-the-loop guarantee (11 §2.7).
 *   - Reminder date = trial end − trial_alert_days_before. On or before today
 *     it's "Reminder due now".
 *
 * Confidence is a 0–1 score, not money, so turning it into "92%" here is fine.
 */
import { daysUntil } from '@/api/format';
import type { PendingExtraction, SubscriptionInputRequest } from '@/api/contract';
import { CATEGORY_SLUGS } from '@/theme';

import {
  EMPTY_FORM,
  toSubscriptionInput,
  validateForm,
  type FormErrors,
  type FormValues,
} from '../subscriptions/formRules';

export type ExtractedField = keyof PendingExtraction['confidence'];
export type RowKey = 'name' | 'plan' | 'price' | 'category' | 'trial' | 'start';
export type Band = 'high' | 'medium' | 'low';

/** The form, plus what only a review has: the trial and the plan name. */
export interface ReviewValues extends FormValues {
  isTrial: boolean;
  trialEndsOn: string | null;
  planName: string | null;
  reminderEnabled: boolean;
}

export interface ReviewRow {
  key: RowKey;
  label: string;
  /** Null when the email didn't have it (the grounding rule blanked it). */
  confidence: number | null;
  band: Band | null;
  flagged: boolean;
}

export const REVIEW_RULES = { high: 0.9, medium: 0.6 } as const;

/** Which extracted fields feed each row. */
const ROW_FIELDS: Record<RowKey, ExtractedField[]> = {
  name: ['service_name'],
  plan: ['plan_name'],
  price: ['price', 'currency', 'billing_cycle'],
  category: ['category'],
  trial: ['subscription_type', 'trial_ends_on'],
  start: ['start_date'],
};

const ROW_LABELS: Record<RowKey, string> = {
  name: 'Service',
  plan: 'Plan',
  price: 'Price',
  category: 'Category',
  trial: 'Trial ends',
  start: 'Start date',
};

export function bandFor(confidence: number | null): Band | null {
  if (confidence === null) return null;
  if (confidence >= REVIEW_RULES.high) return 'high';
  if (confidence >= REVIEW_RULES.medium) return 'medium';
  return 'low';
}

/** "92%". Rounded down, so 0.899 never reads as a green 90%. */
export function percent(confidence: number): string {
  return `${Math.floor(confidence * 100)}%`;
}

/** The form as the email filled it in. Blanks stay blank. */
export function valuesFromExtraction(extraction: PendingExtraction): ReviewValues {
  const f = extraction.fields;
  const isTrial = f.subscription_type === 'trial';
  return {
    ...EMPTY_FORM,
    name: f.service_name ?? '',
    price: f.price ?? '',
    // 11 §2.8: price but no currency → the server flags it; start from USD.
    currency: f.currency ?? EMPTY_FORM.currency,
    category: CATEGORY_SLUGS.find((slug) => slug === f.category) ?? null,
    cycle: f.billing_cycle ?? EMPTY_FORM.cycle,
    customCount: f.custom_cycle_count ?? EMPTY_FORM.customCount,
    customUnit: f.custom_cycle_unit ?? EMPTY_FORM.customUnit,
    startDate: f.start_date,
    isTrial,
    trialEndsOn: f.trial_ends_on,
    planName: f.plan_name,
    reminderEnabled: true,
  };
}

/** The rows to show, in order. Plan only when there is one; trial only for trials. */
export function rowsFor(
  extraction: PendingExtraction,
  values: ReviewValues,
): ReviewRow[] {
  const keys: RowKey[] = ['name'];
  if (values.planName || extraction.flagged.includes('plan_name')) keys.push('plan');
  keys.push('price', 'category');
  if (values.isTrial) keys.push('trial');
  keys.push('start');

  return keys.map((key) => {
    const fields = ROW_FIELDS[key];
    const scores = fields
      .map((field) => extraction.confidence[field])
      .filter((score): score is number => score !== null);
    const confidence = scores.length > 0 ? Math.min(...scores) : null;
    const band = bandFor(confidence);
    const flagged =
      fields.some((field) => extraction.flagged.includes(field)) || band === 'low';
    return { key, label: ROW_LABELS[key], confidence, band, flagged };
  });
}

/** A row's value as one comparable string, to tell whether it was edited. */
function rowValue(values: ReviewValues, key: RowKey): string {
  switch (key) {
    case 'name':
      return values.name.trim();
    case 'plan':
      return values.planName ?? '';
    case 'price':
      return [
        values.price,
        values.currency,
        values.cycle,
        values.cycle === 'custom' ? `${values.customCount} ${values.customUnit}` : '',
      ].join('|');
    case 'category':
      return values.category ?? '';
    case 'trial':
      return `${values.isTrial}|${values.trialEndsOn ?? ''}`;
    case 'start':
      return values.startDate ?? '';
  }
}

/** Flagged rows the user hasn't edited or confirmed yet. */
export function unresolvedRows(
  rows: ReviewRow[],
  values: ReviewValues,
  initial: ReviewValues,
  confirmed: ReadonlySet<RowKey>,
): RowKey[] {
  return rows
    .filter((row) => row.flagged)
    .filter((row) => !confirmed.has(row.key))
    .filter((row) => rowValue(values, row.key) === rowValue(initial, row.key))
    .map((row) => row.key);
}

/** "Looks right" needs something to look at: a blank row has to be filled in. */
export function canConfirmAsIs(values: ReviewValues, key: RowKey): boolean {
  switch (key) {
    case 'name':
      return values.name.trim() !== '';
    case 'plan':
      return Boolean(values.planName);
    case 'price':
      return values.price !== '';
    case 'category':
      return values.category !== null;
    case 'trial':
      return !values.isTrial || Boolean(values.trialEndsOn);
    case 'start':
      return values.startDate !== null;
  }
}

export const REVIEW_COPY = {
  trialEndRequired: 'Add the date the trial ends.',
  trialEndBeforeStart: 'The trial has to end after it starts.',
} as const;

export interface ReviewErrors extends FormErrors {
  trialEndsOn?: string;
}

/** The form's own checks (07 §3), plus the trial end date. */
export function validateReview(values: ReviewValues, today: string): ReviewErrors {
  const errors: ReviewErrors = validateForm(values, today);
  if (values.isTrial) {
    if (!values.trialEndsOn) errors.trialEndsOn = REVIEW_COPY.trialEndRequired;
    else if (values.startDate && (trialLength(values) ?? 0) < 1) {
      errors.trialEndsOn = REVIEW_COPY.trialEndBeforeStart;
    }
  }
  return errors;
}

/** Days from the start to the trial's end: the server needs it for progress. */
function trialLength(values: ReviewValues): number | null {
  if (!values.trialEndsOn || !values.startDate) return null;
  return daysUntil(values.trialEndsOn, values.startDate);
}

/** The body for "Confirm and track": the same as POST /subscriptions. */
export function toConfirmInput(values: ReviewValues): SubscriptionInputRequest {
  const base = toSubscriptionInput(values);
  return {
    ...base,
    is_trial: values.isTrial,
    trial_ends_on: values.isTrial ? values.trialEndsOn : null,
    trial_length_days: values.isTrial ? trialLength(values) : null,
    trial_reminder_enabled: values.reminderEnabled,
  };
}

/** "YYYY-MM-DD" moved by `days`. Calendar maths in UTC, so no zone shift. */
export function shiftDate(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const moved = new Date(Date.UTC(year!, month! - 1, day! + days));
  return moved.toISOString().slice(0, 10);
}

/** When the trial reminder goes out, and whether that's already now (11 §2.4 rule 5). */
export function reminderFor(
  trialEndsOn: string,
  daysBefore: number,
  today: string,
): { on: string; dueNow: boolean } {
  const on = shiftDate(trialEndsOn, -daysBefore);
  return { on, dueNow: on <= today };
}
