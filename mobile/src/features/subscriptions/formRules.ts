/**
 * The Add / Edit subscription form's data and rules (07 §2, §3).
 *
 * Plain functions, no React, so they are easy to test. The Edit screen will
 * reuse all of this.
 *
 * No money math: the price stays the decimal string the user typed (already
 * tidied by CurrencyField). The server checks it again and does every sum.
 */
import { minorUnits } from '@/api/format';
import { invalidPriceMessage, isValidPrice } from '@/components';
import type { Category } from '@/theme';

import type { BillingCycle, CustomCycleUnit, SubscriptionInput } from './api';

/** Everything the user can type or pick. */
export interface FormValues {
  name: string;
  price: string;
  currency: string;
  category: Category | null;
  cycle: BillingCycle;
  // Only used when cycle is "custom": "Every [count] [unit]".
  customCount: number;
  customUnit: CustomCycleUnit;
  startDate: string | null;
  notes: string;
  paymentLabel: string;
}

/** 07 §3: an empty form starts on Monthly; category and date are unset. */
export const EMPTY_FORM: FormValues = {
  name: '',
  price: '',
  currency: 'USD',
  category: null,
  cycle: 'monthly',
  customCount: 1,
  customUnit: 'months',
  startDate: null,
  notes: '',
  paymentLabel: '',
};

/** Character limits (07 §2, §8). */
export const LIMITS = { name: 60, notes: 280, paymentLabel: 30 } as const;

/** Exact messages from 07 §3. The price one comes from CurrencyField. */
export const FORM_COPY = {
  nameRequired: 'Enter a subscription name.',
  categoryRequired: 'Choose a category.',
  startRequired: 'Choose a start date.',
  startInFuture: "Start date can't be in the future.",
} as const;

/** The fields that can have an error. */
export type FormField =
  'name' | 'price' | 'category' | 'startDate' | 'notes' | 'paymentLabel';
export type FormErrors = Partial<Record<FormField, string>>;

/**
 * Checks the form. Returns one message per broken field; empty means valid.
 * `today` is "YYYY-MM-DD" (dates compare correctly as text in that format).
 */
export function validateForm(values: FormValues, today: string): FormErrors {
  const errors: FormErrors = {};
  if (!values.name.trim()) errors.name = FORM_COPY.nameRequired;
  if (!isValidPrice(values.price) || !fitsCurrency(values.price, values.currency)) {
    errors.price = invalidPriceMessage(values.currency);
  }
  if (!values.category) errors.category = FORM_COPY.categoryRequired;
  if (!values.startDate) errors.startDate = FORM_COPY.startRequired;
  else if (values.startDate > today) errors.startDate = FORM_COPY.startInFuture;
  return errors;
}

// No more decimals than the currency has: "12.99" is fine in USD, not in JPY.
export function fitsCurrency(price: string, currency: string): boolean {
  const fraction = price.split('.')[1] ?? '';
  return fraction.length <= minorUnits(currency);
}

// Short names for the hint under a disabled Save, in form order.
const HINT_NAMES: [FormField, string][] = [
  ['name', 'name'],
  ['price', 'price'],
  ['category', 'category'],
  ['startDate', 'start date'],
];

/**
 * Why Save is disabled, e.g. "To save, check: category and start date."
 * Null when nothing is wrong. (07 §3 keeps Save disabled until valid; this
 * says why, so a grey button isn't a dead end.)
 */
export function saveHint(errors: FormErrors): string | null {
  const names = HINT_NAMES.filter(([field]) => errors[field]).map(([, name]) => name);
  if (names.length === 0) return null;
  const list =
    names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return `To save, check: ${list}.`;
}

/** True when anything differs from where the form started. */
export function isFormDirty(values: FormValues, initial: FormValues): boolean {
  return (Object.keys(initial) as (keyof FormValues)[]).some(
    (key) => values[key] !== initial[key],
  );
}

/** Turns valid form values into the body the API expects. */
export function toSubscriptionInput(values: FormValues): SubscriptionInput {
  const custom = values.cycle === 'custom';
  return {
    name: values.name.trim(),
    billing_price: values.price,
    billing_currency: values.currency,
    billing_cycle: values.cycle,
    // Only a custom cycle carries a count and unit.
    custom_cycle_count: custom ? values.customCount : null,
    custom_cycle_unit: custom ? values.customUnit : null,
    start_date: values.startDate ?? '',
    category: values.category ?? '',
    notes: values.notes.trim(),
    payment_label: values.paymentLabel.trim(),
  };
}

/** Which form field each API field's error belongs to. */
const SERVER_FIELDS: Record<string, FormField> = {
  name: 'name',
  billing_price: 'price',
  category: 'category',
  start_date: 'startDate',
  notes: 'notes',
  payment_label: 'paymentLabel',
};

/** Maps a 400's `error.fields` onto the form's fields. Unknown keys are skipped. */
export function formErrorsFromServer(
  fields: Record<string, string[]> | undefined,
): FormErrors {
  const errors: FormErrors = {};
  for (const [key, messages] of Object.entries(fields ?? {})) {
    const field = SERVER_FIELDS[key];
    if (field && messages[0]) errors[field] = messages[0];
  }
  return errors;
}
