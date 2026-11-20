/**
 * The Notifications inbox and the bell on Home (US-13; spec §10: missed-alert
 * banner, permission-denied explanation), against the mock /notifications
 * routes (src/test/notificationFixtures.ts). Plus PushProvider's one-time
 * explanation when the user says no.
 */
import { NavigationContainer, useRoute } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import { http, HttpResponse } from 'msw';
import { Linking, Pressable, Text } from 'react-native';

import { HomeScreen } from '@/features/home/HomeScreen';
import { SessionProvider } from '@/session/SessionContext';
import { tokenStore } from '@/session/tokenStore';
import { MOCK_EMAILS } from '@/test/fixtures';
import { permission, pushMock } from '@/test/pushMock';
import { createTestQueryClient, renderWithProviders } from '@/test/render';
import { server } from '@/test/server';

import { INBOX_COPY, MISSED_BODY, PUSH_COPY } from './notificationCopy';
import { NotificationsScreen } from './NotificationsScreen';
import { PushProvider, useAskForPush } from './PushProvider';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Stack = createNativeStackNavigator<any>();

function Stub() {
  const route = useRoute();
  return (
    <Text testID="stub">{`${route.name} ${JSON.stringify(route.params ?? {})}`}</Text>
  );
}

/** Stands in for a screen that just saved a trial. */
function Saver() {
  const ask = useAskForPush();
  return (
    <Pressable onPress={() => void ask()} testID="save">
      <Text>Save</Text>
    </Pressable>
  );
}

async function renderApp(first: string, email: string = MOCK_EMAILS.full) {
  await tokenStore.setRefreshToken(`mock-refresh-${email}`);
  await renderWithProviders(
    <SessionProvider>
      <NavigationContainer>
        <PushProvider>
          <Stack.Navigator
            initialRouteName={first}
            screenOptions={{ headerShown: false }}
          >
            <Stack.Screen name="Home" component={HomeScreen} />
            <Stack.Screen name="Saver" component={Saver} />
            <Stack.Screen name="Notifications" component={NotificationsScreen} />
            <Stack.Screen name="SubscriptionDetail" component={Stub} />
            <Stack.Screen name="MainTabs" component={Stub} />
            <Stack.Screen name="ProfileAccount" component={Stub} />
          </Stack.Navigator>
        </PushProvider>
      </NavigationContainer>
    </SessionProvider>,
    { queryClient: createTestQueryClient(), reduceMotion: true },
  );
}

beforeEach(async () => {
  (SecureStore as unknown as { __reset: () => void }).__reset();
  // The access token is held in memory; drop the last test's account.
  await tokenStore.clear();
});

describe('Notifications inbox', () => {
  it('us13_missed_alert_banner_when_push_failed', async () => {
    await renderApp('Notifications');
    expect(await screen.findByText("1 alert didn't reach your phone")).toBeOnTheScreen();
    expect(screen.getByText(MISSED_BODY)).toBeOnTheScreen();
  });

  it('lists every alert, newest first, and says which are unread', async () => {
    await renderApp('Notifications');
    await screen.findByTestId('notifications-list');
    const rows = screen.getAllByRole('button', { name: /soon|went up/ });
    expect(rows.map((row) => row.props.accessibilityLabel)).toEqual([
      expect.stringMatching(/^Unread\. Hulu trial ends soon/),
      expect.stringMatching(/^Unread\. Spotify renews soon/),
      expect.stringMatching(/^YouTube Premium went up/),
    ]);
  });

  it('us13_opening_an_alert_marks_it_read_and_opens_the_subscription', async () => {
    await renderApp('Notifications');
    await fireEvent.press(await screen.findByTestId('notification-ntf-hulu-trial'));
    expect(
      await screen.findByText('SubscriptionDetail {"id":"sub-hulu"}'),
    ).toBeOnTheScreen();
  });

  it('drops the missed banner once that alert is read', async () => {
    await renderApp('Notifications');
    await fireEvent.press(await screen.findByTestId('notification-ntf-hulu-trial'));
    await screen.findByTestId('stub');
    // The server agrees on the refetch: nothing missed is left unread.
    await waitFor(() =>
      expect(screen.queryByTestId('notifications-missed')).not.toBeOnTheScreen(),
    );
  });

  it('shows the empty state for an account with no alerts', async () => {
    await renderApp('Notifications', MOCK_EMAILS.empty);
    expect(await screen.findByText(INBOX_COPY.emptyTitle)).toBeOnTheScreen();
    expect(screen.queryByTestId('notifications-missed')).not.toBeOnTheScreen();
  });

  it('shows an error with retry when the inbox fails to load', async () => {
    server.use(
      http.get('*/notifications', () =>
        HttpResponse.json(
          { error: { code: 'server_error', message: 'x' } },
          { status: 500 },
        ),
      ),
    );
    await renderApp('Notifications');
    expect(await screen.findByTestId('notifications-error')).toBeOnTheScreen();
  });

  it('us13_permission_denied_explains_and_links_to_settings', async () => {
    pushMock.isDevice = true;
    pushMock.current = permission('denied', false);
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue();
    await renderApp('Notifications');
    expect(await screen.findByText(INBOX_COPY.blockedTitle)).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('notifications-open-settings'));
    expect(openSettings).toHaveBeenCalled();
  });

  it('says nothing about push when it is allowed', async () => {
    pushMock.isDevice = true;
    pushMock.current = permission('granted');
    await renderApp('Notifications');
    await screen.findByTestId('notifications-list');
    expect(screen.queryByTestId('notifications-blocked')).not.toBeOnTheScreen();
  });
});

describe('Bell on Home', () => {
  it('us13_bell_shows_the_unread_count_and_opens_the_inbox', async () => {
    await renderApp('Home');
    const bell = await screen.findByRole('button', { name: 'Notifications, 2 unread' });
    expect(screen.getByTestId('home-bell-badge')).toHaveTextContent('2');
    await fireEvent.press(bell);
    expect(await screen.findByTestId('notifications-screen')).toBeOnTheScreen();
  });

  it('has no badge when nothing is unread', async () => {
    await renderApp('Home', MOCK_EMAILS.empty);
    await screen.findByTestId('home-screen');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Notifications' })).toBeOnTheScreen(),
    );
    expect(screen.queryByTestId('home-bell-badge')).not.toBeOnTheScreen();
  });
});

describe('Asking for push after a save', () => {
  beforeEach(() => {
    pushMock.isDevice = true;
  });

  it('us13_denied_explains_once_that_alerts_stay_in_the_inbox', async () => {
    pushMock.answer = permission('denied', false);
    await renderApp('Saver');
    await fireEvent.press(screen.getByTestId('save'));
    expect(await screen.findByText(PUSH_COPY.deniedTitle)).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('push-denied-ok'));
    await waitFor(() =>
      expect(screen.queryByText(PUSH_COPY.deniedTitle)).not.toBeOnTheScreen(),
    );

    // A second save: no prompt, no sheet.
    await fireEvent.press(screen.getByTestId('save'));
    await act(async () => {});
    expect(screen.queryByText(PUSH_COPY.deniedTitle)).not.toBeOnTheScreen();
  });

  it('us13_allowed_registers_without_any_sheet', async () => {
    await renderApp('Saver');
    await fireEvent.press(screen.getByTestId('save'));
    await act(async () => {});
    expect(screen.queryByText(PUSH_COPY.deniedTitle)).not.toBeOnTheScreen();
  });
});
