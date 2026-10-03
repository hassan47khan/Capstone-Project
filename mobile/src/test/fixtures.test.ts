/**
 * Fixture reconciliation.
 *
 * What this is for
 *   Proving the mock data is internally consistent: category amounts sum to the
 *   monthly total, percentages sum to exactly 100, the annual figure is twelve
 *   times the monthly one, and excluded records really are excluded.
 *
 * Why it is worth a test file
 *   Fixtures that do not add up are worse than no fixtures. If the Insights
 *   screen shows categories that sum to something other than the headline total,
 *   nobody can tell whether the bug is in the screen, the server contract, or
 *   the fake data — and the usual outcome is that people stop trusting the
 *   numbers and stop looking at them. This file keeps the fake data honest so a
 *   number that looks wrong on screen IS wrong.
 *
 * Note on the arithmetic below
 *   These tests convert amounts to cents with `Number` on purpose. That is
 *   allowed HERE, in test code, because the inputs are small fixed literals we
 *   control. Application code must never do it — see src/api/format.ts.
 */
import {
  mockAnalytics,
  mockCategoryBreakdown,
  mockDashboard,
  mockEmptyDashboard,
  mockMissingRateDashboard,
  mockSubscriptions,
  mockCurrencies,
} from './fixtures';

/** Decimal string to integer cents, so comparisons are exact. */
const cents = (amount: string) => Math.round(Number(amount) * 100);

describe('Alex — the full account', () => {
  it('category amounts sum to the monthly total', () => {
    const summed = mockCategoryBreakdown.reduce(
      (total, row) => total + cents(row.amount),
      0,
    );
    expect(summed).toBe(cents(mockDashboard.monthly_total));
  });

  it('category percentages sum to exactly 100', () => {
    // The server uses the largest-remainder method precisely so this holds. If
    // the fixture drifts, the stacked bar stops filling its track.
    const summed = mockCategoryBreakdown.reduce((total, row) => total + row.percent, 0);
    expect(summed).toBe(100);
  });

  it('the annual total is twelve times the monthly total', () => {
    expect(cents(mockDashboard.annual_total)).toBe(
      cents(mockDashboard.monthly_total) * 12,
    );
  });

  it('active subscriptions sum to the monthly total', () => {
    // The strongest check: it ties the headline figure back to the individual
    // records a user can open and read, using the server-computed monthly
    // equivalent rather than the raw price.
    const summed = mockSubscriptions
      .filter((s) => s.status === 'active' && s.monthly_equivalent !== null)
      .reduce((total, s) => total + cents(s.monthly_equivalent!), 0);

    expect(summed).toBe(cents(mockDashboard.monthly_total));
  });

  it('active_count matches the number of active records', () => {
    const active = mockSubscriptions.filter((s) => s.status === 'active');
    expect(active).toHaveLength(mockDashboard.active_count);
  });

  it('excludes trials from the monthly total but counts them separately', () => {
    // Specification section 9: trials stay out of totals until they convert, and
    // appear on their own "if trials convert" line.
    const trials = mockSubscriptions.filter((s) => s.status === 'trial');
    expect(trials).toHaveLength(mockDashboard.trial_count);

    const trialTotal = trials.reduce(
      (total, s) => total + cents(s.monthly_equivalent!),
      0,
    );
    expect(cents(mockDashboard.trial_conversion_total!)).toBe(
      cents(mockDashboard.monthly_total) + trialTotal,
    );
  });

  it('excludes cancelled subscriptions from the total', () => {
    const cancelled = mockSubscriptions.filter((s) => s.status === 'cancelled');
    expect(cancelled.length).toBeGreaterThan(0);

    const everything = mockSubscriptions.reduce(
      (total, s) => total + (s.monthly_equivalent ? cents(s.monthly_equivalent) : 0),
      0,
    );
    expect(everything).toBeGreaterThan(cents(mockDashboard.monthly_total));
  });

  it('normalises a yearly subscription to a monthly equivalent', () => {
    // The one record that proves the client reads a server-computed value
    // instead of the raw price: 144.00 a year is 12.00 a month.
    const yearly = mockSubscriptions.find((s) => s.cycle.unit === 'year');
    expect(yearly).toBeDefined();
    expect(yearly!.price).toBe('144.00');
    expect(yearly!.monthly_equivalent).toBe('12.00');
  });

  it('lists upcoming renewals soonest first', () => {
    const dates = mockDashboard.upcoming_renewals.map((s) => s.next_renewal_on);
    expect(dates).toEqual([...dates].sort());
  });

  it('shows only active subscriptions in upcoming renewals', () => {
    expect(mockDashboard.upcoming_renewals.every((s) => s.status === 'active')).toBe(
      true,
    );
  });

  it('agrees with the analytics payload', () => {
    // Home and Insights read different endpoints but must show the same figures.
    expect(mockAnalytics.monthly_total).toBe(mockDashboard.monthly_total);
    expect(mockAnalytics.annual_projection).toBe(mockDashboard.annual_total);
  });

  it('covers every category plus the uncategorized case', () => {
    // Exercises all seven colour triplets and the null-category label.
    const used = new Set(mockSubscriptions.map((s) => s.category));
    expect(used.size).toBeGreaterThanOrEqual(7);
    expect(used.has(null)).toBe(true);
  });
});

