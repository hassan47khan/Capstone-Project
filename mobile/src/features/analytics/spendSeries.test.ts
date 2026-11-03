/**
 * The spend chart's data (08 §2.1, §5, §7), with the real backend's series
 * (scratch database, 2026-10-30).
 */
import type { SpendOverTime } from '@/api/analyticsTypes';
import { alexSpendYear } from '@/test/contractFixtures';

import {
  areaPath,
  chartPoints,
  deltaPhrase,
  describeSpend,
  labelEvery,
  monthInitial,
  monthName,
  niceCeiling,
  pathLength,
} from './spendSeries';

const usd = (amount: string) => ({ amount, currency: 'USD' });

// Sam's real year: $11.99, then $22.98 from January, flat since.
const samReal: SpendOverTime = {
  display_currency: 'USD',
  months: [
    ...['2025-11', '2025-12'].map((month) => ({ month, amount: usd('11.99') })),
    ...[
      '2026-01',
      '2026-02',
      '2026-03',
      '2026-04',
      '2026-05',
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09',
      '2026-10',
    ].map((month) => ({ month, amount: usd('22.98') })),
  ],
  current: usd('22.98'),
  previous: usd('22.98'),
  delta_percent: '0.0',
  direction: 'flat',
  enough_history: true,
};

const PAD = { top: 16, bottom: 8, side: 8 };

describe('labels', () => {
  it('names months and their initials', () => {
    expect(monthName('2026-10')).toBe('October');
    expect(monthName('2025-11')).toBe('November');
    expect(monthInitial('2026-02')).toBe('F');
  });

  it('shows every 2nd month label only when a narrow chart has no room for all', () => {
    expect(labelEvery(320, 12, 20)).toBe(1); // a typical phone fits all 12
    expect(labelEvery(200, 12, 20)).toBe(2);
    expect(labelEvery(0, 12, 20)).toBe(1); // width not known yet
  });
});

describe('scale (08 §2.1)', () => {
  it('rounds the top of the axis up to a round figure', () => {
    expect(niceCeiling(129.2)).toBe(150); // Alex
    expect(niceCeiling(22.98)).toBe(25); // Sam
    expect(niceCeiling(6)).toBe(6); // Rosa: already round
    expect(niceCeiling(0)).toBe(1); // all zero: still a scale
  });

  it('starts at 0 and spans the width, oldest month on the left', () => {
    const { points, top } = chartPoints(alexSpendYear, 300, 120, PAD);

    expect(top).toBe(150);
    expect(points).toHaveLength(12);
    expect(points[0]).toMatchObject({ x: 8, month: '2025-11' });
    expect(points[11]).toMatchObject({ x: 292, month: '2026-10' });
    // $129.20 of $150: 86.1% of the way up the 96px plot.
    expect(points[11]!.y).toBeCloseTo(16 + (1 - 129.2 / 150) * 96, 5);
    // The flat months sit level.
    expect(points[4]!.y).toBe(points[5]!.y);
  });

  it('closes the fill down to the baseline, and the line has a length to draw', () => {
    const { points } = chartPoints(alexSpendYear, 300, 120, PAD);

    expect(areaPath(points, 112)).toMatch(/L292 112 L8 112 Z$/);
    expect(pathLength(points)).toBeGreaterThan(284);
    expect(areaPath([], 112)).toBe('');
  });
});

describe('words (08 §2.1, §5, §7)', () => {
  it("uses Home's wording for the change from last month", () => {
    expect(deltaPhrase(alexSpendYear)).toBe('up 1.2% from last month');
    expect(deltaPhrase(samReal)).toBe('No change from last month');
    expect(
      deltaPhrase({ ...alexSpendYear, delta_percent: '-0.8', direction: 'down' }),
    ).toBe('down 0.8% from last month');
    expect(
      deltaPhrase({ ...alexSpendYear, delta_percent: null, direction: null }),
    ).toBeNull();
  });

  it('describes the chart in one sentence (Alex, real data)', () => {
    expect(describeSpend(alexSpendYear)).toBe(
      'Spending over 12 months. Current month $129.20, up 1.2% from last month. Highest was $129.20 in October.',
    );
  });

  it('a flat year says so, and the highest is the first month it was reached (Sam, real data)', () => {
    expect(describeSpend(samReal)).toBe(
      'Spending over 12 months. Current month $22.98, no change from last month. Highest was $22.98 in January.',
    );
  });
});
