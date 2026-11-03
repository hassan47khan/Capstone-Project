/**
 * Settings root (09 §1, §8, §10) against the mock API.
 */
import { NavigationContainer, useRoute } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { http, HttpResponse } from 'msw';
import { Text } from 'react-native';

import { SessionProvider } from '@/session/SessionContext';
import { tokenStore } from '@/session/tokenStore';
import { alexSummary } from '@/test/contractFixtures';
import { MOCK_EMAILS } from '@/test/fixtures';
import { createTestQueryClient, renderWithProviders } from '@/test/render';
import { server } from '@/test/server';

import { currencyValue, SETTINGS_COPY, SettingsScreen } from './SettingsScreen';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Stack = createNativeStackNavigator<any>();

// Every destination, as a stub that names itself.
function Stub() {
  const route = useRoute();
  return <Text testID="stub">{route.name}</Text>;
}

// "App" holds Settings and every screen its rows open, like the real tree,
// where the Settings tab sits inside the App stack.
function AppStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="SettingsMain" component={SettingsScreen} />
      {[
        'SelectCurrency',
        'SelectTimeZone',
        'NotificationRules',
        'ProfileAccount',
        'SharedPlans',
        'ConnectEmail',
        'DevGallery',
      ].map((name) => (
        <Stack.Screen key={name} name={name} component={Stub} />
      ))}
    </Stack.Navigator>
  );
}

async function renderSettings(email: string = MOCK_EMAILS.full) {
  await tokenStore.setRefreshToken(`mock-refresh-${email}`);
  await renderWithProviders(
    <SessionProvider>
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="App" component={AppStack} />
        </Stack.Navigator>
      </NavigationContainer>
    </SessionProvider>,
    { queryClient: createTestQueryClient() },
  );
  await screen.findByTestId('settings-screen');
}

const label = (testID: string) => screen.getByTestId(testID).props.accessibilityLabel;

beforeEach(async () => {
  await tokenStore.clear();
});

describe('Settings root (09 §1)', () => {
  it('has the Display, Notifications, Account and Connections groups, as headings', async () => {
    await renderSettings();

    for (const group of [
      SETTINGS_COPY.display,
      SETTINGS_COPY.notifications,
      SETTINGS_COPY.account,
      SETTINGS_COPY.connections,
    ]) {
      expect(
        screen.getAllByRole('header', { name: new RegExp(group, 'i') }).length,
      ).toBeGreaterThan(0);
    }
    expect(screen.getByRole('header', { name: SETTINGS_COPY.title })).toBeOnTheScreen();
  });

  it('has no "Regular User Account" subtitle', async () => {
    await renderSettings();

    expect(screen.queryByText(/regular user account/i)).toBeNull();
  });

  it('Notifications is one row, with no inline toggles anywhere', async () => {
    await renderSettings();

    expect(screen.queryAllByRole('switch')).toHaveLength(0);
    expect(screen.getByTestId('settings-notifications')).toHaveTextContent(
      SETTINGS_COPY.notificationRules,
    );
  });

  it('shows the real display currency and name (Alex: USD, Alex Kim)', async () => {
    await renderSettings();

    await waitFor(() => expect(label('settings-currency')).toBe('Currency, USD ($)'));
    await waitFor(() => expect(label('settings-profile')).toBe('Profile, Alex Kim'));
  });

  it('formats other currencies with their symbol', () => {
    expect(currencyValue('EUR')).toBe('EUR (€)');
    expect(currencyValue('JPY')).toBe('JPY (¥)');
    expect(currencyValue('GBP')).toBe('GBP (£)');
  });

  it("shows the server's currency when it isn't USD", async () => {
    // Alex's real summary, with the display currency switched to EUR.
    server.use(
      http.get('*/analytics/summary', () =>
        HttpResponse.json({ ...alexSummary, display_currency: 'EUR' }),
      ),
    );
    await renderSettings();

    await waitFor(() => expect(label('settings-currency')).toBe('Currency, EUR (€)'));
  });

  it('an account with no name shows its email instead', async () => {
    server.use(
      http.get('*/me', () =>
        HttpResponse.json({
          id: 'u1',
          email: 'sam@subtrak.test',
          name: null,
          email_verified: true,
          has_completed_first_run: true,
        }),
      ),
    );
    await renderSettings();

    await waitFor(() =>
      expect(label('settings-profile')).toBe('Profile, sam@subtrak.test'),
    );
  });
});

describe('the rows lead to their screens', () => {
  it.each([
    ['settings-currency', 'SelectCurrency'],
    ['settings-timezone', 'SelectTimeZone'],
    ['settings-notifications', 'NotificationRules'],
    ['settings-profile', 'ProfileAccount'],
    ['settings-shared-plans', 'SharedPlans'],
    ['settings-connect-email', 'ConnectEmail'],
  ])('%s opens %s', async (testID, route) => {
    await renderSettings();

    await fireEvent.press(screen.getByTestId(testID));

    expect(await screen.findByTestId('stub')).toHaveTextContent(route);
  });
});

describe('when the values fail to load (09 §8)', () => {
  it('every row still works, and Sign Out is still there', async () => {
    let calls = 0;
    const down = () => {
      calls += 1;
      return HttpResponse.json(
        { error: { code: 'server_error', message: 'Down.' } },
        { status: 503 },
      );
    };
    server.use(http.get('*/me', down), http.get('*/analytics/summary', down));
    await renderSettings();
    await waitFor(() => expect(calls).toBeGreaterThanOrEqual(2));

    // No values, no error screen: the rows are all there.
    expect(label('settings-currency')).toBe('Currency');
    expect(label('settings-profile')).toBe('Profile');
    expect(screen.getByTestId('settings-sign-out')).toBeOnTheScreen();
  });
});

describe('Sign Out (09 §1)', () => {
  it('is the red destructive row, and asks first', async () => {
    await renderSettings();

    await fireEvent.press(screen.getByTestId('settings-sign-out'));

    const sheet = await screen.findByTestId('sign-out-sheet');
    expect(within(sheet).getByText(SETTINGS_COPY.signOutTitle)).toBeOnTheScreen();
    expect(await tokenStore.getRefreshToken()).toBeTruthy();
  });

  it('Cancel keeps you signed in', async () => {
    await renderSettings();
    await fireEvent.press(screen.getByTestId('settings-sign-out'));
    await screen.findByTestId('sign-out-sheet');

    await fireEvent.press(screen.getByText('Cancel'));

    await waitFor(() => expect(screen.queryByTestId('sign-out-sheet')).toBeNull());
    expect(await tokenStore.getRefreshToken()).toBeTruthy();
  });

  it('confirming signs out', async () => {
    await renderSettings();
    await fireEvent.press(screen.getByTestId('settings-sign-out'));
    await screen.findByTestId('sign-out-sheet');

    await fireEvent.press(screen.getByTestId('sign-out-sheet-confirm'));

    await waitFor(async () => expect(await tokenStore.getRefreshToken()).toBeNull());
  });
});
