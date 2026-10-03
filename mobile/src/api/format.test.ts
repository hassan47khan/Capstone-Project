/**
 * Money and date formatting tests.
 *
 * What these prove
 *   That amounts render exactly as the design shows them, that currencies with
 *   different minor units are handled from a table rather than assumed to be two
 *   decimals, and that no float ever touches an amount.
 *
 * Why the float test matters most
 *   Everything else here is cosmetic. The "no floats" guarantee is the one that
 *   stops a cent going missing from a total, so it is asserted directly with
 *   values chosen because they are exactly the ones IEEE-754 gets wrong.
 */
import {
  currencySymbol,
  daysUntil,
  formatCycle,
  formatDateEyebrow,
  formatDateLong,
  formatDateShort,
  formatMoney,
  formatRelativeDays,
  formatUnconverted,
  minorUnits,
} from './format';

describe('minor units', () => {
  it('defaults to two decimal places', () => {
    expect(minorUnits('USD')).toBe(2);
    expect(minorUnits('EUR')).toBe(2);
    expect(minorUnits('GBP')).toBe(2);
  });

  it('gives JPY zero decimal places', () => {
    // Specification section 9 names JPY explicitly: the splitter works in integer
    // minor units, and yen has none.
    expect(minorUnits('JPY')).toBe(0);
  });

  it('gives three-decimal currencies three places', () => {
    expect(minorUnits('KWD')).toBe(3);
    expect(minorUnits('BHD')).toBe(3);
  });

  it('is case-insensitive', () => {
    expect(minorUnits('jpy')).toBe(0);
  });

  it('falls back to two places for a currency it does not know', () => {
    expect(minorUnits('ZZZ')).toBe(2);
  });
});

describe('formatMoney — USD', () => {
  it('splits dollars from cents so the design can size them differently', () => {
    // The prototype renders $144.45 with "144" large and ".45" smaller in ink2.
    expect(formatMoney('144.45', 'USD')).toEqual({
      symbol: '$',
      whole: '144',
      fraction: '45',
      display: '$144.45',
    });
  });

  it('groups thousands', () => {
    expect(formatMoney('1733.40', 'USD').display).toBe('$1,733.40');
    expect(formatMoney('1234567.89', 'USD').display).toBe('$1,234,567.89');
  });

  it('pads a short fraction to two places', () => {
    expect(formatMoney('15.4', 'USD').display).toBe('$15.40');
    expect(formatMoney('15', 'USD').display).toBe('$15.00');
  });

  it('keeps a trailing zero that a number would discard', () => {
    // "1733.40" as a float becomes 1733.4 and renders as "$1,733.4".
    expect(formatMoney('1733.40', 'USD').fraction).toBe('40');
  });

  it('handles zero and negatives', () => {
    expect(formatMoney('0.00', 'USD').display).toBe('$0.00');
    expect(formatMoney('-12.50', 'USD').display).toBe('$-12.50');
  });
});

describe('formatMoney — JPY', () => {
  it('renders no decimal point at all', () => {
    expect(formatMoney('1200', 'JPY')).toEqual({
      symbol: '¥',
      whole: '1,200',
      fraction: '',
      display: '¥1,200',
    });
  });

  it('truncates a fraction the server should not have sent', () => {
    // Showing fewer digits is honest; rounding here would invent a value.
    expect(formatMoney('1200.99', 'JPY').display).toBe('¥1,200');
  });

  it('groups thousands the same way', () => {
    expect(formatMoney('1234567', 'JPY').display).toBe('¥1,234,567');
  });
});

describe('formatMoney — three-decimal currency', () => {
  it('renders all three places for KWD', () => {
    expect(formatMoney('12.5', 'KWD').display).toBe('KWD12.500');
  });
});

