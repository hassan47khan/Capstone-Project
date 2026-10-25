/**
 * Fake subscription details for the mock API (handoff 04 §4: Alex at
 * SEED_TODAY 2026-10-01). Written by hand to match what the backend seed
 * sends; the client never computes these figures.
 *
 * Used by the /subscriptions mock routes in routes.ts (list, detail, add,
 * edit and delete all share this one store).
 */
import type {
  HistoryEvent,
  SubscriptionDetail,
  SubscriptionInput,
  SubscriptionRow,
} from '@/features/subscriptions/api';

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
// Ids soft-deleted this session: gone from lists and detail (04 §2).
let deleted = new Set<string>();
// Edited copies by id; they replace the seed or added version.
let edited: Record<string, SubscriptionDetail> = {};
let nextId = 1;

export function resetCreatedSubscriptions(): void {
  created = {};
  deleted = new Set();
  edited = {};
  nextId = 1;
}

// Everything one account has: the seed fixtures plus anything added, with
// edits applied, minus deletes.
function allFor(email: string): SubscriptionDetail[] {
  return [...(detailsByEmail[email] ?? []), ...(created[email] ?? [])]
    .filter((s) => !deleted.has(s.id))
    .map((s) => edited[s.id] ?? s);
}

/** One subscription for one account, or null (the route turns that into a 404). */
export function subscriptionDetailFor(
  email: string,
  id: string,
): SubscriptionDetail | null {
  return allFor(email).find((s) => s.id === id) ?? null;
}

// A list row is the detail without the detail-only fields.
function toRow(detail: SubscriptionDetail): SubscriptionRow {
  const row: Partial<SubscriptionDetail> = { ...detail };
  delete row.total_spent_to_date;
  delete row.saved_per_year;
  delete row.history;
  return row as SubscriptionRow;
}

/**
 * GET /subscriptions for the mock API (contract `SubscriptionList`): soonest
 * bill first, cancelled last, with the optional status and category filters.
 */
export function subscriptionListFor(email: string, query: Record<string, string>) {
  const rows = allFor(email)
    .filter((s) => !query.status || s.status === query.status)
    .filter((s) => !query.category || s.category?.slug === query.category)
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === 'cancelled' ? 1 : -1;
      return (a.next_bill_date ?? '9999').localeCompare(b.next_bill_date ?? '9999');
    })
    .map(toRow);
  return { results: rows, next: null, count: rows.length };
}

/** DELETE /subscriptions/:id for the mock API: a soft delete. False when not found. */
export function deleteMockSubscription(email: string, id: string): boolean {
  if (!subscriptionDetailFor(email, id)) return false;
  deleted.add(id);
  return true;
}

type CreateResult =
  | { detail: SubscriptionDetail; error?: undefined }
  | {
      detail?: undefined;
      error: { code: string; message: string; fields: Record<string, string[]> };
    };

const PRICE_MESSAGE = 'Enter a valid price greater than $0.';

