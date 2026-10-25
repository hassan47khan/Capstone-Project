/**
 * Subscription detail (07 §4, §9, §12) against the mock API, which serves the
 * canonical seed data (04 §4: Alex at 2026-10-01).
 */
import { readFileSync } from 'fs';
import { join } from 'path';

import { NavigationContainer, useRoute } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { fireEvent, screen, within } from '@testing-library/react-native';
import { http, HttpResponse } from 'msw';
import { Text } from 'react-native';

import { SessionProvider } from '@/session/SessionContext';
import { tokenStore } from '@/session/tokenStore';
import { lightColors } from '@/theme';
import { MOCK_EMAILS } from '@/test/fixtures';
import { createTestQueryClient, flattenStyle, renderWithProviders } from '@/test/render';
import { server } from '@/test/server';
import { netflixDetail } from '@/test/subscriptionFixtures';

import {
  BILLING_CYCLES,
  CUSTOM_CYCLE_UNITS,
  HISTORY_EVENT_TYPES,
  SUBSCRIPTION_STATUSES,
  TRIAL_DECISIONS,
} from './api';
import { PRICE_CHART_COPY } from './PriceHistoryChart';
import { DETAIL_COPY, SubscriptionDetailScreen } from './SubscriptionDetailScreen';

// A fixed "today", so the 12-month chart window never drifts as time passes.
jest.mock('./today', () => ({
  localToday: () => '2026-10-23',
  utcToday: () => '2026-10-23',
}));

// Loosely typed: the stub stands in for any route the screen opens.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Stack = createNativeStackNavigator<any>();

function Stub() {
  const route = useRoute();
  return (
    <Text testID="stub">
      {route.name} {JSON.stringify(route.params ?? {})}
    </Text>
  );
}

async function renderDetail(id: string) {
  await tokenStore.setRefreshToken(`mock-refresh-${MOCK_EMAILS.full}`);
  await renderWithProviders(
    <SessionProvider>
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen
            name="SubscriptionDetail"
            component={SubscriptionDetailScreen}
            initialParams={{ id }}
          />
          <Stack.Screen name="EditSubscription" component={Stub} />
        </Stack.Navigator>
      </NavigationContainer>
    </SessionProvider>,
    { queryClient: createTestQueryClient(), reduceMotion: true },
  );
}

/** The accessible label of one detail row, e.g. "Current price, $15.49". */
const row = (testID: string) => screen.getByTestId(testID).props.accessibilityLabel;

beforeEach(async () => {
  await tokenStore.clear();
});

describe('Netflix with the seed data', () => {
  it('us7_detail_rows_show_the_server_figures', async () => {
    await renderDetail('sub-netflix');

    expect(await screen.findByText('Netflix')).toBeOnTheScreen();
    expect(screen.getByText(DETAIL_COPY.title)).toBeOnTheScreen();
    expect(within(screen.getByTestId('detail-status')).getByText('Active')).toBeTruthy();

    expect(row('row-price')).toBe('Current price, $15.49');
    expect(row('row-cycle')).toBe('Billing cycle, Monthly');
    expect(row('row-category')).toBe('Category, Entertainment');
    expect(row('row-next')).toBe('Next renewal, Oct 12, 2026');
    expect(row('row-paid-with')).toBe('Paid with, Visa ••4242');
    expect(row('row-added')).toBe('Date added, Mar 12, 2024');
    expect(row('row-total')).toBe('Total spent, $433.69');
    // Monthly plan: the monthly equivalent would just repeat the price.
    expect(screen.queryByTestId('row-monthly')).toBeNull();
  });

  it('us7_total_spent_is_not_red', async () => {
    await renderDetail('sub-netflix');

    const total = within(await screen.findByTestId('row-total')).getByText('$433.69');
    const color = flattenStyle(total.props.style).color;
    expect(color).toBe(lightColors.text);
    expect(color).not.toBe(lightColors.danger);
  });

  it('us7_price_history_is_described_in_text', async () => {
    await renderDetail('sub-netflix');

    expect(await screen.findByTestId('price-chart-summary')).toHaveTextContent(
      'Price history for the last 12 months: $13.99, increased to $15.49 on October 1, 2026.',
    );
  });

  it('Edit opens the edit form for this subscription', async () => {
    await renderDetail('sub-netflix');

    await fireEvent.press(await screen.findByTestId('detail-edit'));
    expect(await screen.findByTestId('stub')).toHaveTextContent(
      'EditSubscription {"id":"sub-netflix"}',
    );
  });
});

