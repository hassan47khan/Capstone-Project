/**
 * Home's wording (06 §2). These choose words around server figures; none of
 * them computes a figure.
 */
import { alexSpend, alexUrgent, emptySpend } from '@/test/contractFixtures';

import {
  alertFor,
  deltaFor,
  greetingFor,
  initialsFor,
  signedMoney,
  unsigned,
} from './homeCopy';

describe('greetingFor (06 §2.1)', () => {
  it.each([
    [0, 'Good morning'],
    [11, 'Good morning'],
    [12, 'Good afternoon'],
    [17, 'Good afternoon'],
    [18, 'Good evening'],
    [23, 'Good evening'],
  ])('%i:00 is "%s"', (hour, greeting) => {
    expect(greetingFor(hour)).toBe(greeting);
  });
});

describe('deltaFor (06 §2.2)', () => {
  it('an increase reads "1.2% from last month", going up', () => {
    expect(deltaFor(alexSpend)).toEqual({
      percent: '1.2%',
      rest: 'from last month',
      direction: 'up',
    });
  });

  it('a decrease drops the sign; the arrow carries it', () => {
    expect(
      deltaFor({ ...alexSpend, delta_percent: '-1.4', direction: 'down' })?.percent,
    ).toBe('1.4%');
  });

  it('no change reads "No change from last month"', () => {
    expect(deltaFor({ ...alexSpend, delta_percent: '0.0', direction: 'flat' })).toEqual({
      percent: null,
      rest: 'No change from last month',
      direction: 'flat',
    });
  });

  it('is hidden with no previous month to compare', () => {
    expect(deltaFor({ ...emptySpend, direction: null })).toBeNull();
    expect(deltaFor({ ...alexSpend, delta_percent: null })).toBeNull();
  });
});

describe('alertFor (06 §2.4, §8)', () => {
  const [trial, netflix] = alexUrgent.items;

  it('words a price rise, and says it the long way for screen readers', () => {
    expect(alertFor(netflix!)).toEqual({
      title: 'Netflix price increase',
      message: '$13.99 → $15.49 · +$18.00/yr since Oct 1',
      label:
        'Netflix price increased from $13.99 to $15.49, $18.00 more per year, since Oct 1.',
    });
  });

  it('a future change is "on", a cut is a decrease', () => {
    const cut = alertFor({
      ...netflix!,
      is_upcoming: true,
      effective_on: '2026-11-01',
      new_price: { amount: '12.99', currency: 'USD' },
      annual_change: { amount: '-12.00', currency: 'USD' },
      direction: 'down',
    });
    expect(cut.title).toBe('Netflix price decrease');
    expect(cut.message).toBe('$13.99 → $12.99 · -$12.00/yr on Nov 1');
    expect(cut.label).toContain('$12.00 less per year');
  });

  it('words a trial ending today, tomorrow, or in n days', () => {
    expect(alertFor(trial!).title).toBe('Hulu trial ends in 2 days');
    expect(alertFor({ ...trial!, days_left: 1 }).title).toBe('Hulu trial ends tomorrow');
    expect(alertFor({ ...trial!, days_left: 0 }).title).toBe('Hulu trial ends today');
  });

  it('copes with a change that has no old price or annual figure', () => {
    const bare = alertFor({ ...netflix!, old_price: null, annual_change: null });
    expect(bare.message).toBe('$15.49 since Oct 1');
    expect(bare.label).toBe('Netflix price increased to $15.49, since Oct 1.');
  });
});

describe('small helpers', () => {
  it('initials from a name or an email', () => {
    expect(initialsFor('Alex Kim')).toBe('AK');
    expect(initialsFor('sam@subtrak.test')).toBe('S');
    expect(initialsFor('mary-jane watson')).toBe('MJ');
  });

  it('signs money without doing arithmetic on it', () => {
    expect(signedMoney('18.00', 'USD')).toBe('+$18.00');
    expect(signedMoney('-12.00', 'USD')).toBe('-$12.00');
    expect(unsigned('-1.4')).toBe('1.4');
    expect(unsigned('1.4')).toBe('1.4');
  });
});
