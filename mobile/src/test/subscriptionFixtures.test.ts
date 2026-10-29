/**
 * The mock subscription store: what's added shows up everywhere, and deletes stick.
 */
import { MOCK_EMAILS } from './fixtures';
import {
  cancelMockSubscription,
  createMockSubscription,
  createMockSubscriptionWithKey,
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

    expect(latest!.new_value).toEqual({ price: '17.99', currency: 'USD' });
    expect(earlier!.new_value).toEqual({ price: '16.99', currency: 'USD' });
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

describe('editing (PATCH)', () => {
  const netflixInput = {
    name: 'Netflix',
    billing_price: '15.49',
    billing_currency: 'USD',
    billing_cycle: 'monthly' as const,
    custom_cycle_count: null,
    custom_cycle_unit: null,
    start_date: '2024-03-12',
    category: 'entertainment',
    notes: '',
    payment_label: 'Visa ••4242',
  };

  // Same events the real server wrote for these edits (checked 2026-10-28).
  it.each([
    ['only the currency', { billing_currency: 'EUR' }, '15.49'],
    [
      'the currency and the price',
      { billing_currency: 'EUR', billing_price: '13.99' },
      '13.99',
    ],
  ])(
    'a switch of %s writes one currency_change and no price_change',
    (_, change, price) => {
      const result = updateMockSubscription(ALEX, 'sub-netflix', {
        ...netflixInput,
        ...change,
      });

      const history = result!.detail!.history;
      // Everything this edit wrote shares its instant: just the one event.
      const written = history.filter((e) => e.occurred_at === history[0]!.occurred_at);
      expect(written).toHaveLength(1);
      expect(written[0]).toMatchObject({
        event_type: 'currency_change',
        old_value: { price: '15.49', currency: 'USD' },
        new_value: { price, currency: 'EUR' },
      });
    },
  );

  it('a price change writes one price_change event, newest first', () => {
    const result = updateMockSubscription(ALEX, 'sub-netflix', {
      ...netflixInput,
      billing_price: '16.99',
    });

    expect(result?.detail?.billing_price).toBe('16.99');
    const [latest, ...rest] = result!.detail!.history;
    expect(latest).toMatchObject({
      event_type: 'price_change',
      old_value: { price: '15.49', currency: 'USD' },
      new_value: { price: '16.99', currency: 'USD' },
    });
    expect(rest.map((e) => e.event_type)).toEqual([
      'price_change',
      'category_change',
      'created',
    ]);
    // The edit sticks: detail and list both see it.
    expect(subscriptionDetailFor(ALEX, 'sub-netflix')?.billing_price).toBe('16.99');
    const row = subscriptionListFor(ALEX, {}).results.find((r) => r.id === 'sub-netflix');
    expect(row?.billing_price).toBe('16.99');
  });

  it('category and cycle changes each write their own event', () => {
    const result = updateMockSubscription(ALEX, 'sub-netflix', {
      ...netflixInput,
      category: 'other',
      billing_cycle: 'yearly',
    });

    const types = result!.detail!.history.slice(0, 2).map((e) => e.event_type);
    expect(types.sort()).toEqual(['category_change', 'cycle_change']);
  });

  it('changing only notes writes no history event', () => {
    const before = subscriptionDetailFor(ALEX, 'sub-netflix')!.history.length;
    const result = updateMockSubscription(ALEX, 'sub-netflix', {
      ...netflixInput,
      notes: 'Family plan',
    });

    expect(result?.detail?.notes).toBe('Family plan');
    expect(result?.detail?.history).toHaveLength(before);
  });

  it('rejects a zero price and is a 404 for someone else', () => {
    expect(
      updateMockSubscription(ALEX, 'sub-netflix', { ...netflixInput, billing_price: '0' })
        ?.error?.code,
    ).toBe('price_invalid');
    expect(
      updateMockSubscription(MOCK_EMAILS.empty, 'sub-netflix', netflixInput),
    ).toBeNull();
  });
});

describe('cancelling (POST /cancel), like operations.cancel_subscription', () => {
  it('cancels: no next bill, out of totals, saved per year, history kept plus an event', () => {
    const result = cancelMockSubscription(ALEX, 'sub-netflix')!;

    expect(result.detail).toMatchObject({
      status: 'cancelled',
      cancelled_on: '2026-10-01',
      next_bill_date: null,
      counts_toward_totals: false,
      saved_per_year: { amount: '185.88', currency: 'USD' },
    });
    expect(result.detail!.history.map((e) => e.event_type)).toEqual([
      'cancelled',
      'price_change',
      'category_change',
      'created',
    ]);
    // Same shape as the real server's event.
    expect(result.detail!.history[0]).toMatchObject({
      old_value: null,
      new_value: { cancelled_on: '2026-10-01' },
    });
    expect(result.detail!.history[0]!.occurred_at).toMatch(/\.\d{6}Z$/);
    expect(subscriptionDetailFor(ALEX, 'sub-netflix')!.status).toBe('cancelled');
  });

  it("saved per year matches the real server's figure for every seed subscription", () => {
    // Captured from the real backend: cancel each one, read saved_per_year.
    const real: Record<string, string> = {
      'sub-adobe-cc': '659.88',
      'sub-chatgpt-plus': '240.00',
      'sub-duolingo-max': '167.88',
      'sub-headspace': '77.94',
      'sub-hulu': '215.88',
      'sub-netflix': '185.88',
      'sub-new-york-times': '51.00',
      'sub-notion-ai': '120.00',
      'sub-spotify': '131.88',
      'sub-youtube-premium': '167.88',
      'sub-icloud-': '35.88',
    };
    for (const [id, amount] of Object.entries(real)) {
      expect([
        id,
        cancelMockSubscription(ALEX, id)!.detail!.saved_per_year?.amount,
      ]).toEqual([id, amount]);
    }
  });

  it('a second cancel is a 409 already_cancelled, and changes nothing', () => {
    cancelMockSubscription(ALEX, 'sub-netflix');
    const before = subscriptionDetailFor(ALEX, 'sub-netflix');

    expect(cancelMockSubscription(ALEX, 'sub-netflix')!.error).toEqual({
      code: 'already_cancelled',
      message: 'This subscription is already cancelled.',
    });
    expect(subscriptionDetailFor(ALEX, 'sub-netflix')).toBe(before);
  });

  it('is null (a 404) for someone else, a missing id, or a deleted one', () => {
    expect(cancelMockSubscription(MOCK_EMAILS.empty, 'sub-netflix')).toBeNull();
    expect(cancelMockSubscription(ALEX, 'sub-nope')).toBeNull();
    deleteMockSubscription(ALEX, 'sub-headspace');
    expect(cancelMockSubscription(ALEX, 'sub-headspace')).toBeNull();
  });

  it('cancelled sorts last in the list (as the real server does)', () => {
    cancelMockSubscription(ALEX, 'sub-icloud-');
    const ids = subscriptionListFor(ALEX, {}).results.map((r) => r.id);
    expect(ids.at(-1)).toBe('sub-icloud-');
  });

  it('a plan with no known annual figure gets null, not a made-up one', () => {
    const added = createMockSubscription(ALEX, figma).detail!;
    expect(cancelMockSubscription(ALEX, added.id)!.detail!.saved_per_year).toBeNull();
  });
});

// Same rules as the real server's (#141, backend/subscriptions/tests/test_idempotency.py).
describe('Idempotency-Key on create', () => {
  const FIGMA = {
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
  const figmas = (email: string = ALEX) =>
    subscriptionListFor(email, {}).results.filter((s) => s.name === 'Figma');

  it('a retry with the same key and body gets the same subscription', () => {
    const first = createMockSubscriptionWithKey(ALEX, FIGMA, 'k-1');
    const retry = createMockSubscriptionWithKey(ALEX, FIGMA, 'k-1');

    expect(retry.detail?.id).toBe(first.detail?.id);
    expect(figmas()).toHaveLength(1);
  });

  it('the same body in another key order is still a repeat', () => {
    createMockSubscriptionWithKey(ALEX, FIGMA, 'k-1');
    const reversed = Object.fromEntries(Object.entries(FIGMA).reverse());

    expect(createMockSubscriptionWithKey(ALEX, reversed, 'k-1').error).toBeUndefined();
    expect(figmas()).toHaveLength(1);
  });

  it('a reused key with a different body is a 409, with the server message', () => {
    createMockSubscriptionWithKey(ALEX, FIGMA, 'k-1');

    const result = createMockSubscriptionWithKey(
      ALEX,
      { ...FIGMA, notes: 'Team' },
      'k-1',
    );

    expect(result.error).toEqual({
      code: 'idempotency_key_reused',
      message: 'This Idempotency-Key was already used for a different subscription.',
      status: 409,
    });
    expect(figmas()).toHaveLength(1);
  });

  it('keys are per account', () => {
    createMockSubscriptionWithKey(ALEX, FIGMA, 'k-1');

    expect(
      createMockSubscriptionWithKey(MOCK_EMAILS.empty, FIGMA, 'k-1').detail,
    ).toBeDefined();
    expect(figmas()).toHaveLength(1);
    expect(figmas(MOCK_EMAILS.empty)).toHaveLength(1);
  });

  it('a create that failed validation does not use up the key', () => {
    const failed = createMockSubscriptionWithKey(ALEX, { ...FIGMA, name: ' ' }, 'k-1');
    expect(failed.error?.code).toBe('validation_error');

    expect(createMockSubscriptionWithKey(ALEX, FIGMA, 'k-1').detail).toBeDefined();
  });

  it.each(['', '   ', 'k'.repeat(256)])('an unusable key %j is a 400', (key) => {
    const message = 'Send an Idempotency-Key of 1 to 255 characters, or none.';
    expect(createMockSubscriptionWithKey(ALEX, FIGMA, key).error).toEqual({
      code: 'validation_error',
      message,
      fields: { 'Idempotency-Key': [message] },
    });
    expect(figmas()).toHaveLength(0);
  });

  it('without a key every create creates', () => {
    createMockSubscriptionWithKey(ALEX, FIGMA, undefined);
    createMockSubscriptionWithKey(ALEX, FIGMA, undefined);

    expect(figmas()).toHaveLength(2);
  });
});
