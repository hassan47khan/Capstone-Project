/**
 * Tests for the price-history logic behind the Detail chart (07 §4).
 */
import { headspaceDetail, netflixDetail } from '@/test/subscriptionFixtures';

import type { HistoryEvent } from './api';
import {
  buildPriceSeries,
  compareDecimal,
  daysBetween,
  describePriceHistory,
  formatMonthYear,
  levelOf,
  monthsBefore,
  normalizeDecimal,
  priceLevels,
} from './priceHistory';
import { utcToday } from './today';

// A price_change event, for building histories in tests.
const change = (at: string, from: string | null, to: string): HistoryEvent => ({
  id: `evt-${at}`,
  event_type: 'price_change',
  occurred_at: at,
  old_value: from === null ? null : { price: from },
  new_value: { price: to },
});

// buildPriceSeries with USD and a start long before any test window, unless given.
const build = (
  history: HistoryEvent[],
  price: string,
  today: string,
  { currency = 'USD', start = '2020-01-01' } = {},
) => buildPriceSeries(history, { price, currency }, start, today);

describe('compareDecimal', () => {
  it('orders prices by value, not by text length', () => {
    expect(compareDecimal('9.5', '10.00')).toBeLessThan(0);
    expect(compareDecimal('15.49', '13.99')).toBeGreaterThan(0);
    expect(compareDecimal('15.49', '15.490')).toBe(0);
    expect(compareDecimal('0.99', '.99')).toBe(0);
  });
});

describe('normalizeDecimal', () => {
  it('gives equal values one spelling', () => {
    expect(normalizeDecimal('15.50')).toBe('15.5');
    expect(normalizeDecimal('015.5')).toBe('15.5');
    expect(normalizeDecimal('15.00')).toBe('15');
    expect(normalizeDecimal('.99')).toBe('0.99');
  });
});

describe('dates', () => {
  it('goes back whole months, clamping to the end of a shorter month', () => {
    expect(monthsBefore('2026-10-23', 12)).toBe('2025-10-23');
    expect(monthsBefore('2026-03-31', 1)).toBe('2026-02-28');
    expect(monthsBefore('2024-03-31', 1)).toBe('2024-02-29'); // leap year
    expect(monthsBefore('2026-01-15', 1)).toBe('2025-12-15'); // across a year
  });

  it('counts days and labels months', () => {
    expect(daysBetween('2025-10-01', '2026-10-01')).toBe(365);
    expect(formatMonthYear('2025-10-23')).toBe('Oct 2025');
  });
});

describe('buildPriceSeries', () => {
  it('us7_netflix_chart_has_a_step_on_2026_10_01', () => {
    const series = build(netflixDetail.history, '15.49', '2026-10-23');

    expect(series.rangeStart).toBe('2025-10-23');
    expect(series.lineStart).toBe('2025-10-23');
    expect(series.startPrice).toBe('13.99');
    expect(series.steps).toEqual([
      { date: '2026-10-01', price: '15.49', currency: 'USD' },
    ]);
  });

  it('includes a change made today (the seed date)', () => {
    const series = build(netflixDetail.history, '15.49', '2026-10-01');
    expect(series.steps).toEqual([
      { date: '2026-10-01', price: '15.49', currency: 'USD' },
    ]);
  });

  it('has no steps when the price never changed', () => {
    const series = build(headspaceDetail.history, '12.99', '2026-10-23');
    expect(series.startPrice).toBe('12.99');
    expect(series.steps).toEqual([]);
  });

  it('starts at the new price when the change is older than 12 months', () => {
    const series = build(netflixDetail.history, '15.49', '2027-11-01');
    expect(series.startPrice).toBe('15.49');
    expect(series.steps).toEqual([]);
  });

  it('a change late in the day (UTC) is inside the window when today is UTC', () => {
    // 02:00 UTC on Oct 23 is still Oct 22 in the Americas. The chart's "today"
    // must come from the same clock as the event, or the change drops out.
    const history = [change('2026-10-23T02:00:00Z', '13.99', '15.49')];
    const today = utcToday(new Date('2026-10-23T02:30:00Z'));

    expect(today).toBe('2026-10-23');
    expect(build(history, '15.49', today).steps).toEqual([
      { date: '2026-10-23', price: '15.49', currency: 'USD' },
    ]);
  });

  it("without a 'created' event, starts from the first change's old price", () => {
    const history = [change('2026-10-01T00:00:00Z', '13.99', '15.49')];
    const series = build(history, '15.49', '2026-10-23');

    expect(series.startPrice).toBe('13.99');
    expect(series.lineStart).toBe(series.rangeStart);
    expect(series.steps).toEqual([
      { date: '2026-10-01', price: '15.49', currency: 'USD' },
    ]);
  });

  it('with no earlier price at all, starts the line at the first change', () => {
    const history = [
      change('2026-05-01T00:00:00Z', null, '13.99'),
      change('2026-10-01T00:00:00Z', null, '15.49'),
    ];
    const series = build(history, '15.49', '2026-10-23');

    expect(series.lineStart).toBe('2026-05-01');
    expect(series.startPrice).toBe('13.99');
    expect(series.steps).toEqual([
      { date: '2026-10-01', price: '15.49', currency: 'USD' },
    ]);
  });
});

