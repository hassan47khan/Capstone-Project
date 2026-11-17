/**
 * GET /charges and POST /charges/{id}/confirm for the mock API (US-19).
 *
 * Shaped like backend/subscriptions/charges.py: the list holds unconfirmed
 * charges, newest first; confirming twice is a 409; an id that isn't the
 * caller's is a 404; an amount that isn't a price above zero is a 400 on
 * `amount`. The outcome compares the amount with the expected one.
 *
 * What it leaves out: the real server also moves the subscription's price and
 * queues the price-increase alert. The mock subscriptions don't change.
 */
import type { Charge, ChargeOutcome } from '@/features/charges/api';

import { MOCK_EMAILS } from './fixtures';

const usd = (amount: string) => ({ amount, currency: 'USD' });

const unconfirmed = (
  id: string,
  subscription_id: string,
  name: string,
  charged_on: string,
  price: string,
): Charge => ({
  id,
  subscription_id,
  name,
  charged_on,
  expected: usd(price),
  amount: usd(price),
  confirmed: false,
  outcome: null,
});

/** Alex's bills that went by before SEED_TODAY (2026-10-01), newest first. */
export const alexCharges: Charge[] = [
  unconfirmed('chg-spotify-0904', 'sub-spotify', 'Spotify', '2026-09-04', '10.99'),
  unconfirmed('chg-icloud-0901', 'sub-icloud-', 'iCloud+', '2026-09-01', '2.99'),
];

const STARTING: Record<string, Charge[]> = {
  [MOCK_EMAILS.full]: alexCharges,
};

let chargesByEmail: Record<string, Charge[]> = {};

export function resetCharges(): void {
  chargesByEmail = {};
}

function chargesOf(email: string): Charge[] {
  return chargesByEmail[email] ?? STARTING[email] ?? [];
}

export function unconfirmedChargesFor(email: string): { results: Charge[] } {
  return { results: chargesOf(email).filter((charge) => !charge.confirmed) };
}

const PRICE = /^\d{1,8}(\.\d{1,2})?$/;
export const CHARGE_PRICE_MESSAGE = 'Enter a valid price greater than $0.';

/**
 * Orders two non-negative decimal strings without converting them to numbers:
 * pad the fractions to the same length, then compare digit strings.
 */
function compareDecimal(a: string, b: string): number {
  const [aWhole = '', aFraction = ''] = a.split('.');
  const [bWhole = '', bFraction = ''] = b.split('.');
  const wholeA = aWhole.replace(/^0+(?=\d)/, '');
  const wholeB = bWhole.replace(/^0+(?=\d)/, '');
  if (wholeA.length !== wholeB.length) return wholeA.length < wholeB.length ? -1 : 1;
  const width = Math.max(aFraction.length, bFraction.length);
  const left = wholeA + aFraction.padEnd(width, '0');
  const right = wholeB + bFraction.padEnd(width, '0');
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function outcomeOf(amount: string, expected: string): ChargeOutcome {
  const order = compareDecimal(amount, expected);
  if (order > 0) return 'higher';
  if (order < 0) return 'lower';
  return 'same';
}

export type ConfirmResult =
  | { status: 200; charge: Charge }
  | { status: 400 | 404 | 409; code: string; message: string; field?: string };

export function confirmMockCharge(
  email: string,
  id: string,
  body: unknown,
): ConfirmResult {
  const list = chargesOf(email);
  const index = list.findIndex((charge) => charge.id === id);
  const found = list[index];
  if (!found) return { status: 404, code: 'not_found', message: 'Not found.' };
  if (found.confirmed) {
    return {
      status: 409,
      code: 'charge_already_confirmed',
      message: 'This charge is already confirmed.',
    };
  }

  const raw = (body ?? {}) as { amount?: unknown };
  let amount = found.expected.amount;
  if (raw.amount !== undefined) {
    const text = String(raw.amount);
    if (!PRICE.test(text) || !/[1-9]/.test(text)) {
      return {
        status: 400,
        code: 'validation_error',
        message: CHARGE_PRICE_MESSAGE,
        field: 'amount',
      };
    }
    amount = text;
  }

  const confirmed: Charge = {
    ...found,
    amount: { amount, currency: found.expected.currency },
    confirmed: true,
    outcome: outcomeOf(amount, found.expected.amount),
  };
  chargesByEmail[email] = list.map((charge, at) => (at === index ? confirmed : charge));
  return { status: 200, charge: confirmed };
}
