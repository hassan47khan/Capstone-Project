/**
 * The "Subscription added" state (07 §3) for every billing cycle.
 */
import { screen } from '@testing-library/react-native';

import { MOCK_EMAILS } from '@/test/fixtures';
import { renderWithProviders } from '@/test/render';
import {
  createMockSubscription,
  resetCreatedSubscriptions,
} from '@/test/subscriptionFixtures';

import { AddSuccess } from './AddSuccess';
import type { BillingCycle, CustomCycleUnit } from './api';

// What the mock server returns for a plan (its monthly figures come from KNOWN_MONTHLY).
function saved(
  price: string,
  cycle: BillingCycle,
  count: number | null = null,
  unit: CustomCycleUnit | null = null,
) {
  const { detail } = createMockSubscription(MOCK_EMAILS.full, {
    name: 'Test plan',
    billing_price: price,
    billing_currency: 'USD',
    billing_cycle: cycle,
    custom_cycle_count: count,
    custom_cycle_unit: unit,
    start_date: '2026-09-01',
    category: 'other',
    notes: '',
    payment_label: '',
  });
  return detail!;
}

async function renderSuccess(created: ReturnType<typeof saved>) {
  await renderWithProviders(
    <AddSuccess created={created} onViewDashboard={jest.fn()} onAddAnother={jest.fn()} />,
    { reduceMotion: true },
  );
}

beforeEach(() => resetCreatedSubscriptions());

it.each([
  ['weekly', saved('3.00', 'weekly'), 'Weekly', '≈ $13.00/mo'],
  ['quarterly', saved('30.00', 'quarterly'), 'Quarterly', '≈ $10.00/mo'],
  ['yearly', saved('119.88', 'yearly'), 'Yearly', '≈ $9.99/mo'],
  [
    'every 2 months',
    saved('12.99', 'custom', 2, 'months'),
    'Every 2 months',
    '≈ $6.50/mo',
  ],
  ['every 3 weeks', saved('6.00', 'custom', 3, 'weeks'), 'Every 3 weeks', '≈ $8.67/mo'],
  ['every 10 days', saved('5.00', 'custom', 10, 'days'), 'Every 10 days', '≈ $15.21/mo'],
])(
  'us7_success_shows_the_monthly_equivalent (%s)',
  async (_, created, cycle, monthly) => {
    await renderSuccess(created);

    expect(screen.getByLabelText(`Frequency, ${cycle}`)).toBeOnTheScreen();
    expect(screen.getByTestId('add-success-monthly')).toHaveTextContent(monthly);
  },
);

it('a monthly plan shows no "≈ /mo" line (it would repeat the price)', async () => {
  await renderSuccess(saved('15.00', 'monthly'));

  expect(screen.getByLabelText('Billing price, $15.00')).toBeOnTheScreen();
  expect(screen.queryByTestId('add-success-monthly')).toBeNull();
});

it('the check icon is hidden from screen readers on iOS and Android', async () => {
  await renderSuccess(saved('15.00', 'monthly'));

  const icon = screen.getByTestId('add-success-icon', { includeHiddenElements: true });
  expect(icon.props.accessibilityElementsHidden).toBe(true);
  expect(icon.props.importantForAccessibility).toBe('no-hide-descendants');
});
