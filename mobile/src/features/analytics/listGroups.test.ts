/**
 * The Analytics list's data (08 §2.4), with Alex's real list: 11 subscriptions
 * in 7 categories, as the backend returned them (scratch database, 2026-11-01).
 */
import { MOCK_EMAILS } from '@/test/fixtures';
import {
  cancelMockSubscription,
  resetCreatedSubscriptions,
  subscriptionListFor,
} from '@/test/subscriptionFixtures';

import {
  categoryOptions,
  filterRows,
  groupRows,
  listedRows,
  rowCycle,
  UNCATEGORIZED,
} from './listGroups';

const ALEX = MOCK_EMAILS.full;
const alex = () => subscriptionListFor(ALEX, {}).results;

beforeEach(() => resetCreatedSubscriptions());

describe('which rows show', () => {
  it('lists all 11 active subscriptions and trials', () => {
    expect(listedRows(alex())).toHaveLength(11);
  });

  it('leaves out a cancelled one for now (it has no next bill; see #167)', () => {
    cancelMockSubscription(ALEX, 'sub-netflix');

    expect(listedRows(alex()).map((row) => row.name)).not.toContain('Netflix');
    expect(listedRows(alex())).toHaveLength(10);
  });
});

describe('chips (08 §2.4)', () => {
  it('one per category, A to Z, with how many each has', () => {
    expect(categoryOptions(listedRows(alex())).map((c) => [c.name, c.count])).toEqual([
      ['AI Tools', 1],
      ['Cloud Storage', 1],
      ['Entertainment', 4],
      ['Health & Wellness', 1],
      ['News & Media', 1],
      ['Other', 1],
      ['Productivity', 2],
    ]);
  });

  it('puts Uncategorized last', () => {
    const rows = listedRows(alex());
    const withNone = [{ ...rows[0]!, id: 'x', category: null }, ...rows];

    const options = categoryOptions(withNone);
    expect(options[options.length - 1]).toMatchObject({
      key: UNCATEGORIZED,
      name: 'Uncategorized',
    });
  });
});

describe('search and filter', () => {
  it('matches names ignoring case and spaces, within the chip', () => {
    const rows = listedRows(alex());

    expect(filterRows(rows, null, '  NET ').map((r) => r.name)).toEqual(['Netflix']);
    expect(filterRows(rows, 'entertainment', '').map((r) => r.name)).toEqual([
      'Hulu',
      'Spotify',
      'Netflix',
      'YouTube Premium',
    ]);
    expect(filterRows(rows, 'productivity', 'net')).toEqual([]);
  });
});

describe('groups', () => {
  it('only categories with subscriptions get a group (chips keep all 7)', () => {
    const entertainmentOnly = filterRows(listedRows(alex()), 'entertainment', '');

    expect(groupRows(entertainmentOnly).map((g) => g.category.key)).toEqual([
      'entertainment',
    ]);
    expect(categoryOptions(entertainmentOnly)).toHaveLength(7);
  });

  it("keep the server's order (soonest bill first) inside each group", () => {
    const entertainment = groupRows(listedRows(alex())).find(
      (g) => g.category.key === 'entertainment',
    )!;

    expect(entertainment.rows.map((r) => r.next_bill_date)).toEqual([
      '2026-10-03',
      '2026-10-04',
      '2026-10-12',
      '2026-10-15',
    ]);
  });
});

describe("ListRow's cycle", () => {
  it('maps every billing cycle, including a custom one', () => {
    const base = alex()[0]!;
    const cycle = (
      billing_cycle: string,
      count: number | null = null,
      unit: string | null = null,
    ) =>
      rowCycle({
        ...base,
        billing_cycle,
        custom_cycle_count: count,
        custom_cycle_unit: unit,
      } as typeof base);

    expect(cycle('monthly')).toEqual({ unit: 'month', count: 1 });
    expect(cycle('weekly')).toEqual({ unit: 'week', count: 1 });
    expect(cycle('quarterly')).toEqual({ unit: 'month', count: 3 });
    expect(cycle('yearly')).toEqual({ unit: 'year', count: 1 });
    // Headspace: every 2 months (real seed).
    expect(cycle('custom', 2, 'months')).toEqual({ unit: 'month', count: 2 });
    expect(cycle('custom', 10, 'days')).toEqual({ unit: 'day', count: 10 });
    expect(cycle('custom', 3, 'weeks')).toEqual({ unit: 'week', count: 3 });
    expect(cycle('custom', 2, 'years')).toEqual({ unit: 'year', count: 2 });
  });
});
