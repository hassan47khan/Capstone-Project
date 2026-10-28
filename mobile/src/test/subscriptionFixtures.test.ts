/**
 * The mock subscription store: what's added shows up everywhere, and deletes stick.
 */
import { MOCK_EMAILS } from './fixtures';
import {
  createMockSubscription,
  deleteMockSubscription,
  nextBillDateFor,
  resetCreatedSubscriptions,
  subscriptionDetailFor,
  subscriptionListFor,
  updateMockSubscription,
} from './subscriptionFixtures';

const ALEX = MOCK_EMAILS.full;

const figma = {
  name: 'Figma',
  billing_price: '15.00',
  billing_currency: 'USD',
  billing_cycle: 'monthly',
  custom_cycle_count: null,
  custom_cycle_unit: null,
  start_date: '2026-09-20',
  category: 'productivity',
  notes: '',
  payment_label: '',
};

beforeEach(() => resetCreatedSubscriptions());

it('an added subscription is in the list and has a matching event id', () => {
  const { detail } = createMockSubscription(ALEX, figma);

  expect(detail?.id).toBe('sub_new_1');
  expect(detail?.history[0]?.id).toBe('evt-new-1');
  const names = subscriptionListFor(ALEX, {}).results.map((r) => r.name);
  expect(names).toContain('Figma');
  expect(names).toContain('Netflix');
});

it('list rows leave out the detail-only fields', () => {
  const row = subscriptionListFor(ALEX, {}).results[0]!;
  expect(row).not.toHaveProperty('history');
  expect(row).not.toHaveProperty('total_spent_to_date');
});

it('filters by category slug', () => {
  createMockSubscription(ALEX, figma);
  const names = subscriptionListFor(ALEX, { category: 'productivity' }).results.map(
    (r) => r.name,
  );
  // Alex's two seed productivity plans, soonest bill first, then the new one.
  expect(names).toEqual(['Notion AI', 'Adobe CC', 'Figma']);
});

it('a deleted subscription leaves the list and detail', () => {
  const { detail } = createMockSubscription(ALEX, figma);

  expect(deleteMockSubscription(ALEX, detail!.id)).toBe(true);
  expect(subscriptionDetailFor(ALEX, detail!.id)).toBeNull();
  expect(subscriptionListFor(ALEX, {}).results.map((r) => r.name)).not.toContain('Figma');
  // Deleting again: not found.
  expect(deleteMockSubscription(ALEX, detail!.id)).toBe(false);
});

it("another account can't see or delete Alex's subscriptions", () => {
  expect(subscriptionDetailFor(MOCK_EMAILS.empty, 'sub-netflix')).toBeNull();
  expect(deleteMockSubscription(MOCK_EMAILS.empty, 'sub-netflix')).toBe(false);
});

// Hassan's second review of #122 (and #129's mock findings, fixed at the root).
describe('editing (PATCH) on every id the app can reach', () => {
  it.each(['sub-netflix', 'sub-spotify'])('edits seed subscription %s', (id) => {
    const result = updateMockSubscription(ALEX, id, { notes: 'Family plan' });
    expect(result?.detail?.notes).toBe('Family plan');
    expect(subscriptionDetailFor(ALEX, id)?.notes).toBe('Family plan');
  });

  it('edits a just-added subscription', () => {
    const added = createMockSubscription(ALEX, figma).detail!;
    expect(
      updateMockSubscription(ALEX, added.id, { billing_price: '18.00' })?.detail,
    ).toMatchObject({ id: 'sub_new_1', billing_price: '18.00' });
  });

  it('two edits get two different times, newest first, so the last price wins', () => {
    updateMockSubscription(ALEX, 'sub-netflix', { billing_price: '16.99' });
    updateMockSubscription(ALEX, 'sub-netflix', { billing_price: '17.99' });
    const [latest, earlier] = subscriptionDetailFor(ALEX, 'sub-netflix')!.history;

    expect(latest!.new_value).toEqual({ price: '17.99' });
    expect(earlier!.new_value).toEqual({ price: '16.99' });
    expect(Date.parse(latest!.occurred_at)).toBeGreaterThan(
      Date.parse(earlier!.occurred_at),
    );
    // Same shape as the real server's "now": microseconds and a Z.
    expect(latest!.occurred_at).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/);
  });

  it('editing first does not break the sub_new_1 / evt-new-1 pairing', () => {
    updateMockSubscription(ALEX, 'sub-netflix', { billing_price: '16.99' });
    const added = createMockSubscription(ALEX, figma).detail!;
    expect(added.id).toBe('sub_new_1');
    expect(added.history[0]!.id).toBe('evt-new-1');
  });

  it('works out the next bill date again after a cycle change', () => {
    const result = updateMockSubscription(ALEX, 'sub-spotify', {
      billing_cycle: 'yearly',
    });
    // Spotify started 2024-10-04: yearly bills fall on Oct 4.
    expect(result?.detail?.next_bill_date).toBe('2026-10-04');
  });
});

describe('next bill date (server: next_bill_date, first bill on or after today)', () => {
  // The mock's today is SEED_TODAY, 2026-10-01.
  it.each([
    ['monthly, started 2026-09-20', '2026-09-20', 'monthly', null, null, '2026-10-20'],
    [
      'monthly from the 31st clamps, then returns',
      '2026-01-31',
      'monthly',
      null,
      null,
      '2026-10-31',
    ],
    [
      'a bill due today is still upcoming',
      '2025-10-01',
      'monthly',
      null,
      null,
      '2026-10-01',
    ],
    ['weekly', '2026-09-20', 'weekly', null, null, '2026-10-04'],
    ['every 10 days', '2026-09-20', 'custom', 10, 'days', '2026-10-10'],
    ['quarterly', '2026-02-15', 'quarterly', null, null, '2026-11-15'],
    [
      'starting in the future: the first bill is the start',
      '2026-10-20',
      'monthly',
      null,
      null,
      '2026-10-20',
    ],
  ] as const)('%s', (_, start, cycle, count, unit, expected) => {
    expect(nextBillDateFor(start, cycle, count, unit)).toBe(expected);
  });

  it("matches the real seed for every one of Alex's subscriptions", () => {
    // Each fixture's next_bill_date came from the real server.
    for (const row of subscriptionListFor(ALEX, {}).results) {
      expect([
        row.name,
        nextBillDateFor(
          row.start_date,
          row.billing_cycle,
          row.custom_cycle_count,
          row.custom_cycle_unit,
        ),
      ]).toEqual([row.name, row.next_bill_date]);
    }
  });

  it('an added subscription gets one, so it lists in date order', () => {
    const added = createMockSubscription(ALEX, figma).detail!;
    expect(added.next_bill_date).toBe('2026-10-20');
  });
});

it('Rosa still has her subscriptions, including one with no exchange rate', () => {
  const rows = subscriptionListFor(MOCK_EMAILS.missingRate, {}).results;
  expect(rows.map((r) => r.name)).toEqual(['Civic Weekly', 'Fútbol Pass']);
  // The real server's answer for a currency it has no rate for.
  expect(rows[1]).toMatchObject({ billing_currency: 'ARS', normalized_monthly: null });
});
