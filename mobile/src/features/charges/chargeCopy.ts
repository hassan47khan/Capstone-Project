/**
 * The words for "Was the charge different?" (US-19), kept apart from the
 * screens so each sentence can be tested on its own.
 *
 * Amounts are formatted, never compared: the server decides whether a charge
 * was higher, lower or the same and says so in `outcome`.
 */
import { formatDateShort, formatDateSpoken, formatMoney } from '@/api/format';

import type { Charge } from './api';

export const CHARGE_COPY = {
  section: 'Was the charge different?',
  confirm: "That's right",
  different: 'It was different',
  screenTitle: 'Was the charge different?',
  amountLabel: 'Amount charged',
  amountHelper: 'Check your bank or card statement.',
  save: 'Save amount',
  saving: 'Saving amount',
  cancel: 'Cancel',
  loading: 'Loading charge',
  goneTitle: 'Nothing to confirm',
  goneBody: 'This charge has already been confirmed.',
  goBack: 'Go back',
  alreadyConfirmed: 'That charge was already confirmed.',
  notFound: 'That charge is no longer here.',
  offline: "You're offline, so this wasn't saved. Connect and try again.",
} as const;

const money = (value: Charge['amount']) =>
  formatMoney(value.amount, value.currency).display;

/** "Spotify, Sep 4": the card's title line. */
export function promptTitle(charge: Charge): string {
  return `${charge.name}, ${formatDateShort(charge.charged_on)}`;
}

/** "We expected $10.99." */
export function expectedLine(charge: Charge): string {
  return `We expected ${money(charge.expected)}.`;
}

/** The whole card as one sentence for a screen reader. */
export function promptLabel(charge: Charge): string {
  return (
    `${charge.name} billed on ${formatDateSpoken(charge.charged_on)}. ` +
    `We expected ${money(charge.expected)}. Was the charge different?`
  );
}

/** The toast after a confirmation, from the server's outcome. */
export function confirmedMessage(charge: Charge): string {
  const amount = money(charge.amount);
  const expected = money(charge.expected);
  switch (charge.outcome) {
    case 'higher':
      return `Saved. ${charge.name} charged ${amount}, more than the ${expected} expected.`;
    case 'lower':
      return `Saved. ${charge.name} charged ${amount}, less than the ${expected} expected.`;
    case 'same':
      return `Saved. ${charge.name} charged the expected ${amount}.`;
    case 'needs_review':
      return `Saved. ${charge.name} changed currency since this bill, so its price wasn't changed.`;
    default:
      return 'Saved.';
  }
}