describe('priceLevels', () => {
  it('ranks prices so the higher one is drawn higher', () => {
    const series = build(netflixDetail.history, '15.49', '2026-10-23');
    const levels = priceLevels(series);
    expect(levelOf(levels, '13.99')).toBe(0);
    expect(levelOf(levels, '15.49')).toBe(1);
  });

  it('treats "15.5" and "15.50" as the same level, however they are looked up', () => {
    const history = [
      change('2026-03-01T00:00:00Z', '15.5', '20.00'),
      change('2026-06-01T00:00:00Z', '20.00', '15.50'),
    ];
    const levels = priceLevels(build(history, '15.50', '2026-10-23'));

    expect(levels.size).toBe(2);
    expect(levelOf(levels, '15.5')).toBe(0);
    expect(levelOf(levels, '15.50')).toBe(0);
    expect(levelOf(levels, '20.00')).toBe(1);
  });
});

describe('describePriceHistory', () => {
  it('us7_chart_text_summary_describes_what_the_chart_shows', () => {
    const series = build(netflixDetail.history, '15.49', '2026-10-23');
    expect(describePriceHistory(series)).toBe(
      'Price history for the last 12 months: $13.99, increased to $15.49 on October 1, 2026.',
    );
  });

  it('describes a price that never changed', () => {
    const series = build(headspaceDetail.history, '12.99', '2026-10-23');
    expect(describePriceHistory(series)).toBe(
      'Price history for the last 12 months: $12.99, with no changes.',
    );
  });

  it("says 'increased' for a rise even without a 'created' event", () => {
    const history = [change('2026-10-01T00:00:00Z', '13.99', '15.49')];
    const series = build(history, '15.49', '2026-10-23');
    expect(describePriceHistory(series)).toContain('increased to $15.49');
  });

  it('says where the line starts when the earlier price is unknown', () => {
    const history = [
      change('2026-05-01T00:00:00Z', null, '13.99'),
      change('2026-10-01T00:00:00Z', null, '12.99'),
    ];
    const series = build(history, '12.99', '2026-10-23');
    expect(describePriceHistory(series)).toBe(
      'Price history for the last 12 months: $13.99 from May 1, 2026, decreased to $12.99 on October 1, 2026.',
    );
  });
});

