/**
 * The "Subscription added" state (07 §3) for every billing cycle.
 */
import { screen } from '@testing-library/react-native';
import { AccessibilityInfo, Animated } from 'react-native';

import { MOCK_EMAILS } from '@/test/fixtures';
import { renderWithProviders } from '@/test/render';
import {
  createMockSubscription,
  resetCreatedSubscriptions,
} from '@/test/subscriptionFixtures';
import { capturedAddResponses } from '@/test/subscriptionSeed';

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

// Hassan's second review of #123, using the real backend's POST responses.
describe('second review fixes', () => {
  it.each([
    ['monthly', capturedAddResponses.arsMonthly],
    ['yearly', capturedAddResponses.arsYearly],
  ])(
    'no exchange rate (%s ARS): says it is left out of the total, not hidden (US-4)',
    async (_, created) => {
      await renderSuccess(created);
      expect(screen.getByTestId('add-success-no-rate')).toHaveTextContent(
        "Not in your monthly total yet: there's no exchange rate for ARS.",
      );
      expect(screen.queryByTestId('add-success-monthly')).toBeNull();
    },
  );

  it('a monthly plan in another currency shows what it adds in yours (€12.00 → ≈ $13.08/mo)', async () => {
    await renderSuccess(capturedAddResponses.eurMonthly);

    expect(screen.getByLabelText('Billing price, €12.00')).toBeOnTheScreen();
    expect(screen.getByTestId('add-success-monthly')).toHaveTextContent('≈ $13.08/mo');
    expect(screen.queryByTestId('add-success-no-rate')).toBeNull();
  });

  it('tells a screen reader that the save worked', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    await renderSuccess(saved('15.00', 'monthly'));

    expect(announce).toHaveBeenCalledWith(
      'Subscription added. Test plan has been added to your subscriptions.',
    );
    announce.mockRestore();
  });

  it('reduced motion keeps the cross-fade: from hidden to shown, at the reduced 150ms (02 §15)', async () => {
    // Record where the fade starts, so a "fade" from fully visible can't pass.
    const real = Animated.timing;
    const fades: { from: number; to: unknown; duration: unknown }[] = [];
    const timing = jest.spyOn(Animated, 'timing').mockImplementation((value, config) => {
      const from = (value as unknown as { __getValue: () => number }).__getValue();
      fades.push({ from, to: config.toValue, duration: config.duration });
      return real(value, config);
    });
    await renderSuccess(saved('15.00', 'monthly'));
    timing.mockRestore();

    expect(fades).toContainEqual({ from: 0, to: 1, duration: 150 });
  });
});