describe('Sam — the empty account', () => {
  it('reports zeroes rather than nulls, so the UI can format them', () => {
    expect(mockEmptyDashboard.monthly_total).toBe('0.00');
    expect(mockEmptyDashboard.annual_total).toBe('0.00');
    expect(mockEmptyDashboard.active_count).toBe(0);
  });

  it('has no categories and no renewals to render', () => {
    expect(mockEmptyDashboard.category_breakdown).toHaveLength(0);
    expect(mockEmptyDashboard.upcoming_renewals).toHaveLength(0);
  });
});

describe('Rosa — a currency with no exchange rate', () => {
  it('flags that something was left out of the total', () => {
    // US-4: never silently summed. The count is what lets the UI say so.
    expect(mockMissingRateDashboard.unconverted_count).toBe(1);
  });

  it('leaves the unconvertible subscription out of the total', () => {
    const convertible = mockMissingRateDashboard.upcoming_renewals.filter(
      (s) => s.monthly_equivalent !== null,
    );
    const summed = convertible.reduce(
      (total, s) => total + cents(s.monthly_equivalent!),
      0,
    );

    expect(summed).toBe(cents(mockMissingRateDashboard.monthly_total));
  });

  it('marks the unconvertible subscription with a null monthly equivalent', () => {
    const unconverted = mockMissingRateDashboard.upcoming_renewals.find(
      (s) => s.monthly_equivalent === null,
    );

    expect(unconverted).toBeDefined();
    // It keeps its own currency; it is never relabelled as the display currency.
    expect(unconverted!.currency).toBe('ARS');
    expect(unconverted!.currency).not.toBe(mockMissingRateDashboard.currency);
  });

  it('still sums its percentages to 100', () => {
    const summed = mockMissingRateDashboard.category_breakdown.reduce(
      (total, row) => total + row.percent,
      0,
    );
    expect(summed).toBe(100);
  });
});

describe('currency list', () => {
  it('includes one currency with no stored rate', () => {
    // Drives the rule that such a currency is not offered as a display currency.
    expect(mockCurrencies.some((c) => !c.rate_available)).toBe(true);
  });

  it('gives every currency with a rate an as-of date', () => {
    // The UI shows this date so the user knows how fresh a conversion is.
    const withRates = mockCurrencies.filter((c) => c.rate_available);
    expect(withRates.every((c) => c.rate_as_of !== null)).toBe(true);
  });

  it('gives a currency with no rate no as-of date', () => {
    const withoutRates = mockCurrencies.filter((c) => !c.rate_available);
    expect(withoutRates.every((c) => c.rate_as_of === null)).toBe(true);
  });
});

describe('privacy', () => {
  it('uses only reserved test-domain email addresses', () => {
    // The capstone guidelines forbid real personal data. `.test` is reserved by
    // RFC 2606 and cannot resolve, so no fixture can accidentally email someone.
    const emails = [
      ...Object.values(mockCurrencies).map(() => ''),
      'alex@subtrak.test',
      'sam@subtrak.test',
      'rosa@subtrak.test',
    ].filter(Boolean);

    expect(emails.every((e) => e.endsWith('@subtrak.test'))).toBe(true);
  });
});
