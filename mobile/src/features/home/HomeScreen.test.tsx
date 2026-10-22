/**
 * Home (06; US-6, US-8) against the contract's /analytics mock routes, which
 * carry the canonical seed figures (04 §4).
 */
import { NavigationContainer, useRoute } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { http, HttpResponse } from 'msw';
import { Text } from 'react-native';

import { SessionProvider } from '@/session/SessionContext';
import { tokenStore } from '@/session/tokenStore';
import { alexSummary } from '@/test/contractFixtures';
import { MOCK_EMAILS } from '@/test/fixtures';
import { createTestQueryClient, renderWithProviders } from '@/test/render';
import { server } from '@/test/server';

import { HOME_COPY, HomeScreen } from './HomeScreen';

// Loosely typed: the stubs stand in for routes in several navigators.
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

async function renderHome({
  email = MOCK_EMAILS.full as string,
  reduceMotion = false,
}: { email?: string; reduceMotion?: boolean } = {}) {
  await tokenStore.setRefreshToken(`mock-refresh-${email}`);
  await renderWithProviders(
    <SessionProvider>
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Home" component={HomeScreen} />
          <Stack.Screen name="MainTabs" component={Stub} />
          <Stack.Screen name="SubscriptionDetail" component={Stub} />
          <Stack.Screen name="ProfileAccount" component={Stub} />
          <Stack.Screen name="AddSubscription" component={Stub} />
        </Stack.Navigator>
      </NavigationContainer>
    </SessionProvider>,
    { queryClient: createTestQueryClient(), reduceMotion },
  );
}

const failWith = (path: string, status = 500) =>
  http.get(`*${path}`, () =>
    HttpResponse.json({ error: { code: 'server_error', message: 'Down.' } }, { status }),
  );

beforeEach(async () => {
  await tokenStore.clear();
});

describe('loaded with the seed data (06 §9)', () => {
  it('greets the user by name, with the avatar to Profile and no add button or brand', async () => {
    await renderHome();

    expect(await screen.findByText('Alex Kim')).toBeOnTheScreen();
    expect(screen.getByText(/^Good (morning|afternoon|evening),$/)).toBeOnTheScreen();
    expect(screen.queryByText('SubTrak')).toBeNull();
    expect(screen.queryByRole('button', { name: /add/i })).toBeNull();

    await fireEvent.press(screen.getByTestId('home-avatar'));
    expect(await screen.findByTestId('stub')).toHaveTextContent(/^ProfileAccount/);
  });

  it('us6_spend_card_reads_129_20_from_the_api_as_one_unit', async () => {
    await renderHome();

    const card = await screen.findByTestId('spend-card');
    expect(card.props.accessibilityLabel).toBe(
      'Monthly recurring spend, $129.20, up 1.2% from last month, 8 active subscriptions',
    );
    expect(within(card).getByText('8 active')).toBeOnTheScreen();
    expect(within(card).getByText('/mo')).toBeOnTheScreen();
    // USD needs no currency chip or conversion note.
    expect(within(card).queryByText(/Converted/)).toBeNull();
  });

  it('us8_legend_percentages_are_the_servers_and_sum_to_100', async () => {
    await renderHome();
    await screen.findByTestId('category-card');

    const rows = alexSummary.categories.map((row) =>
      screen.getByTestId(`legend-${row.category!.slug}`),
    );
    expect(rows.map((r) => r.props.accessibilityLabel)).toEqual([
      'Productivity, 43 percent.',
      'Entertainment, 31 percent.',
      'AI Tools, 16 percent.',
      'Health & Wellness, 5 percent.',
      'News & Media, 3 percent.',
      'Cloud Storage, 2 percent.',
    ]);
    // The donut is decorative; the legend is the accessible version.
    expect(
      screen.getByTestId('category-donut', { includeHiddenElements: true }),
    ).toBeTruthy();
  });

  it('urgent attention shows the trial ending and the Netflix rise, trial first', async () => {
    await renderHome();

    const trial = await screen.findByTestId('urgent-trial_ending-sub-hulu');
    expect(within(trial).getByText('Hulu trial ends in 2 days')).toBeOnTheScreen();
    expect(
      within(trial).getByText("You'll be charged $17.99 on Oct 3."),
    ).toBeOnTheScreen();
    const netflix = screen.getByTestId('urgent-price_change-sub-netflix');
    expect(within(netflix).getByText('Netflix price increase')).toBeOnTheScreen();
    expect(
      within(netflix).getByText('$13.99 → $15.49 · +$18.00/yr since Oct 1'),
    ).toBeOnTheScreen();
  });

  it('a price alert opens the subscription; a trial alert opens Trial Shield', async () => {
    await renderHome();

    await fireEvent.press(await screen.findByTestId('urgent-price_change-sub-netflix'));
    expect(await screen.findByTestId('stub')).toHaveTextContent(
      'SubscriptionDetail {"id":"sub-netflix"}',
    );
  });

  it('trial alerts open Trial Shield in the Calendar tab', async () => {
    await renderHome();

    await fireEvent.press(await screen.findByTestId('urgent-trial_ending-sub-hulu'));
    expect(await screen.findByTestId('stub')).toHaveTextContent(/TrialShield/);
  });

  it('upcoming renewals are the first four, soonest first, with relative dates', async () => {
    await renderHome();
    await screen.findByTestId('renewal-sub-icloud-');

    const rows = screen.getAllByTestId(/^renewal-/);
    expect(rows).toHaveLength(4);
    expect(rows.map((r) => r.props.accessibilityLabel)).toEqual([
      'iCloud+, $2.99, due October 1, 2026.',
      'Hulu, $17.99, due October 3, 2026.',
      'Spotify, $10.99, due October 4, 2026.',
      'New York Times, $4.25, due October 8, 2026.',
    ]);
    expect(within(rows[0]!).getByText('today')).toBeOnTheScreen();
    expect(within(rows[1]!).getByText('in 2 days')).toBeOnTheScreen();
  });

  it('View all and a renewal row go where they say', async () => {
    await renderHome();

    await fireEvent.press(await screen.findByTestId('home-view-all'));
    expect(await screen.findByTestId('stub')).toHaveTextContent(/"screen":"Calendar"/);
  });

  it('a renewal row opens its subscription', async () => {
    await renderHome();

    await fireEvent.press(await screen.findByTestId('renewal-sub-spotify'));
    expect(await screen.findByTestId('stub')).toHaveTextContent(/sub-spotify/);
  });

  it('renders under reduced motion', async () => {
    await renderHome({ reduceMotion: true });

    expect(await screen.findByTestId('category-card')).toBeOnTheScreen();
  });
});

