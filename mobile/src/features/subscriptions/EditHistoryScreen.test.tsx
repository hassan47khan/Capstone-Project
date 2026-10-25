/**
 * Edit history (07 §6, §9) against the mock API, plus one run through the real
 * Detail -> Edit -> History screens.
 */
import { NavigationContainer, useNavigation, useRoute } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { http, HttpResponse } from 'msw';
import { Pressable, Text } from 'react-native';

import { SessionProvider } from '@/session/SessionContext';
import { tokenStore } from '@/session/tokenStore';
import { MOCK_EMAILS } from '@/test/fixtures';
import { createTestQueryClient, renderWithProviders } from '@/test/render';
import { server } from '@/test/server';

import { HISTORY_COPY, EditHistoryScreen } from './EditHistoryScreen';
import { EditSubscriptionScreen } from './EditSubscriptionScreen';
import { SubscriptionDetailScreen } from './SubscriptionDetailScreen';

jest.mock('./today', () => ({
  localToday: () => '2026-10-23',
  utcToday: () => '2026-10-23',
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Stack = createNativeStackNavigator<any>();

// A screen underneath History, so closing has somewhere to go back to.
function Opener({ id }: { id: string }) {
  const navigation = useNavigation();
  const route = useRoute();
  return (
    <Pressable
      testID="open-history"
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onPress={() => (navigation as any).navigate('EditHistory', { id })}
    >
      <Text>{route.name}</Text>
    </Pressable>
  );
}

async function signIn() {
  await tokenStore.setRefreshToken(`mock-refresh-${MOCK_EMAILS.full}`);
}

// Opens Edit history for `id` on top of a stub screen.
async function renderHistory(id: string) {
  await signIn();
  const OpenerFor = () => <Opener id={id} />;
  await renderWithProviders(
    <SessionProvider>
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Under" component={OpenerFor} />
          <Stack.Screen name="EditHistory" component={EditHistoryScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </SessionProvider>,
    { queryClient: createTestQueryClient(), reduceMotion: true },
  );
  await fireEvent.press(await screen.findByTestId('open-history'));
}

beforeEach(async () => {
  await tokenStore.clear();
});

describe('loaded (07 §6)', () => {
  it('us7_history_lists_every_change_newest_first', async () => {
    await renderHistory('sub-netflix');

    const cards = await screen.findAllByTestId(/^history-evt-/);
    expect(cards.map((c) => c.props.testID)).toEqual([
      'history-evt-netflix-3',
      'history-evt-netflix-2',
      'history-evt-netflix-1',
    ]);
    expect(screen.getByText('Price changed from $13.99 to $15.49')).toBeOnTheScreen();
    expect(screen.getByText('Price update')).toBeOnTheScreen();
    expect(screen.getByText('Creation')).toBeOnTheScreen();
  });

  it('puts the subscription name in the title', async () => {
    await renderHistory('sub-netflix');
    expect(await screen.findByText(HISTORY_COPY.titleFor('Netflix'))).toBeOnTheScreen();
  });

  it('reads each card as one item, with the date spelled out', async () => {
    await renderHistory('sub-netflix');

    const card = await screen.findByTestId('history-evt-netflix-3');
    expect(card).toHaveProp(
      'accessibilityLabel',
      'October 1, 2026, Price update: Price changed from $13.99 to $15.49',
    );
  });

  it('closing goes back to the screen underneath', async () => {
    await renderHistory('sub-netflix');
    await screen.findByTestId('history-evt-netflix-3');

    await fireEvent.press(screen.getByTestId('header-close'));
    await waitFor(() => expect(screen.queryByTestId('history-screen')).toBeNull());
    expect(screen.getByTestId('open-history')).toBeOnTheScreen();
  });
});

describe('states (07 §9)', () => {
  it('shows 3 skeleton rows while loading', async () => {
    await renderHistory('sub-netflix');
    expect(screen.getByTestId('history-loading')).toBeOnTheScreen();
    await screen.findByTestId('history-evt-netflix-3');
  });

  it('only a creation event shows the empty state, not a one-item list', async () => {
    await renderHistory('sub-headspace');

    expect(await screen.findByText(HISTORY_COPY.emptyBody)).toBeOnTheScreen();
    expect(screen.queryByTestId(/^history-evt-/)).toBeNull();
  });

  it('a 404 says "Not found" (never permission) and can only go back', async () => {
    await renderHistory('sub-someone-else');

    expect(await screen.findByText('Not found')).toBeOnTheScreen();
    expect(screen.queryByText(/permission/i)).toBeNull();
    expect(screen.getByText(HISTORY_COPY.title)).toBeOnTheScreen();

    await fireEvent.press(screen.getByTestId('history-error-retry'));
    await waitFor(() => expect(screen.queryByTestId('history-screen')).toBeNull());
  });

  it('a server error offers Try again, which reloads', async () => {
    let fail = true;
    server.use(
      http.get('*/subscriptions/:id/history', () =>
        fail
          ? HttpResponse.json(
              { error: { code: 'server_error', message: 'Boom', fields: {} } },
              { status: 500 },
            )
          : undefined,
      ),
    );
    await renderHistory('sub-netflix');

    expect(await screen.findByText('Something went wrong')).toBeOnTheScreen();
    fail = false;
    await fireEvent.press(screen.getByTestId('history-error-retry'));
    expect(await screen.findByTestId('history-evt-netflix-3')).toBeOnTheScreen();
  });

  it('if only the detail fails, it shows the error instead of loading forever', async () => {
    let fail = true;
    server.use(
      http.get('*/subscriptions/:id', () =>
        fail
          ? HttpResponse.json(
              { error: { code: 'server_error', message: 'Boom', fields: {} } },
              { status: 500 },
            )
          : undefined,
      ),
    );
    await renderHistory('sub-netflix');

    expect(await screen.findByText('Something went wrong')).toBeOnTheScreen();
    fail = false;
    await fireEvent.press(screen.getByTestId('history-error-retry'));
    expect(await screen.findByTestId('history-evt-netflix-3')).toBeOnTheScreen();
  });
});

describe('after an edit', () => {
  it('us7_edit_price_shows_in_history_with_the_prior_value', async () => {
    // Cache like the real app (fresh for 30s, kept after closing), so this only
    // passes if saving actually refreshes the cached history.
    const queryClient = createTestQueryClient();
    queryClient.setDefaultOptions({
      queries: { retry: false, staleTime: 30_000, gcTime: Infinity },
      mutations: { retry: false, gcTime: 0 },
    });
    await signIn();
    await renderWithProviders(
      <SessionProvider>
        <NavigationContainer>
          <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen
              name="SubscriptionDetail"
              component={SubscriptionDetailScreen}
              initialParams={{ id: 'sub-netflix' }}
            />
            <Stack.Screen name="EditSubscription" component={EditSubscriptionScreen} />
            <Stack.Screen name="EditHistory" component={EditHistoryScreen} />
          </Stack.Navigator>
        </NavigationContainer>
      </SessionProvider>,
      { queryClient, reduceMotion: true },
    );

    // Open history once first, so a cached copy exists and must be refreshed.
    await fireEvent.press(await screen.findByTestId('detail-edit'));
    await fireEvent.press(await screen.findByTestId('form-history'));
    await screen.findByTestId('history-evt-netflix-3');
    await fireEvent.press(screen.getByTestId('header-close'));

    // Edit the price and save; that returns to Detail.
    await fireEvent.changeText(await screen.findByTestId('form-price'), '16.99');
    await fireEvent.press(screen.getByTestId('edit-save'));
    await waitFor(() => expect(screen.queryByTestId('edit-screen')).toBeNull());

    // Back into History: the new change is on top, with the old price kept.
    await fireEvent.press(await screen.findByTestId('detail-edit'));
    await fireEvent.press(await screen.findByTestId('form-history'));
    expect(
      await screen.findByText('Price changed from $15.49 to $16.99'),
    ).toBeOnTheScreen();
    const cards = screen.getAllByTestId(/^history-evt-/);
    expect(cards[0]).toHaveTextContent(/Price changed from \$15\.49 to \$16\.99/);
    expect(cards).toHaveLength(4);
  });
});