// Hassan's review of #121, 2026-10-25.
describe('review fixes', () => {
  const created = (at: string, price: string, currency = 'USD'): HistoryEvent => ({
    id: `created-${at}`,
    event_type: 'created',
    occurred_at: at,
    old_value: null,
    new_value: { price, currency, category: 'news-media', billing_cycle: 'monthly' },
  });

  it('starts the line when the subscription began, not 12 months back (real seed: New York Times)', () => {
    // From the real backend seed: added 2026-02-08, never changed price.
    const series = build(
      [created('2026-02-08T00:00:00Z', '4.25')],
      '4.25',
      '2026-10-01',
      {
        start: '2026-02-08',
      },
    );

    expect(series.lineStart).toBe('2026-02-08');
    expect(describePriceHistory(series)).toBe(
      'Price history for the last 12 months: $4.25 from February 8, 2026, with no changes.',
    );
  });

  it("a trial starts at its 'created' date, not its first charge after today (real seed: Hulu)", () => {
    // Real seed: trial began 2026-09-02; start_date is the first charge, 2026-10-03.
    const series = build(
      [created('2026-09-02T00:00:00Z', '17.99')],
      '17.99',
      '2026-10-01',
      {
        start: '2026-10-03',
      },
    );
    expect(series.lineStart).toBe('2026-09-02');
  });

  it("without a 'created' event, uses start_date, but never a date after today", () => {
    expect(build([], '9.99', '2026-10-01', { start: '2026-06-15' }).lineStart).toBe(
      '2026-06-15',
    );
    expect(build([], '9.99', '2026-10-01', { start: '2026-12-01' }).lineStart).toBe(
      '2026-10-01',
    );
  });

  it('two changes on the same day are ordered by exact time, not the list order', () => {
    // Newest first, as the API sends them: 15.49 at 00:00, then 16.99 at 12:00.
    const history = [
      change('2026-10-01T12:00:00Z', '15.49', '16.99'),
      change('2026-10-01T00:00:00Z', '13.99', '15.49'),
    ];
    const series = build(history, '16.99', '2026-10-23');

    expect(series.steps.map((s) => s.price)).toEqual(['15.49', '16.99']);
    expect(describePriceHistory(series)).toBe(
      'Price history for the last 12 months: $13.99, increased to $15.49 on October 1, 2026, then increased to $16.99 on October 1, 2026.',
    );
  });

  it('orders by real time even when timestamps are written differently', () => {
    // "…00.500Z" is half a second AFTER "…00Z", though it sorts before it as text.
    const history = [
      change('2026-10-01T00:00:00.500Z', '15.49', '16.99'),
      change('2026-10-01T00:00:00Z', '13.99', '15.49'),
    ];
    expect(build(history, '16.99', '2026-10-23').steps.map((s) => s.price)).toEqual([
      '15.49',
      '16.99',
    ]);
  });

  it('a "change" to the same value ("15.5" -> "15.50") is not a step and not a decrease', () => {
    const history = [
      change('2026-06-01T00:00:00Z', '15.5', '15.50'),
      created('2025-01-01T00:00:00Z', '15.5'),
    ];
    const series = build(history, '15.50', '2026-10-23');

    expect(series.steps).toEqual([]);
    expect(describePriceHistory(series)).toBe(
      'Price history for the last 12 months: $15.50, with no changes.',
    );
  });

  it('skips a same-value step between two real ones', () => {
    const history = [
      change('2026-03-01T00:00:00Z', '13.99', '15.49'),
      change('2026-06-01T00:00:00Z', '15.49', '15.490'),
      change('2026-09-01T00:00:00Z', '15.490', '12.00'),
    ];
    const series = build(history, '12.00', '2026-10-23');
    expect(series.steps.map((s) => s.price)).toEqual(['15.49', '12.00']);
    expect(describePriceHistory(series)).toContain(
      'increased to $15.49 on March 1, 2026, then decreased to $12.00',
    );
  });

  it('formats each price in its recorded currency, and says "changed" across currencies', () => {
    // Added in USD; billing currency later switched to EUR. price_change events
    // carry no currency, so the new price falls back to today's (EUR).
    const history = [
      change('2026-10-01T00:00:00Z', '13.99', '15.49'),
      created('2025-01-01T00:00:00Z', '13.99', 'USD'),
    ];
    const series = build(history, '15.49', '2026-10-23', { currency: 'EUR' });

    expect(series.startCurrency).toBe('USD');
    expect(describePriceHistory(series)).toBe(
      'Price history for the last 12 months: $13.99, changed to €15.49 on October 1, 2026.',
    );
  });

  it('JPY prices keep no decimals', () => {
    const history = [created('2025-01-01T00:00:00Z', '1500', 'JPY')];
    expect(
      describePriceHistory(build(history, '1500', '2026-10-23', { currency: 'JPY' })),
    ).toBe('Price history for the last 12 months: ¥1,500, with no changes.');
  });
});
