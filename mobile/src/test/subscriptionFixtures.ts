/**
 * Fake subscription details for the mock API (handoff 04 §4: Alex at
 * SEED_TODAY 2026-10-01). Written by hand to match what the backend seed
 * sends; the client never computes these figures.
 *
 * Used by the GET and POST /subscriptions mock routes in routes.ts.
 */
import type { SubscriptionDetail, SubscriptionInput } from '@/features/subscriptions/api';

import { CATEGORIES, SEED_TODAY } from './contractFixtures';
import { MOCK_EMAILS } from './fixtures';

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

// Which account owns which details. Anyone else gets a 404.
const detailsByEmail: Record<string, SubscriptionDetail[]> = {
  [MOCK_EMAILS.full]: [netflixDetail, headspaceDetail],
};

// Subscriptions added during this app session or test, per account.
// resetMockState() in routes.ts clears them between tests.
let created: Record<string, SubscriptionDetail[]> = {};
let nextId = 1;

export function resetCreatedSubscriptions(): void {
  created = {};
  nextId = 1;
}

/** One subscription for one account, or null (the route turns that into a 404). */
export function subscriptionDetailFor(
  email: string,
  id: string,
): SubscriptionDetail | null {
  const all = [...(detailsByEmail[email] ?? []), ...(created[email] ?? [])];
  return all.find((s) => s.id === id) ?? null;
}

type CreateResult =
  | { detail: SubscriptionDetail; error?: undefined }
  | {
      detail?: undefined;
      error: { code: string; message: string; fields: Record<string, string[]> };
    };

const PRICE_MESSAGE = 'Enter a valid price greater than $0.';

// Monthly equivalents the real server gives for non-monthly plans (mock can't do money math).
const KNOWN_MONTHLY: Record<string, string> = {
  '12.99 custom 2 months': '6.50', // Headspace (04 §4.2)
};

// A monthly plan's equivalent is its price; others come from KNOWN_MONTHLY, else null.
function monthlyFor(
  price: string,
  cycle: string,
  input: Partial<SubscriptionInput>,
  currency: string,
) {
  if (cycle === 'monthly') return { amount: price, currency };
  const key = `${price} ${cycle} ${input.custom_cycle_count ?? ''} ${input.custom_cycle_unit ?? ''}`;
  const amount = KNOWN_MONTHLY[key.trim()];
  return amount ? { amount, currency } : null;
}

/**
 * POST /subscriptions for the mock API: checks what the real server checks
 * (04 §5) and keeps the new subscription so GET /subscriptions/:id finds it.
 *
 * The mock can't do the server's money math, so the figures it would compute
 * are left empty (null): no monthly equivalent unless the plan is monthly
 * (then it's just the price), no total spent, no next bill date.
 */
export function createMockSubscription(email: string, body: unknown): CreateResult {
  const input = (body ?? {}) as Partial<SubscriptionInput>;
  const price = input.billing_price ?? '';

  const fields: Record<string, string[]> = {};
  if (!input.name?.trim()) fields.name = ['Enter a subscription name.'];
  if (!input.category) fields.category = ['Choose a category.'];
  if (!input.start_date) fields.start_date = ['Choose a start date.'];
  // Price > 0, checked as text: digits, optional fraction, some non-zero digit.
  const priceOk = /^\d+(\.\d+)?$/.test(price) && /[1-9]/.test(price);
  if (!priceOk) fields.billing_price = [PRICE_MESSAGE];

  if (Object.keys(fields).length > 0) {
    return {
      error: {
        code: priceOk ? 'validation_error' : 'price_invalid',
        message: priceOk ? Object.values(fields)[0]![0]! : PRICE_MESSAGE,
        fields,
      },
    };
  }

  const currency = input.billing_currency ?? 'USD';
  const cycle = input.billing_cycle ?? 'monthly';
  const category =
    Object.values(CATEGORIES).find((c) => c.slug === input.category) ?? null;
  const now = `${SEED_TODAY}T00:00:00Z`;
  const detail: SubscriptionDetail = {
    id: `sub_new_${nextId++}`,
    name: input.name!.trim(),
    billing_price: price,
    billing_currency: currency,
    billing_cycle: cycle,
    custom_cycle_count: input.custom_cycle_count ?? null,
    custom_cycle_unit: input.custom_cycle_unit ?? null,
    start_date: input.start_date!,
    next_bill_date: null,
    category,
    notes: input.notes ?? '',
    payment_label: input.payment_label ?? '',
    status: 'active',
    cancelled_on: null,
    is_trial: false,
    trial_ends_on: null,
    trial_length_days: null,
    trial_reminder_enabled: true,
    trial_decision: 'none',
    counts_toward_totals: true,
    normalized_monthly: monthlyFor(price, cycle, input, currency),

    service_mark: null,
    created_at: now,
    updated_at: now,
    total_spent_to_date: null,
    saved_per_year: null,
    history: [
      {
        id: `evt-new-${nextId}`,
        event_type: 'created',
        occurred_at: now,
        old_value: null,
        new_value: {
          price,
          currency,
          category: input.category ?? null,
          billing_cycle: cycle,
          custom_cycle_count: input.custom_cycle_count ?? null,
          custom_cycle_unit: input.custom_cycle_unit ?? null,
        },
      },
    ],
  };

  created[email] = [...(created[email] ?? []), detail];
  return { detail };
}