describe('states (06 §5, §6)', () => {
  it('shows a skeleton per section while loading', async () => {
    server.use(
      http.get('*/analytics/summary', async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return HttpResponse.json(alexSummary);
      }),
    );
    await renderHome();

    expect(await screen.findByLabelText('Loading monthly spend')).toBeOnTheScreen();
    expect(await screen.findByTestId('spend-card')).toBeOnTheScreen();
  });

  it('us6_no_subscriptions_shows_the_first_run_empty_state_only', async () => {
    await renderHome({ email: MOCK_EMAILS.empty });

    expect(await screen.findByText(HOME_COPY.emptyTitle)).toBeOnTheScreen();
    expect(screen.queryByTestId('home-spend')).toBeNull();
    // The email CTA waits for the AI epic flag.
    expect(screen.queryByTestId('home-find-in-email')).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: 'Add a subscription' }));
    expect(await screen.findByTestId('stub')).toHaveTextContent(/^AddSubscription/);
  });

  it('hides Urgent attention entirely when there is nothing urgent', async () => {
    server.use(
      http.get('*/analytics/price-changes', () =>
        HttpResponse.json({ display_currency: 'USD', items: [] }),
      ),
    );
    await renderHome();
    await screen.findByTestId('spend-card');

    await waitFor(() => expect(screen.queryByTestId('home-urgent')).toBeNull());
    expect(screen.queryByText('Urgent attention')).toBeNull();
  });

  it('says so when no renewals are due in 30 days', async () => {
    server.use(
      http.get('*/analytics/upcoming', () =>
        HttpResponse.json({
          display_currency: 'USD',
          start: '2026-10-01',
          end: '2026-10-31',
          items: [],
        }),
      ),
    );
    await renderHome();

    expect(await screen.findByText('No renewals in the next 30 days')).toBeOnTheScreen();
  });

  it('a failed section retries inline while the others render', async () => {
    server.use(failWith('/analytics/upcoming'));
    await renderHome();

    expect(await screen.findByTestId('spend-card')).toBeOnTheScreen();
    const upcoming = screen.getByTestId('home-upcoming');
    await waitFor(() =>
      expect(
        within(upcoming).getByRole('button', { name: /try again|retry/i }),
      ).toBeOnTheScreen(),
    );
    server.resetHandlers();
    await fireEvent.press(
      within(upcoming).getByRole('button', { name: /try again|retry/i }),
    );
    expect(await screen.findByTestId('renewal-sub-icloud-')).toBeOnTheScreen();
  });

  it('everything failing is one full-screen error with retry', async () => {
    server.use(
      failWith('/analytics/summary'),
      failWith('/analytics/spend-over-time'),
      failWith('/analytics/price-changes'),
      failWith('/analytics/upcoming'),
    );
    await renderHome();

    expect(await screen.findByTestId('home-error')).toBeOnTheScreen();
  });

  it('keeps the data and says how old it is when a refresh fails', async () => {
    await renderHome();
    await screen.findByTestId('spend-card');

    server.use(http.get('*/analytics/*', () => HttpResponse.error()));
    const scroll = screen.getByTestId('home-screen');
    await act(async () => {
      scroll.props.refreshControl.props.onRefresh();
    });

    expect(await screen.findByTestId('home-stale')).toHaveTextContent(
      new RegExp(`^${HOME_COPY.stalePrefix} `),
    );
    expect(screen.getByTestId('spend-card')).toBeOnTheScreen();
  });

  it('a converted currency shows the chip and the conversion note', async () => {
    server.use(
      http.get('*/analytics/summary', () =>
        HttpResponse.json({
          ...alexSummary,
          display_currency: 'EUR',
          monthly_total: { amount: '118.56', currency: 'EUR' },
        }),
      ),
    );
    await renderHome();

    const card = await screen.findByTestId('spend-card');
    expect(within(card).getByText('EUR')).toBeOnTheScreen();
    expect(within(card).getByText("Converted at today's rate")).toBeOnTheScreen();
    expect(card.props.accessibilityLabel).toContain('€118.56');
  });
});
