/**
 * The words after a confirmation follow the server's outcome (US-19), and the
 * mock decides that outcome the way backend/subscriptions/charges.py does.
 */
import { alexCharges, confirmMockCharge, resetCharges } from '@/test/chargeFixtures';
import { MOCK_EMAILS } from '@/test/fixtures';

import type { Charge } from './api';
import { confirmedMessage } from './chargeCopy';

const spotify = alexCharges[0]!;
const confirmed = (amount: string, outcome: Charge['outcome']): Charge => ({
  ...spotify,
  amount: { amount, currency: 'USD' },
  confirmed: true,
  outcome,
});

describe('confirmedMessage', () => {
  it.each([
    ['12.99', 'higher', 'Saved. Spotify charged $12.99, more than the $10.99 expected.'],
    ['9.99', 'lower', 'Saved. Spotify charged $9.99, less than the $10.99 expected.'],
    ['10.99', 'same', 'Saved. Spotify charged the expected $10.99.'],
    [
      '10.99',
      'needs_review',
      "Saved. Spotify changed currency since this bill, so its price wasn't changed.",
    ],
  ] as const)('%s, %s', (amount, outcome, words) => {
    expect(confirmedMessage(confirmed(amount, outcome))).toBe(words);
  });
});

describe('the mock confirm', () => {
  beforeEach(resetCharges);

  const outcomeOf = (amount: string) => {
    resetCharges();
    const result = confirmMockCharge(MOCK_EMAILS.full, spotify.id, { amount });
    return result.status === 200 ? result.charge.outcome : result.code;
  };

  it('compares decimal strings without turning them into numbers', () => {
    expect(outcomeOf('10.99')).toBe('same');
    expect(outcomeOf('10.990')).toBe('validation_error');
    expect(outcomeOf('11')).toBe('higher');
    expect(outcomeOf('9.99')).toBe('lower');
    expect(outcomeOf('100.00')).toBe('higher');
    expect(outcomeOf('010.99')).toBe('same');
    expect(outcomeOf('0')).toBe('validation_error');
  });

  it('is a 409 the second time and a 404 for an unknown id', () => {
    expect(confirmMockCharge(MOCK_EMAILS.full, spotify.id, {}).status).toBe(200);
    expect(confirmMockCharge(MOCK_EMAILS.full, spotify.id, {}).status).toBe(409);
    expect(confirmMockCharge(MOCK_EMAILS.full, 'chg-nope', {}).status).toBe(404);
    expect(confirmMockCharge(MOCK_EMAILS.empty, spotify.id, {}).status).toBe(404);
  });
});
