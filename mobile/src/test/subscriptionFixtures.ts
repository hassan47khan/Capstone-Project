/**
 * Fake subscription details for the mock API (handoff 04 §4: Alex at
 * SEED_TODAY 2026-10-01). Written by hand to match what the backend seed
 * sends; the client never computes these figures.
 *
 * Used by the GET and DELETE /subscriptions/:id mock routes in routes.ts.
 */
import type { SubscriptionDetail } from '@/features/subscriptions/api';

import { CATEGORIES } from './contractFixtures';
import { MOCK_EMAILS } from './fixtures';
import { alexSeedDetails } from './subscriptionSeed';

const usd = (amount: string) => ({ amount, currency: 'USD' });

// Netflix: created at $13.99 in "Other", moved to Entertainment, then
// raised to $15.49 on 2026-10-01 (04 §4.4). Total spent: 31 bills x $13.99.
export const netflixDetail: SubscriptionDetail = {
  id: 'sub-netflix',
  name: 'Netflix',
  billing_price: '15.49',
  billing_currency: 'USD',
  billing_cycle: 'monthly',
  custom_cycle_count: null,
  custom_cycle_unit: null,
  start_date: '2024-03-12',
  next_bill_date: '2026-10-12',
  category: CATEGORIES.entertainment,
  notes: '',
  payment_label: 'Visa ••4242',
  status: 'active',
  cancelled_on: null,
  is_trial: false,
  trial_ends_on: null,
  trial_length_days: null,
  trial_reminder_enabled: true,
  trial_decision: 'none',
  counts_toward_totals: true,
  normalized_monthly: usd('15.49'),
  service_mark: { mark: 'N', brand_hex: '#e50914', tint_hex: '#ffecee' },
  created_at: '2024-03-12T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
  total_spent_to_date: usd('433.69'),
  saved_per_year: null,
  // Newest first, like the API.
  history: [
    {
      id: 'evt-netflix-3',
      event_type: 'price_change',
      occurred_at: '2026-10-01T00:00:00Z',
      old_value: { price: '13.99' },
      new_value: { price: '15.49' },
    },
    {
      id: 'evt-netflix-2',
      event_type: 'category_change',
      occurred_at: '2025-06-12T00:00:00Z',
      old_value: { category: 'other' },
      new_value: { category: 'entertainment' },
    },
    {
      id: 'evt-netflix-1',
      event_type: 'created',
      occurred_at: '2024-03-12T00:00:00Z',
      old_value: null,
      new_value: {
        price: '13.99',
        currency: 'USD',
        category: 'other',
        billing_cycle: 'monthly',
        custom_cycle_count: null,
        custom_cycle_unit: null,
      },
    },
  ],
};

// Headspace: $12.99 every 2 months, no price changes, no payment label.
// Monthly equivalent 6.50 (6.495 rounded by the server). 6 bills so far.
export const headspaceDetail: SubscriptionDetail = {
  id: 'sub-headspace',
  name: 'Headspace',
  billing_price: '12.99',
  billing_currency: 'USD',
  billing_cycle: 'custom',
  custom_cycle_count: 2,
  custom_cycle_unit: 'months',
  start_date: '2025-10-15',
  next_bill_date: '2026-10-15',
  category: CATEGORIES.healthWellness,
  notes: '',
  payment_label: '',
  status: 'active',
  cancelled_on: null,
  is_trial: false,
  trial_ends_on: null,
  trial_length_days: null,
  trial_reminder_enabled: true,
  trial_decision: 'none',
  counts_toward_totals: true,
  normalized_monthly: usd('6.50'),
  service_mark: { mark: 'H', brand_hex: '#a259ff', tint_hex: '#f4ecff' },
  created_at: '2025-10-15T00:00:00Z',
  updated_at: '2025-10-15T00:00:00Z',
  total_spent_to_date: usd('77.94'),
  saved_per_year: null,
  history: [
    {
      id: 'evt-headspace-1',
      event_type: 'created',
      occurred_at: '2025-10-15T00:00:00Z',
      old_value: null,
      new_value: {
        price: '12.99',
        currency: 'USD',
        category: 'health-wellness',
        billing_cycle: 'custom',
        custom_cycle_count: 2,
        custom_cycle_unit: 'months',
      },
    },
  ],
};

// Which account owns which details. Anyone else gets a 404. Alex has all 11
// seed subscriptions, so every Home link (contractFixtures.ts) opens one.
const detailsByEmail: Record<string, SubscriptionDetail[]> = {
  [MOCK_EMAILS.full]: [netflixDetail, headspaceDetail, ...alexSeedDetails],
};

// Ids soft-deleted this session: gone from detail (04 §2).
let deleted = new Set<string>();

export function resetCreatedSubscriptions(): void {
  deleted = new Set();
}

/** One subscription for one account, or null (the route turns that into a 404). */
export function subscriptionDetailFor(
  email: string,
  id: string,
): SubscriptionDetail | null {
  if (deleted.has(id)) return null;
  return detailsByEmail[email]?.find((s) => s.id === id) ?? null;
}

/** DELETE /subscriptions/:id for the mock API: a soft delete. False when not found. */
export function deleteMockSubscription(email: string, id: string): boolean {
  if (!subscriptionDetailFor(email, id)) return false;
  deleted.add(id);
  return true;
}