describe('no float arithmetic', () => {
  /**
   * These three values are the classic IEEE-754 failures. If any implementation
   * detail started routing amounts through Number(), at least one would come out
   * wrong — so this test is the real guard behind the "no money math" rule.
   */
  it.each([
    ['0.1', '0.10'],
    ['0.07', '0.07'],
    ['1.005', '1.00'],
    ['8.20', '8.20'],
    ['99999999999999999.99', '99,999,999,999,999,999.99'],
  ])('formats %s without precision loss', (input, expectedBody) => {
    expect(formatMoney(input, 'USD').display).toBe(`$${expectedBody}`);
  });

  it('survives an amount larger than Number.MAX_SAFE_INTEGER', () => {
    // 2^53 is where floats stop being able to count integers one at a time. A
    // string implementation does not care.
    const huge = '9007199254740993.01';
    expect(formatMoney(huge, 'USD').display).toBe('$9,007,199,254,740,993.01');
  });
});

describe('currency with no stored exchange rate', () => {
  /**
   * US-4: a subscription whose currency has no rate is shown unconverted with a
   * visible marker and never silently summed. The formatter's job is to render
   * it in its ORIGINAL currency and flag that it was not converted; excluding it
   * from the total is the server's job.
   */
  it('renders in the original currency and marks itself unconverted', () => {
    const result = formatUnconverted('499.00', 'ZZZ');

    expect(result.converted).toBe(false);
    // Not converted to the display currency, and not relabelled as dollars.
    expect(result.display).toBe('ZZZ499.00');
  });

  it('falls back to the code when there is no symbol for it', () => {
    expect(currencySymbol('ZZZ')).toBe('ZZZ');
  });

  it('still formats correctly with the default minor units', () => {
    expect(formatUnconverted('499', 'ZZZ').fraction).toBe('00');
  });
});

describe('formatCycle', () => {
  it('reads naturally for a count of one', () => {
    expect(formatCycle('month', 1)).toBe('per month');
    expect(formatCycle('year', 1)).toBe('per year');
  });

  it('spells out a custom cycle', () => {
    // Specification section 4 requires "every 6 weeks" to be expressible.
    expect(formatCycle('week', 6)).toBe('every 6 weeks');
    expect(formatCycle('day', 10)).toBe('every 10 days');
  });
});

describe('calendar dates', () => {
  it('formats the list-row style', () => {
    expect(formatDateShort('2026-10-03')).toBe('Oct 3');
  });

  it('formats the detail style', () => {
    expect(formatDateLong('2026-10-03')).toBe('Oct 3, 2026');
  });

  it('formats the Home eyebrow', () => {
    expect(formatDateEyebrow('2026-09-30')).toBe('Wednesday, September 30');
  });

  /**
   * The off-by-one guard. `new Date("2026-10-03")` is UTC midnight; rendered in
   * any zone behind UTC it becomes October 2. Users notice a wrong renewal date
   * immediately, so this is asserted rather than assumed.
   */
  it('does not shift the day in a timezone behind UTC', () => {
    const original = process.env.TZ;
    process.env.TZ = 'America/Los_Angeles';
    try {
      expect(formatDateShort('2026-10-03')).toBe('Oct 3');
      expect(formatDateLong('2026-01-01')).toBe('Jan 1, 2026');
    } finally {
      process.env.TZ = original;
    }
  });

  it('returns the input unchanged when it is not a calendar date', () => {
    expect(formatDateShort('not-a-date')).toBe('not-a-date');
  });
});

describe('relative days', () => {
  it('counts whole days between two dates', () => {
    expect(daysUntil('2026-10-03', '2026-09-30')).toBe(3);
  });

  it('counts across a month boundary', () => {
    expect(daysUntil('2026-11-01', '2026-10-30')).toBe(2);
  });

  it('counts across a daylight-saving change without drifting', () => {
    // US daylight saving ends 2026-11-01. A naive local-time subtraction gives
    // 30.04 days here and rounds inconsistently.
    expect(daysUntil('2026-11-15', '2026-10-15')).toBe(31);
  });

  it('phrases the near cases as words', () => {
    expect(formatRelativeDays('2026-09-30', '2026-09-30')).toBe('today');
    expect(formatRelativeDays('2026-10-01', '2026-09-30')).toBe('tomorrow');
    expect(formatRelativeDays('2026-10-03', '2026-09-30')).toBe('in 3 days');
  });

  it('marks a past date overdue rather than showing a negative count', () => {
    expect(formatRelativeDays('2026-09-29', '2026-09-30')).toBe('overdue');
  });
});
