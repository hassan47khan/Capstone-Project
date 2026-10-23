/**
 * Tests for the Add / Edit form rules (07 §2, §3).
 */
import {
  EMPTY_FORM,
  FORM_COPY,
  formErrorsFromServer,
  isFormDirty,
  toSubscriptionInput,
  validateForm,
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
