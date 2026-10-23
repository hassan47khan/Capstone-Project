/**
 * Subscription data from the backend (handoff 04 §5, backend/schema.yml).
 *
 * TODO: move to src/api once Hassan generates the API client from the schema.
 * Kept in this folder for now so we don't edit someone else's folder.
 */
import type { CategoryRef, ContractMoney, ServiceMarkRef } from '@/api/analyticsTypes';
import { request } from '@/api/client';
import type { CurrencyCode, DateOnly, Instant, MoneyString } from '@/api/types';

// How often it bills. "custom" uses custom_cycle_count + custom_cycle_unit.
export type BillingCycle = 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'custom';
export type CustomCycleUnit = 'days' | 'weeks' | 'months' | 'years';
export type SubscriptionStatus = 'active' | 'cancelled';
export type TrialDecision = 'none' | 'keep' | 'remind' | 'decision';

// The kinds of change recorded in a subscription's history.
export type HistoryEventType =
  'created' | 'price_change' | 'category_change' | 'cycle_change' | 'cancelled';

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

// Loads one subscription. A 404 means "not found or not yours".
export function getSubscription(id: string): Promise<SubscriptionDetail> {
  return request<SubscriptionDetail>(`/subscriptions/${encodeURIComponent(id)}`);
}
