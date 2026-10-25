/**
 * The mock subscription store: what's added shows up everywhere, and deletes stick.
 */
import { MOCK_EMAILS } from './fixtures';
import {
  createMockSubscription,
  deleteMockSubscription,
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
  expect(names).toEqual(['Figma']);
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

  it('a price change writes one price_change event, newest first', () => {
    const result = updateMockSubscription(ALEX, 'sub-netflix', {
      ...netflixInput,
      billing_price: '16.99',
    });

    expect(result?.detail?.billing_price).toBe('16.99');
    const [latest, ...rest] = result!.detail!.history;
    expect(latest).toMatchObject({
      event_type: 'price_change',
      old_value: { price: '15.49' },
      new_value: { price: '16.99' },
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
