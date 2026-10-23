/**
 * Tests for the price-history logic behind the Detail chart (07 §4).
 */
import { headspaceDetail, netflixDetail } from '@/test/subscriptionFixtures';

import {
  buildPriceSeries,
  compareDecimal,
  daysBetween,
  describePriceHistory,
  formatMonthYear,
  monthsBefore,
  priceLevels,
} from './priceHistory';

describe('compareDecimal', () => {
  it('orders prices by value, not by text length', () => {
    expect(compareDecimal('9.5', '10.00')).toBeLessThan(0);
    expect(compareDecimal('15.49', '13.99')).toBeGreaterThan(0);
    expect(compareDecimal('15.49', '15.490')).toBe(0);
    expect(compareDecimal('0.99', '.99')).toBe(0);
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
    const series = buildPriceSeries(netflixDetail.history, '15.49', '2026-10-23');

    expect(series.rangeStart).toBe('2025-10-23');
    expect(series.startPrice).toBe('13.99');
    expect(series.steps).toEqual([{ date: '2026-10-01', price: '15.49' }]);
  });

  it('includes a change made today (the seed date)', () => {
    const series = buildPriceSeries(netflixDetail.history, '15.49', '2026-10-01');
    expect(series.steps).toEqual([{ date: '2026-10-01', price: '15.49' }]);
  });

  it('has no steps when the price never changed', () => {
    const series = buildPriceSeries(headspaceDetail.history, '12.99', '2026-10-23');
    expect(series.startPrice).toBe('12.99');
    expect(series.steps).toEqual([]);
  });

  it('starts at the new price when the change is older than 12 months', () => {
    const series = buildPriceSeries(netflixDetail.history, '15.49', '2027-11-01');
    expect(series.startPrice).toBe('15.49');
    expect(series.steps).toEqual([]);
  });

  it('ranks prices so the higher one is drawn higher', () => {
    const series = buildPriceSeries(netflixDetail.history, '15.49', '2026-10-23');
    const levels = priceLevels(series);
    expect(levels.get('13.99')).toBe(0);
    expect(levels.get('15.49')).toBe(1);
  });
});

describe('describePriceHistory', () => {
  it('us7_chart_text_summary_matches_the_spec', () => {
    expect(describePriceHistory(netflixDetail.history, 'USD', '15.49')).toBe(
      'Price history: $13.99 from March 2024, increased to $15.49 on October 1, 2026.',
    );
  });

  it('describes a price that never changed', () => {
    expect(describePriceHistory(headspaceDetail.history, 'USD', '12.99')).toBe(
      'Price history: $12.99 from October 2025.',
    );
  });
});