// Monthly equivalents the real server gives for non-monthly plans (mock can't do money math).
// One known answer per billing cycle, from 04 §3.1's factors, rounded at the end.
const KNOWN_MONTHLY: Record<string, string> = {
  '12.99 custom 2 months': '6.50', // Headspace (04 §4.2): 12.99 / 2 = 6.495
  '3.00 weekly': '13.00', // 3.00 × 52 / 12
  '30.00 quarterly': '10.00', // 30.00 / 3
  '119.88 yearly': '9.99', // 119.88 / 12
  '6.00 custom 3 weeks': '8.67', // 6.00 × 52 / (12 × 3) = 8.666…
  '5.00 custom 10 days': '15.21', // 5.00 × 365 / (12 × 10) = 15.208…
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
 * are left empty (null): no total spent, no next bill date, and a monthly
 * equivalent only when it is known (see monthlyFor and KNOWN_MONTHLY).
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
  // One number for both ids, so sub_new_1 gets evt-new-1.
  const n = nextId++;
  const detail: SubscriptionDetail = {
    id: `sub_new_${n}`,
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
        id: `evt-new-${n}`,
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

// Price > 0, checked as text: digits, optional fraction, some non-zero digit.
function isPositivePrice(price: string): boolean {
  return /^\d+(\.\d+)?$/.test(price) && /[1-9]/.test(price);
}

/**
 * PATCH /subscriptions/:id for the mock API: applies the changes and, like the
 * real server (04 §5), writes one history event each for a price, category or
 * cycle change. Null when not found (the route turns that into a 404).
 */
export function updateMockSubscription(
  email: string,
  id: string,
  body: unknown,
): CreateResult | null {
  const current = subscriptionDetailFor(email, id);
  if (!current) return null;
  const input = (body ?? {}) as Partial<SubscriptionInput>;

  if (input.billing_price !== undefined && !isPositivePrice(input.billing_price)) {
    return {
      error: {
        code: 'price_invalid',
        message: PRICE_MESSAGE,
        fields: { billing_price: [PRICE_MESSAGE] },
      },
    };
  }
  if (input.name !== undefined && !input.name.trim()) {
    const message = 'Enter a subscription name.';
    return { error: { code: 'validation_error', message, fields: { name: [message] } } };
  }

  const price = input.billing_price ?? current.billing_price;
  const currency = input.billing_currency ?? current.billing_currency;
  const cycle = input.billing_cycle ?? current.billing_cycle;
  const count =
    input.custom_cycle_count !== undefined
      ? input.custom_cycle_count
      : current.custom_cycle_count;
  const unit =
    input.custom_cycle_unit !== undefined
      ? input.custom_cycle_unit
      : current.custom_cycle_unit;
  const slug = input.category ?? current.category?.slug ?? null;
  // Later on the seed day than the seed's own events, so the order is clear.
  const now = `${SEED_TODAY}T12:00:00Z`;

  // One event per kind of change, newest first like the API.
  const events: HistoryEvent[] = [];
  const event = (
    event_type: HistoryEvent['event_type'],
    old_value: HistoryEvent['old_value'],
    new_value: HistoryEvent['new_value'],
  ) =>
    events.unshift({
      id: `evt-edit-${nextId++}`,
      event_type,
      occurred_at: now,
      old_value,
      new_value,
    });

  if (price !== current.billing_price) {
    event('price_change', { price: current.billing_price }, { price });
  }
  if (slug !== (current.category?.slug ?? null)) {
    event(
      'category_change',
      { category: current.category?.slug ?? null },
      { category: slug },
    );
  }
  const cycleChanged =
    cycle !== current.billing_cycle ||
    count !== current.custom_cycle_count ||
    unit !== current.custom_cycle_unit;
  if (cycleChanged) {
    event(
      'cycle_change',
      {
        billing_cycle: current.billing_cycle,
        custom_cycle_count: current.custom_cycle_count,
        custom_cycle_unit: current.custom_cycle_unit,
      },
      { billing_cycle: cycle, custom_cycle_count: count, custom_cycle_unit: unit },
    );
  }

  const updated: SubscriptionDetail = {
    ...current,
    name: input.name?.trim() ?? current.name,
    billing_price: price,
    billing_currency: currency,
    billing_cycle: cycle,
    custom_cycle_count: count,
    custom_cycle_unit: unit,
    start_date: input.start_date ?? current.start_date,
    category: Object.values(CATEGORIES).find((c) => c.slug === slug) ?? null,
    notes: input.notes ?? current.notes,
    payment_label: input.payment_label ?? current.payment_label,
    // Same figure as before unless the price or cycle changed (mock can't do money math).
    normalized_monthly:
      price !== current.billing_price || cycleChanged
        ? monthlyFor(
            price,
            cycle,
            { custom_cycle_count: count, custom_cycle_unit: unit },
            currency,
          )
        : current.normalized_monthly,
    updated_at: now,
    history: [...events, ...current.history],
  };

  edited[id] = updated;
  return { detail: updated };
}
