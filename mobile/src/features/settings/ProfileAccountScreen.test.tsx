/**
 * Profile & Account (09 §6, §7, §10) against the mock API.
 */
import { NavigationContainer, useNavigation } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { onlineManager, type QueryClient } from '@tanstack/react-query';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { http, HttpResponse } from 'msw';
import { Pressable, StyleSheet, Text } from 'react-native';

import { queryKeys } from '@/api/queryKeys';
import { SessionProvider } from '@/session/SessionContext';
import { tokenStore } from '@/session/tokenStore';
import { MOCK_EMAILS, mockProfiles } from '@/test/fixtures';
import { createTestQueryClient, renderWithProviders } from '@/test/render';
import { server } from '@/test/server';
import { darkColors, lightColors } from '@/theme';

import {
  PROFILE_COPY,
  ProfileAccountScreen,
  THEME_OPTIONS,
} from './ProfileAccountScreen';

const ME_URL = '*/me';
const ALEX = mockProfiles.alex!;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Stack = createNativeStackNavigator<any>();

// Settings, as a stub with one way in, so Close has somewhere to go back to.
function SettingsStub() {
  const navigation = useNavigation();
  return (
    <Pressable
      testID="open-profile"
      onPress={() => (navigation.navigate as (route: string) => void)('ProfileAccount')}
    >
      <Text>Settings</Text>
    </Pressable>
  );
}

let client: QueryClient | undefined;

/**
 * The test client, but keeping unused data like the app's five minutes, so
 * Clear Cache has something to clear (the test default drops it at once).
 */
function keepingClient(): QueryClient {
  const qc = createTestQueryClient();
  const defaults = qc.getDefaultOptions();
  qc.setDefaultOptions({
    ...defaults,
    queries: { ...defaults.queries, gcTime: Infinity },
  });
  return qc;
}

