/**
 * The category screen opened from a bar on Home: the server's total and share,
 * the active subscriptions in that category, and tap-through to Detail.
 */
import { NavigationContainer, useRoute } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { fireEvent, screen } from '@testing-library/react-native';
import { http, HttpResponse } from 'msw';
import { Text } from 'react-native';

import { SessionProvider } from '@/session/SessionContext';
import { tokenStore } from '@/session/tokenStore';
import { MOCK_EMAILS } from '@/test/fixtures';
import { createTestQueryClient, renderWithProviders } from '@/test/render';
import { server } from '@/test/server';

import { CATEGORY_DETAIL_COPY, CategoryDetailScreen } from './CategoryDetailScreen';

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

async function renderCategory(slug: string, name: string) {
  await tokenStore.setRefreshToken(`mock-refresh-${MOCK_EMAILS.full}`);
  await renderWithProviders(
    <SessionProvider>
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen
            name="CategoryDetail"
            component={CategoryDetailScreen}
            initialParams={{ slug, name }}
          />
          <Stack.Screen name="SubscriptionDetail" component={Stub} />
        </Stack.Navigator>
      </NavigationContainer>
    </SessionProvider>,
    { queryClient: createTestQueryClient(), reduceMotion: true },
  );
}

const failWith = (path: string) =>
  http.get(`*${path}`, () =>
    HttpResponse.json(
      { error: { code: 'server_error', message: 'Down.' } },
      { status: 500 },
    ),
  );

beforeEach(async () => {
  await tokenStore.clear();
});

describe('Entertainment with the seed data', () => {
  it('shows the server total and share for the category', async () => {
    await renderCategory('entertainment', 'Entertainment');

    const total = await screen.findByTestId('category-detail-total');
    expect(total.props.accessibilityLabel).toBe(
      'Entertainment, $40.47 per month, 31% of your monthly spending.',
    );
    expect(screen.getByText('Entertainment')).toBeOnTheScreen();
  });

  it('lists only active subscriptions in the category, and a row opens Detail', async () => {
    await renderCategory('entertainment', 'Entertainment');

    const rows = await screen.findAllByTestId(/^category-detail-row-/);
    expect(rows.length).toBeGreaterThan(0);
    // Other categories' subscriptions are not listed.
    expect(screen.queryByText('Notion AI')).toBeNull();
    expect(screen.queryByText('ChatGPT Plus')).toBeNull();

    await fireEvent.press(rows[0]!);
    expect(await screen.findByTestId('stub')).toHaveTextContent(
      /^SubscriptionDetail \{"id":"sub-/,
    );
  });

  it('back goes to Home', async () => {
    await renderCategory('entertainment', 'Entertainment');
    expect(
      await screen.findByRole('button', { name: /back to home/i }),
    ).toBeOnTheScreen();
  });
});

describe('states', () => {
  it('a category with nothing active says so', async () => {
    await renderCategory('education', 'Education');
    expect(await screen.findByTestId('category-detail-empty')).toBeOnTheScreen();
    expect(
      screen.getByText(CATEGORY_DETAIL_COPY.emptyTitle('Education')),
    ).toBeOnTheScreen();
  });

  it('a failed list shows its own error with Try again; the total still shows', async () => {
    server.use(failWith('/subscriptions'));
    await renderCategory('entertainment', 'Entertainment');
    expect(await screen.findByTestId('category-detail-list-error')).toBeOnTheScreen();
    expect(await screen.findByTestId('category-detail-total')).toBeOnTheScreen();
  });

  it('a failed summary shows its own error; the list still shows', async () => {
    server.use(failWith('/analytics/summary'));
    await renderCategory('entertainment', 'Entertainment');
    expect(await screen.findByTestId('category-detail-total-error')).toBeOnTheScreen();
    expect(
      (await screen.findAllByTestId(/^category-detail-row-/)).length,
    ).toBeGreaterThan(0);
  });
});
