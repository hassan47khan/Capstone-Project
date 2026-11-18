import {
  addMonths,
  beforeTracking,
  daysInMonth,
  lastDay,
  monthTitle,
  tense,
  weeksOf,
} from './month';

describe('calendar months (11 §1)', () => {
  it('steps across year boundaries both ways', () => {
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(addMonths('2026-10', -34)).toBe('2023-12');
    expect(addMonths('2026-10', 120)).toBe('2036-10');
  });

  it('knows month lengths, leap years included', () => {
    expect(daysInMonth('2028-02')).toBe(29);
    expect(daysInMonth('2026-02')).toBe(28);
    expect(lastDay('2026-09')).toBe('2026-09-30');
  });

  it('lays October 2026 out Sunday first, with blanks around it', () => {
    const weeks = weeksOf('2026-10');

    expect(weeks).toHaveLength(5);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    // Oct 1, 2026 is a Thursday.
    expect(weeks[0]).toEqual([
      null,
      null,
      null,
      null,
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
    ]);
    expect(weeks[4]?.slice(-1)).toEqual(['2026-10-31']); // a Saturday
    expect(weeks.flat().filter(Boolean)).toHaveLength(31);
  });

  it('names months and their tense', () => {
    expect(monthTitle('2026-10')).toBe('October 2026');
    expect(tense('2026-09', '2026-10-01')).toBe('past');
    expect(tense('2026-10', '2026-10-31')).toBe('current');
    expect(tense('2040-01', '2026-10-01')).toBe('future');
  });

  it('is before tracking only when the whole month is', () => {
    expect(beforeTracking('2023-09', '2023-10-01')).toBe(true);
    expect(beforeTracking('2023-10', '2023-10-15')).toBe(false);
    expect(beforeTracking('2020-01', null)).toBe(false);
  });
});
