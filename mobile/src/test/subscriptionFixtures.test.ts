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