async function renderProfile(
  { queryClient = keepingClient(), settle: wait = true } = {} as {
    queryClient?: QueryClient;
    settle?: boolean;
  },
) {
  client = queryClient;
  await tokenStore.setRefreshToken(`mock-refresh-${MOCK_EMAILS.full}`);
  await renderWithProviders(
    <SessionProvider>
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="SettingsMain" component={SettingsStub} />
          <Stack.Screen name="ProfileAccount" component={ProfileAccountScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </SessionProvider>,
    { queryClient },
  );
  await fireEvent.press(await screen.findByTestId('open-profile'));
  await screen.findByTestId('profile-account-screen');
  if (wait) await settle();
  return queryClient;
}

/** Lets every request finish, so nothing lands after the test. */
async function settle() {
  const current = client;
  if (!current) return;
  await waitFor(() => expect(current.isFetching()).toBe(0));
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
}

const goOffline = () => act(async () => onlineManager.setOnline(false));
const goOnline = () => act(async () => onlineManager.setOnline(true));

const colorOf = (testID: string) =>
  StyleSheet.flatten(screen.getByTestId(testID).props.style).color;
const selectedTheme = () =>
  THEME_OPTIONS.filter(
    (option) =>
      screen.getByTestId(`profile-theme-${option.value}`).props.accessibilityState
        .selected,
  ).map((option) => option.value);

beforeEach(async () => {
  await tokenStore.clear();
});

afterEach(async () => {
  await goOnline();
  await settle();
  client = undefined;
});

describe('Profile & Account (09 §6)', () => {
  it('is titled "Profile & Account" and Close goes back to Settings', async () => {
    await renderProfile();
    expect(screen.getByRole('header', { name: PROFILE_COPY.title })).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Close' }));

    expect(await screen.findByTestId('open-profile')).toBeOnTheScreen();
    expect(screen.queryByTestId('profile-account-screen')).not.toBeOnTheScreen();
  });

  it('has My Profile, App Preferences and Data, in that order, as headings', async () => {
    await renderProfile();
    const headings = screen
      .getAllByRole('header')
      .map((heading) => heading.props.accessibilityLabel ?? heading.props.children);
    const groups = [PROFILE_COPY.myProfile, PROFILE_COPY.preferences, PROFILE_COPY.data];
    const positions = groups.map((group) =>
      headings.findIndex((text) => String(text).toLowerCase() === group.toLowerCase()),
    );
    expect(positions.every((index) => index >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it('leaves out what has no screen or endpoint yet', async () => {
    await renderProfile();
    for (const missing of [
      'Haptic feedback',
      'Export all data',
      'Import subscriptions',
      'Change password',
      'Two-factor auth',
      'Delete account',
      'Family Premium',
    ]) {
      expect(screen.queryByText(missing)).not.toBeOnTheScreen();
    }
  });
});

describe('My Profile', () => {
  it('shows the name, the email and the initials from GET /me', async () => {
    await renderProfile();
    const card = screen.getByTestId('profile-card');

    expect(within(card).getByTestId('profile-name')).toHaveTextContent(ALEX.name!);
    expect(within(card).getByTestId('profile-email')).toHaveTextContent(ALEX.email);
    expect(within(card).getByText('AK', { includeHiddenElements: true })).toBeTruthy();
  });

  it('hides the avatar from screen readers: the name is right beside it', async () => {
    await renderProfile();
    const avatar = screen.getByTestId('profile-avatar', { includeHiddenElements: true });
    expect(avatar.props.accessibilityElementsHidden).toBe(true);
    expect(avatar.props.importantForAccessibility).toBe('no-hide-descendants');
  });

  it('draws the avatar in accent: 56 round, accent ring, accent initials', async () => {
    await renderProfile();
    const avatar = StyleSheet.flatten(
      screen.getByTestId('profile-avatar', { includeHiddenElements: true }).props.style,
    );
    expect(avatar).toMatchObject({
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: lightColors.accentSurface,
      borderColor: lightColors.accent,
    });
    const letters = StyleSheet.flatten(
      screen.getByText('AK', { includeHiddenElements: true }).props.style,
    );
    expect(letters).toMatchObject({ fontSize: 20, color: lightColors.accent });
  });

  it.each([
    ['no name', null],
    ['a blank name', '   '],
  ])('with %s, goes by the email, once, with its first letter', async (_case, name) => {
    server.use(http.get(ME_URL, () => HttpResponse.json({ ...ALEX, name })));
    await renderProfile();

    expect(screen.getByTestId('profile-name')).toHaveTextContent(ALEX.email);
    expect(screen.queryByTestId('profile-email')).not.toBeOnTheScreen();
    expect(screen.getByText('A', { includeHiddenElements: true })).toBeTruthy();
  });

  it('shows a very long name in full, never cut off (09 §7)', async () => {
    const long = 'Alexandria Catherine Montgomery-Kingsley the Third of Northbrook';
    server.use(http.get(ME_URL, () => HttpResponse.json({ ...ALEX, name: long })));
    await renderProfile();

    const name = screen.getByTestId('profile-name');
    expect(name).toHaveTextContent(long);
    expect(name.props.numberOfLines).toBeUndefined();
    expect(screen.getByText('AN', { includeHiddenElements: true })).toBeTruthy();
  });

  it('shows one "Loading profile" skeleton until GET /me answers', async () => {
    let answer!: () => void;
    const held = new Promise<void>((resolve) => (answer = resolve));
    server.use(
      http.get(ME_URL, async () => {
        await held;
        return HttpResponse.json(ALEX);
      }),
    );
    await renderProfile({ settle: false });

    expect(
      screen.getByRole('progressbar', { name: PROFILE_COPY.loadingProfile }),
    ).toBeOnTheScreen();
    expect(screen.queryByTestId('profile-card')).not.toBeOnTheScreen();
    // The rest of the screen doesn't wait for it.
    expect(screen.getByTestId('profile-theme')).toBeOnTheScreen();
    expect(screen.getByTestId('profile-clear-cache')).toBeOnTheScreen();

    answer();
    expect(await screen.findByTestId('profile-card')).toBeOnTheScreen();
    expect(screen.queryByTestId('profile-loading')).not.toBeOnTheScreen();
  });

  it('if GET /me fails, only the profile shows the error, and Try again recovers', async () => {
    let fail = true;
    server.use(
      http.get(ME_URL, () =>
        fail
          ? HttpResponse.json({ error: { code: 'server_error' } }, { status: 500 })
          : HttpResponse.json(ALEX),
      ),
    );
    await renderProfile();

    expect(await screen.findByTestId('profile-error')).toBeOnTheScreen();
    expect(screen.getByTestId('profile-theme')).toBeOnTheScreen();
    expect(screen.getByTestId('profile-clear-cache')).toBeOnTheScreen();

    fail = false;
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByTestId('profile-card')).toBeOnTheScreen();
    expect(screen.queryByTestId('profile-error')).not.toBeOnTheScreen();
  });
});

describe('App Theme', () => {
  it('offers Dark, Light and System, in that order, as one labelled group', async () => {
    await renderProfile();
    const group = screen.getByTestId('profile-theme');
    expect(group.props.accessibilityRole).toBe('tablist');
    expect(group.props.accessibilityLabel).toBe(PROFILE_COPY.theme);
    expect(
      within(group)
        .getAllByRole('tab')
        .map((tab) => tab.props.accessibilityLabel),
    ).toEqual(['Dark', 'Light', 'System']);
  });

  it('starts on the current theme', async () => {
    await renderProfile();
    expect(selectedTheme()).toEqual(['light']);
  });

  it('Dark really switches the app to the dark theme, and Light back (01 §6)', async () => {
    await renderProfile();
    expect(colorOf('profile-name')).toBe(lightColors.text);

    await fireEvent.press(screen.getByTestId('profile-theme-dark'));

    expect(selectedTheme()).toEqual(['dark']);
    expect(colorOf('profile-name')).toBe(darkColors.text);
    expect(colorOf('profile-email')).toBe(darkColors.textMuted);

    await fireEvent.press(screen.getByTestId('profile-theme-light'));

    expect(selectedTheme()).toEqual(['light']);
    expect(colorOf('profile-name')).toBe(lightColors.text);
  });

  it('System follows the phone (light here)', async () => {
    await renderProfile();
    await fireEvent.press(screen.getByTestId('profile-theme-dark'));
    await fireEvent.press(screen.getByTestId('profile-theme-system'));

    expect(selectedTheme()).toEqual(['system']);
    expect(colorOf('profile-name')).toBe(lightColors.text);
  });

  it('each choice is a 44pt target', async () => {
    await renderProfile();
    for (const option of THEME_OPTIONS) {
      const tab = screen.getByTestId(`profile-theme-${option.value}`);
      const height = StyleSheet.flatten(tab.props.style).height as number;
      expect(height + tab.props.hitSlop * 2).toBeGreaterThanOrEqual(44);
    }
  });
});

describe('Language', () => {
  it('says "English" and is a value, not a control', async () => {
    await renderProfile();
    const row = screen.getByTestId('profile-language');

    expect(row).toHaveTextContent(/English/);
    expect(row.props.accessibilityLabel).toBe('Language, English');
    expect(row.props.accessibilityRole).toBeUndefined();
    expect(row.props.onPress).toBeUndefined();
    expect(screen.queryByRole('button', { name: /Language/ })).not.toBeOnTheScreen();
  });
});

describe('Clear Cache', () => {
  const sizeShown = () => screen.getByTestId('profile-cache-size').props.children;

  it('shows the cached data size, and says it with the label', async () => {
    const qc = await renderProfile();
    qc.setQueryData(['old-screen'], { body: 'x'.repeat(30 * 1024) });

    await waitFor(() => expect(sizeShown()).not.toBe('0 KB'));
    const shown = sizeShown();
    expect(shown).toMatch(/^\d+ KB$/);
    expect(Number.parseInt(shown, 10)).toBeGreaterThanOrEqual(30);
    expect(screen.getByTestId('profile-clear-cache').props.accessibilityLabel).toBe(
      `${PROFILE_COPY.clearCache}, ${shown}`,
    );
  });

  it('the size keeps up as data comes and goes', async () => {
    const qc = await renderProfile();
    const before = sizeShown();

    qc.setQueryData(['old-screen'], { body: 'x'.repeat(200 * 1024) });
    await waitFor(() => expect(sizeShown()).not.toBe(before));
    expect(Number.parseInt(sizeShown(), 10)).toBeGreaterThanOrEqual(200);

    await act(async () => qc.removeQueries({ queryKey: ['old-screen'] }));
    await waitFor(() => expect(sizeShown()).toBe(before));
  });

  it('clearing drops unused data, reloads the profile, and says "Cache cleared"', async () => {
    const qc = await renderProfile();
    qc.setQueryData(['old-screen'], { body: 'x'.repeat(100 * 1024) });
    const loads = qc.getQueryState(queryKeys.session.profile())!.dataUpdateCount;
    await waitFor(() =>
      expect(Number.parseInt(sizeShown(), 10)).toBeGreaterThanOrEqual(100),
    );

    await fireEvent.press(screen.getByRole('button', { name: /^Clear Cache/ }));

    expect(await screen.findByText(PROFILE_COPY.cleared)).toBeOnTheScreen();
    expect(qc.getQueryData(['old-screen'])).toBeUndefined();
    // The profile stays on screen while it reloads.
    expect(screen.getByTestId('profile-card')).toBeOnTheScreen();
    await waitFor(() =>
      expect(qc.getQueryState(queryKeys.session.profile())!.dataUpdateCount).toBe(
        loads + 1,
      ),
    );
    expect(screen.getByTestId('profile-name')).toHaveTextContent(ALEX.name!);
    expect(Number.parseInt(sizeShown(), 10)).toBeLessThan(100);
  });

  it('says what it does before you press it', async () => {
    await renderProfile();
    expect(screen.getByTestId('profile-clear-cache').props.accessibilityHint).toBe(
      PROFILE_COPY.clearHint,
    );
  });

  it('offline, is disabled with the reason, and clears nothing (09 §8)', async () => {
    const qc = await renderProfile();
    qc.setQueryData(['old-screen'], { body: 'kept' });
    await goOffline();

    const row = screen.getByTestId('profile-clear-cache');
    expect(row.props.accessibilityState).toMatchObject({ disabled: true });
    expect(row.props.accessibilityHint).toBe(PROFILE_COPY.clearOffline);
    expect(screen.getByTestId('profile-clear-cache-reason')).toHaveTextContent(
      PROFILE_COPY.clearOffline,
    );

    await fireEvent.press(row);

    expect(qc.getQueryData(['old-screen'])).toEqual({ body: 'kept' });
    expect(screen.queryByText(PROFILE_COPY.cleared)).not.toBeOnTheScreen();

    await goOnline();
    expect(
      screen.getByTestId('profile-clear-cache').props.accessibilityState,
    ).toMatchObject({
      disabled: false,
    });
    expect(screen.queryByTestId('profile-clear-cache-reason')).not.toBeOnTheScreen();
  });
});
