/**
 * History events -> Edit History lines (07 §6).
 */
import { headspaceDetail, netflixDetail } from '@/test/subscriptionFixtures';

import type { HistoryEvent } from './api';
import { describeEvent, historyLines, onlyCreation } from './historyLines';

const event = (overrides: Partial<HistoryEvent>): HistoryEvent => ({
  id: 'evt-1',
  event_type: 'price_change',
  occurred_at: '2026-10-01T00:00:00Z',
  old_value: null,
  new_value: null,
  ...overrides,
});

describe('describeEvent (07 §6)', () => {
  it('price change: warning badge, old and new price', () => {
    const line = describeEvent(
      event({ old_value: { price: '13.99' }, new_value: { price: '15.49' } }),
      'USD',
    );
    expect(line).toEqual({
      id: 'evt-1',
      date: 'Oct 1, 2026',
      spokenDate: 'October 1, 2026',
      badge: { label: 'Price update', tone: 'warning' },
      text: 'Price changed from $13.99 to $15.49',
    });
  });

  it('price change uses the billing currency (JPY has no decimals)', () => {
    const line = describeEvent(
      event({ old_value: { price: '1500' }, new_value: { price: '1800' } }),
      'JPY',
    );
    expect(line.text).toBe('Price changed from ¥1,500 to ¥1,800');
  });

  it('category change: names, and "Uncategorized" for none', () => {
    const line = describeEvent(
      event({
        event_type: 'category_change',
        old_value: { category: null },
        new_value: { category: 'entertainment' },
      }),
      'USD',
    );
    expect(line.badge).toEqual({ label: 'Category', tone: 'neutral' });
    expect(line.text).toBe('Category changed from Uncategorized to Entertainment');
  });

  it('an unknown category slug falls back to "Uncategorized", not the raw slug', () => {
    const line = describeEvent(
      event({
        event_type: 'category_change',
        old_value: { category: 'other' },
        new_value: { category: 'not-a-real-slug' },
      }),
      'USD',
    );
    expect(line.text).toBe('Category changed from Other to Uncategorized');
  });

  it('cycle change: preset and custom cycles in words', () => {
    const line = describeEvent(
      event({
        event_type: 'cycle_change',
        old_value: {
          billing_cycle: 'monthly',
          custom_cycle_count: null,
          custom_cycle_unit: null,
        },
        new_value: {
          billing_cycle: 'custom',
          custom_cycle_count: 2,
          custom_cycle_unit: 'months',
        },
      }),
      'USD',
    );
    expect(line.badge).toEqual({ label: 'Cycle', tone: 'neutral' });
    expect(line.text).toBe('Billing cycle changed from Monthly to Every 2 months');
  });

  it('created: success badge, price per cycle and category (seed shape)', () => {
    const created = netflixDetail.history.find((e) => e.event_type === 'created')!;
    const line = describeEvent(created, 'USD');
    expect(line.badge).toEqual({ label: 'Creation', tone: 'success' });
    expect(line.date).toBe('Mar 12, 2024');
    expect(line.text).toBe('Subscription added, $13.99/mo, Other');
  });

  it.each([
    ['weekly', '/wk', null, null],
    ['quarterly', '/3mo', null, null],
    ['yearly', '/yr', null, null],
    ['custom', '/3wk', 3, 'weeks'],
  ] as const)('created on a %s cycle shows %s', (cycle, suffix, count, unit) => {
    const line = describeEvent(
      event({
        event_type: 'created',
        new_value: {
          price: '9.00',
          currency: 'USD',
          category: 'other',
          billing_cycle: cycle,
          custom_cycle_count: count,
          custom_cycle_unit: unit,
        },
      }),
      'USD',
    );
    expect(line.text).toBe(`Subscription added, $9.00${suffix}, Other`);
  });

  it('cancelled: neutral badge, never red', () => {
    const line = describeEvent(event({ event_type: 'cancelled' }), 'USD');
    expect(line.badge).toEqual({ label: 'Cancelled', tone: 'neutral' });
    expect(line.text).toBe('Marked as cancelled');
  });

  it('dates come from the UTC day, whatever the time or microseconds', () => {
    const line = describeEvent(
      event({ occurred_at: '2026-10-01T23:59:59.123456Z' }),
      'USD',
    );
    expect(line.date).toBe('Oct 1, 2026');
  });
});

describe('historyLines', () => {
  it('lists newest first by real time, not by text', () => {
    // As text, "…00Z" sorts after "…00.123456Z"; as times it is earlier.
    const lines = historyLines(
      [
        event({ id: 'seed', occurred_at: '2026-10-01T12:00:00Z' }),
        event({ id: 'edit', occurred_at: '2026-10-01T12:00:00.123456Z' }),
        event({ id: 'old', event_type: 'created', occurred_at: '2024-03-12T00:00:00Z' }),
      ],
      'USD',
    );
    expect(lines.map((l) => l.id)).toEqual(['edit', 'seed', 'old']);
  });

  it('turns the Netflix seed into three lines, newest first', () => {
    const lines = historyLines(netflixDetail.history, 'USD');
    expect(lines.map((l) => l.badge.label)).toEqual([
      'Price update',
      'Category',
      'Creation',
    ]);
  });

  it('does not reorder the array it was given', () => {
    const events = [
      event({ id: 'a', occurred_at: '2024-01-01T00:00:00Z' }),
      event({ id: 'b', occurred_at: '2026-01-01T00:00:00Z' }),
    ];
    historyLines(events, 'USD');
    expect(events.map((e) => e.id)).toEqual(['a', 'b']);
  });
});

describe('onlyCreation (07 §9 empty state)', () => {
  it('is true for a subscription that was only added', () => {
    expect(onlyCreation(headspaceDetail.history)).toBe(true);
  });

  it('is true for no events at all', () => {
    expect(onlyCreation([])).toBe(true);
  });

  it('is false once anything changed', () => {
    expect(onlyCreation(netflixDetail.history)).toBe(false);
  });
});
