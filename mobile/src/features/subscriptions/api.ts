/**
 * Subscription data from the backend (handoff 04 §5, backend/schema.yml).
 *
 * TODO: move to src/api once Hassan generates the API client from the schema.
 * Kept in this folder for now so we don't edit someone else's folder.
 */
import type { CategoryRef, ContractMoney, ServiceMarkRef } from '@/api/analyticsTypes';
import { newIdempotencyKey, request } from '@/api/client';
import type { CurrencyCode, DateOnly, Instant, MoneyString } from '@/api/types';

// Each enum is a real list (not just a type) so a test can check it against
// backend/schema.yml. Keep the order the schema uses.

// How often it bills. "custom" uses custom_cycle_count + custom_cycle_unit.
export const BILLING_CYCLES = [
  'weekly',
  'monthly',
  'quarterly',
  'yearly',
  'custom',
] as const;
export type BillingCycle = (typeof BILLING_CYCLES)[number];

export const CUSTOM_CYCLE_UNITS = ['days', 'weeks', 'months', 'years'] as const;
export type CustomCycleUnit = (typeof CUSTOM_CYCLE_UNITS)[number];

export const SUBSCRIPTION_STATUSES = ['active', 'cancelled'] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const TRIAL_DECISIONS = ['none', 'keep', 'remind'] as const;
export type TrialDecision = (typeof TRIAL_DECISIONS)[number];

// The kinds of change recorded in a subscription's history.
export const HISTORY_EVENT_TYPES = [
  'created',
  'price_change',
  // A switch of billing currency, with the price on both sides (#142).
  'currency_change',
  'category_change',
  'cycle_change',
  'cancelled',
] as const;
export type HistoryEventType = (typeof HISTORY_EVENT_TYPES)[number];

// What a history event changed. Only the changed fields are present.
export interface HistoryValue {
  price?: MoneyString;
  currency?: CurrencyCode;
  category?: string | null; // category slug, e.g. "entertainment"
  billing_cycle?: BillingCycle;
  custom_cycle_count?: number | null;
  custom_cycle_unit?: CustomCycleUnit | null;
  cancelled_on?: DateOnly;
}

// One entry in the history list.
export interface HistoryEvent {
  id: string;
  event_type: HistoryEventType;
  occurred_at: Instant; // e.g. "2026-10-01T00:00:00Z"
  old_value: HistoryValue | null;
  new_value: HistoryValue | null;
}

// One subscription, as the list endpoint returns it.
export interface SubscriptionRow {
  id: string;
  name: string;
  billing_price: MoneyString; // a string like "15.49", never a number
  billing_currency: CurrencyCode;
  billing_cycle: BillingCycle;
  custom_cycle_count: number | null;
  custom_cycle_unit: CustomCycleUnit | null;
  start_date: DateOnly;
  next_bill_date: DateOnly | null; // null once cancelled
  category: CategoryRef | null;
  notes: string;
  payment_label: string; // e.g. "Visa ••4242", or "" if not set
  status: SubscriptionStatus;
  cancelled_on: DateOnly | null;
  is_trial: boolean;
  trial_ends_on: DateOnly | null;
  trial_length_days: number | null;
  trial_reminder_enabled: boolean;
  trial_decision: TrialDecision;
  counts_toward_totals: boolean;
  normalized_monthly: ContractMoney | null; // monthly cost, computed by the server
  service_mark: ServiceMarkRef | null; // logo letter + brand colours, if known
  created_at: Instant;
  updated_at: Instant;
}

// One subscription with the extra fields the Detail screen needs.
export interface SubscriptionDetail extends SubscriptionRow {
  total_spent_to_date: ContractMoney | null; // computed by the server
  saved_per_year: ContractMoney | null; // only set when cancelled
  history: HistoryEvent[]; // newest first
}
// What the Add and Edit forms send. next_bill_date is never sent: the server
// works it out from start_date and the cycle.
export interface SubscriptionInput {
  name: string;
  billing_price: MoneyString;
  billing_currency: CurrencyCode;
  billing_cycle: BillingCycle;
  custom_cycle_count: number | null;
  custom_cycle_unit: CustomCycleUnit | null;
  start_date: DateOnly;
  category: string; // category slug, e.g. "entertainment"
  notes: string;
  payment_label: string;
}

// Adds a subscription. A 400 carries per-field messages in error.fields.
// Pass the SAME idempotencyKey when retrying the same save, so a retry after a
// dropped connection can't create it twice.
export function createSubscription(
  input: SubscriptionInput,
  idempotencyKey: string = newIdempotencyKey(),
): Promise<SubscriptionDetail> {
  return request<SubscriptionDetail>('/subscriptions', {
    method: 'POST',
    body: input,
    idempotencyKey,
  });
}

// Saves edits: send only what changed (PATCH is partial). A price, category
// or cycle change writes a history event on the server; the client never
// writes history itself (07 §5).
export function updateSubscription(
  id: string,
  input: Partial<SubscriptionInput>,
): Promise<SubscriptionDetail> {
  return request<SubscriptionDetail>(`/subscriptions/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: input,
  });
}

// Marks it cancelled (07 §7): out of totals, history kept, saved_per_year set.
// A 409 `already_cancelled` means it already was.
export function cancelSubscription(id: string): Promise<SubscriptionDetail> {
  return request<SubscriptionDetail>(`/subscriptions/${encodeURIComponent(id)}/cancel`, {
    method: 'POST',
  });
}

// Soft-deletes it (07 §7): it leaves every list and total, its history is
// kept. 204 with no body; a 404 means it's already gone or not yours.
export function deleteSubscription(id: string): Promise<void> {
  return request<void>(`/subscriptions/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

// Undoes a delete (the Undo toast): it comes back with the status it had,
// active or cancelled. Restoring one that isn't deleted changes nothing.
export function restoreSubscription(id: string): Promise<SubscriptionDetail> {
  return request<SubscriptionDetail>(`/subscriptions/${encodeURIComponent(id)}/restore`, {
    method: 'POST',
  });
}

// Loads one subscription. A 404 means "not found or not yours".
export function getSubscription(id: string): Promise<SubscriptionDetail> {
  return request<SubscriptionDetail>(`/subscriptions/${encodeURIComponent(id)}`);
}
