/**
 * Tests for the Add / Edit form rules (07 §2, §3).
 */
import { headspaceDetail, netflixDetail } from '@/test/subscriptionFixtures';

import {
  changedInput,
  EMPTY_FORM,
  FORM_COPY,
  describeCycle,
  fitsCurrency,
  formErrorsFromServer,
  formFromDetail,
  isFormDirty,
  saveHint,
  toSubscriptionInput,
  validateForm,
  visibleErrors,
  type FormValues,
} from './formRules';

const TODAY = '2026-10-23';

// A complete, valid form: Headspace, $12.99 every 2 months.
const headspace: FormValues = {
  ...EMPTY_FORM,
  name: '  Headspace ',
  price: '12.99',
  category: 'health-wellness',
  cycle: 'custom',
  customCount: 2,
  customUnit: 'months',
  startDate: '2025-10-15',
};

describe('validateForm', () => {
  it('an empty form needs name, price, category and start date', () => {
    expect(validateForm(EMPTY_FORM, TODAY)).toEqual({
      name: FORM_COPY.nameRequired,
      price: 'Enter a valid price greater than $0.',
      category: FORM_COPY.categoryRequired,
      startDate: FORM_COPY.startRequired,
    });
  });

  it('a complete form is valid', () => {
    expect(validateForm(headspace, TODAY)).toEqual({});
  });

  it.each(['0', '0.00', '', '.'])('us7_price_zero_rejected (%p)', (price) => {
    expect(validateForm({ ...headspace, price }, TODAY).price).toBe(
      'Enter a valid price greater than $0.',
    );
  });

  it('us7_price_message_uses_the_billing_currency_symbol', () => {
    expect(validateForm({ ...headspace, price: '0', currency: 'EUR' }, TODAY).price).toBe(
      'Enter a valid price greater than €0.',
    );
  });

  it('a name of only spaces is missing', () => {
    expect(validateForm({ ...headspace, name: '   ' }, TODAY).name).toBe(
      FORM_COPY.nameRequired,
    );
  });

  it('a start date after today is rejected; today itself is fine', () => {
    expect(validateForm({ ...headspace, startDate: '2026-10-24' }, TODAY).startDate).toBe(
      FORM_COPY.startInFuture,
    );
    expect(validateForm({ ...headspace, startDate: TODAY }, TODAY)).toEqual({});
  });
});

describe('isFormDirty', () => {
  it('is false for an untouched form and true once anything changes', () => {
    expect(isFormDirty(EMPTY_FORM, EMPTY_FORM)).toBe(false);
    expect(isFormDirty({ ...EMPTY_FORM, notes: 'x' }, EMPTY_FORM)).toBe(true);
    expect(isFormDirty({ ...EMPTY_FORM, cycle: 'yearly' }, EMPTY_FORM)).toBe(true);
  });
});

describe('toSubscriptionInput', () => {
  it('us7_custom_cycle_sends_count_and_unit', () => {
    expect(toSubscriptionInput(headspace)).toEqual({
      name: 'Headspace',
      billing_price: '12.99',
      billing_currency: 'USD',
      billing_cycle: 'custom',
      custom_cycle_count: 2,
      custom_cycle_unit: 'months',
      start_date: '2025-10-15',
      category: 'health-wellness',
      notes: '',
      payment_label: '',
    });
  });

  it('a non-custom cycle sends no count or unit', () => {
    const input = toSubscriptionInput({ ...headspace, cycle: 'monthly' });
    expect(input.custom_cycle_count).toBeNull();
    expect(input.custom_cycle_unit).toBeNull();
  });
});

describe('formErrorsFromServer', () => {
  it("puts the server's messages on the matching form fields", () => {
    expect(
      formErrorsFromServer({
        billing_price: ['Enter a valid price greater than $0.'],
        start_date: ['Bad date.'],
        something_else: ['Ignored.'],
      }),
    ).toEqual({ price: 'Enter a valid price greater than $0.', startDate: 'Bad date.' });
  });
});