describe('Headspace (every 2 months, no price changes)', () => {
  it('us7_shows_monthly_equivalent_when_not_monthly', async () => {
    await renderDetail('sub-headspace');

    await screen.findByText('Headspace');
    expect(row('row-cycle')).toBe('Billing cycle, Every 2 months');
    expect(row('row-monthly')).toBe('Monthly equivalent, $6.50 per month');
    expect(screen.getByText('$6.50/mo')).toBeOnTheScreen();
  });

  it('hides Paid with when there is no payment label', async () => {
    await renderDetail('sub-headspace');

    await screen.findByText('Headspace');
    expect(screen.queryByTestId('row-paid-with')).toBeNull();
  });

  it('us7_no_price_changes_shows_a_message', async () => {
    await renderDetail('sub-headspace');

    expect(await screen.findByText(PRICE_CHART_COPY.empty)).toBeOnTheScreen();
  });
});

describe('states (07 §9)', () => {
  it('shows skeletons while loading', async () => {
    await renderDetail('sub-netflix');

    expect(
      screen.getByTestId('detail-loading', { includeHiddenElements: true }),
    ).toBeTruthy();
    await screen.findByText('Netflix');
  });

  it('a missing subscription says Not found, never mentions permission', async () => {
    await renderDetail('sub-does-not-exist');

    expect(await screen.findByText('Not found')).toBeOnTheScreen();
    expect(screen.getByText('Go back')).toBeOnTheScreen();
    expect(screen.queryByText(/permission/i)).toBeNull();
  });

  it('a failed load shows a full-screen error, and Try again reloads', async () => {
    server.use(
      http.get(
        '*/subscriptions/sub-netflix',
        () =>
          HttpResponse.json(
            { error: { code: 'server_error', message: 'Down.' } },
            { status: 500 },
          ),
        { once: true },
      ),
    );
    await renderDetail('sub-netflix');

    expect(await screen.findByText('Something went wrong')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Try again'));
    expect(await screen.findByText('Netflix')).toBeOnTheScreen();
  });
});

/**
 * Guards against drift from backend/schema.yml: the field names AND the
 * allowed values. If the backend changes either, these fail.
 */
describe('our types match the frozen contract', () => {
  // Windows checkouts may use \r\n line endings; normalise to \n first.
  const schema = readFileSync(
    join(__dirname, '../../../../backend/schema.yml'),
    'utf8',
  ).replace(/\r\n/g, '\n');

  // One schema under components.schemas, up to the next one.
  const schemaBlock = (name: string) => {
    const after = schema.split(`\n    ${name}:\n`)[1];
    if (!after) throw new Error(`${name} not found in schema.yml`);
    return after.split(/\n    \w+:\n/)[0]!;
  };

  // The "- value" lines of a list in a block (6-space indent).
  const listItems = (text: string) =>
    text
      .split('\n')
      .filter((line) => line.startsWith('      - '))
      .map((line) => line.replace('      - ', '').trim());

  it('netflixDetail has every required SubscriptionDetail field', () => {
    const required = listItems(
      schemaBlock('SubscriptionDetail').split('      required:\n')[1]!,
    );

    expect(required.length).toBeGreaterThan(20);
    expect(Object.keys(netflixDetail).sort()).toEqual(expect.arrayContaining(required));
  });

  it.each([
    ['BillingCycleEnum', BILLING_CYCLES],
    ['CustomCycleUnitEnum', CUSTOM_CYCLE_UNITS],
    ['SubscriptionStatusEnum', SUBSCRIPTION_STATUSES],
    ['TrialDecisionEnum', TRIAL_DECISIONS],
    ['EventTypeEnum', HISTORY_EVENT_TYPES],
  ])('%s has exactly our values', (name, ours) => {
    const enumText = schemaBlock(name)
      .split('      enum:\n')[1]!
      .split('      type:')[0]!;
    expect(listItems(enumText)).toEqual([...ours]);
  });
});
