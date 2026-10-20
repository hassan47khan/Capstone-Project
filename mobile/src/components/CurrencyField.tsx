/**
 * CurrencyField — a price input (handoff 02 §3).
 *
 * What it is for
 *   The price on Add and Edit subscription.
 *
 * The symbol follows the currency
 *   It comes from the subscription's billing currency via `currencySymbol`,
 *   never a hardcoded "$": the app is multi-currency, and the prototype
 *   hardcoded the symbol on every Add Subscription frame.
 *
 * Why it emits a decimal STRING, not minor units
 *   02 says "store minor units". The repo's first rule is that the client does
 *   no money math — amounts travel as decimal strings and the server owns the
 *   arithmetic (04: Decimal end to end). So this field only normalizes text:
 *   it accepts either "," or "." as the separator, drops anything that is not a
 *   digit, and caps the fraction at the currency's minor units (JPY: none).
 *   There is no `Number()` and no arithmetic anywhere in it.
 *
 * Design tokens
 *   symbol  typography.bodyLg, colors.textMuted, spacing.sm from the value
 *   value   typography.bodyLg, colors.text, right-aligned, decimal keypad
 */
import { currencySymbol, minorUnits } from '@/api/format';
import type { CurrencyCode } from '@/api/types';

import { TextField } from './TextField';

/**
 * Normalizes typed text into a decimal string for `currency`:
 * "15,49" → "15.49", "1.234" (JPY) → "1234", "12.345" (USD) → "12.34".
 */
export function normalizePriceInput(text: string, currency: CurrencyCode): string {
  const places = minorUnits(currency);
  // Treat the first separator typed as the decimal point; later ones are noise.
  const unified = text.replace(/,/g, '.');
  const firstDot = unified.indexOf('.');
  const whole = (firstDot === -1 ? unified : unified.slice(0, firstDot)).replace(
    /\D/g,
    '',
  );
  if (firstDot === -1 || places === 0) return whole;
  const fraction = unified
    .slice(firstDot + 1)
    .replace(/\D/g, '')
    .slice(0, places);
  return `${whole}.${fraction}`;
}

/**
 * True when `value` is a well-formed price above zero. String checks only:
 * at least one digit, an optional fraction, and some non-zero digit.
 */
export function isValidPrice(value: string): boolean {
  return /^\d+(\.\d+)?$/.test(value) && /[1-9]/.test(value);
}

/** The exact validation message from 02 §3, with the currency's own symbol. */
export function invalidPriceMessage(currency: CurrencyCode): string {
  return `Enter a valid price greater than ${currencySymbol(currency)}0.`;
}

export interface CurrencyFieldProps {
  label?: string;
  /** Decimal string, e.g. "15.49". */
  value: string;
  onChangeValue: (next: string) => void;
  currency: CurrencyCode;
  helper?: string;
  error?: string;
  editable?: boolean;
  onBlur?: () => void;
  testID?: string;
}

export function CurrencyField({
  label = 'Price',
  value,
  onChangeValue,
  currency,
  helper,
  error,
  editable,
  onBlur,
  testID,
}: CurrencyFieldProps) {
  return (
    <TextField
      label={label}
      value={value}
      onChangeText={(text) => onChangeValue(normalizePriceInput(text, currency))}
      prefix={currencySymbol(currency)}
      keyboardType={minorUnits(currency) === 0 ? 'number-pad' : 'decimal-pad'}
      textAlign="right"
      helper={helper}
      error={error}
      editable={editable}
      onBlur={onBlur}
      testID={testID}
    />
  );
}