describe('fitsCurrency', () => {
  it('allows only as many decimals as the currency has', () => {
    expect(fitsCurrency('12.99', 'USD')).toBe(true);
    expect(fitsCurrency('12', 'JPY')).toBe(true);
    expect(fitsCurrency('12.99', 'JPY')).toBe(false);
    expect(fitsCurrency('1.234', 'KWD')).toBe(true); // 3-decimal currency
  });

  it('a JPY price with cents is invalid', () => {
    expect(
      validateForm({ ...headspace, price: '12.99', currency: 'JPY' }, TODAY).price,
    ).toBe('Enter a valid price greater than ¥0.');
  });
});

describe('saveHint', () => {
  it('lists what to check, in form order', () => {
    expect(saveHint(validateForm(EMPTY_FORM, TODAY))).toBe(
      'To save, check: name, price, category and start date.',
    );
    expect(saveHint({ startDate: 'x' })).toBe('To save, check: start date.');
    expect(saveHint({ price: 'x', category: 'y' })).toBe(
      'To save, check: price and category.',
    );
  });

  it('is null when the form is valid', () => {
    expect(saveHint(validateForm(headspace, TODAY))).toBeNull();
  });
});

describe('describeCycle', () => {
  const cycle = (
    billing_cycle: FormValues['cycle'],
    custom_cycle_count: number | null = null,
    custom_cycle_unit: FormValues['customUnit'] | null = null,
  ) => describeCycle({ billing_cycle, custom_cycle_count, custom_cycle_unit });

  it('names each billing cycle in words', () => {
    expect(cycle('weekly')).toBe('Weekly');
    expect(cycle('monthly')).toBe('Monthly');
    expect(cycle('quarterly')).toBe('Quarterly');
    expect(cycle('yearly')).toBe('Yearly');
    expect(cycle('custom', 2, 'months')).toBe('Every 2 months');
    expect(cycle('custom', 1, 'weeks')).toBe('Every week');
  });
});

describe('formFromDetail', () => {
  it('prefills the edit form from a saved subscription', () => {
    expect(formFromDetail(netflixDetail)).toEqual({
      name: 'Netflix',
      price: '15.49',
      currency: 'USD',
      category: 'entertainment',
      cycle: 'monthly',
      customCount: 1,
      customUnit: 'months',
      startDate: '2024-03-12',
      notes: '',
      paymentLabel: 'Visa ••4242',
    });
  });
});

describe('visibleErrors', () => {
  const errors = { name: 'Name missing.', price: 'Price bad.' };

  it('shows only errors for fields the user has left', () => {
    expect(visibleErrors(errors, {}, new Set(['name']), false)).toEqual({
      name: 'Name missing.',
    });
  });

  it('shows every error after a failed save, with server messages winning', () => {
    expect(visibleErrors(errors, { price: 'Server says no.' }, new Set(), true)).toEqual({
      name: 'Name missing.',
      price: 'Server says no.',
    });
  });
});

describe('changedInput (what Edit sends)', () => {
  const start = formFromDetail(netflixDetail);

  it('is empty when nothing changed', () => {
    expect(changedInput(start, start)).toEqual({});
  });

  it('holds just the changed field', () => {
    expect(changedInput({ ...start, notes: 'Family plan' }, start)).toEqual({
      notes: 'Family plan',
    });
  });

  it('compares prices by value: "15.490" is not a change from 15.49', () => {
    expect(changedInput({ ...start, price: '15.490' }, start)).toEqual({});
    expect(changedInput({ ...start, price: '16.99' }, start)).toEqual({
      billing_price: '16.99',
    });
  });

  it('ignores the hidden custom count and unit on a non-custom cycle', () => {
    expect(
      changedInput({ ...start, customCount: 5, customUnit: 'weeks' }, start),
    ).toEqual({});
  });

  it('sends all three cycle fields when only the count changes', () => {
    // Headspace is already every 2 months; only the count moves to 3.
    const headspace = formFromDetail(headspaceDetail);
    expect(changedInput({ ...headspace, customCount: 3 }, headspace)).toEqual({
      billing_cycle: 'custom',
      custom_cycle_count: 3,
      custom_cycle_unit: 'months',
    });
  });

  it('sends the three cycle fields together', () => {
    expect(
      changedInput(
        { ...start, cycle: 'custom', customCount: 2, customUnit: 'months' },
        start,
      ),
    ).toEqual({
      billing_cycle: 'custom',
      custom_cycle_count: 2,
      custom_cycle_unit: 'months',
    });
  });
});
