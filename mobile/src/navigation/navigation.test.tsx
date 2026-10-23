/**
 * Navigation tests (handoff 03 §8, definition of done).
 *
 * What these prove
 *   - the whole tree in 03 §1 is navigable;
 *   - there is one tab bar, with four tabs and the FAB, and the FAB is a button
 *     that opens Add Subscription as a modal;
 *   - no tab changes while a modal is up, and modals close with an X;
 *   - a dirty form asks before it is discarded, a pristine one does not;
 *   - headers are left-aligned and the tab bar respects the safe area;
 *   - the auth gate's five launch cases, with no flash of the Auth stack;
 *   - deep links, cold-started and backgrounded, including one that arrives
 *     while signed out and opens after sign-in.
 *
 * `render` and `fireEvent` are ASYNC in RNTL v14 — always await them.
 */
import {
  NavigationContainer,
  useNavigation,
  useNavigationContainerRef,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { http, HttpResponse } from 'msw';
import { useState, type ReactNode } from 'react';
import { Linking, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Button, ToastProvider } from '@/components';
import { SessionProvider, useSession } from '@/session/SessionContext';
import { tokenStore } from '@/session/tokenStore';
import { MOCK_EMAILS } from '@/test/fixtures';
import { createTestQueryClient, flattenStyle } from '@/test/render';
import { server } from '@/test/server';
import { sizes, ThemeProvider } from '@/theme';

import { AppNavigator } from './AppNavigator';
import { AuthNavigator } from './AuthNavigator';
import { resetPendingAuthRoute } from './pendingAuthRoute';
import { resetPendingLink } from './pendingLink';
import { RootNavigator } from './RootNavigator';
import type { AppStackParamList, AuthStackParamList } from './types';
import { useDiscardGuard } from './useDiscardGuard';

// Counts every render of the Log in screen, so "no flash of the Auth stack"
// can be asserted rather than eyeballed.
const mockLoginRenders = jest.fn();
jest.mock('@/features/auth/LoginScreen', () => {
  const actual = jest.requireActual('@/features/auth/LoginScreen');
  return {
    LoginScreen: () => {
      mockLoginRenders();
      return actual.LoginScreen();
    },
  };
});

const HIDDEN = { includeHiddenElements: true } as const;
const SAFE_AREA = {
  frame: { x: 0, y: 0, width: 402, height: 874 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider initialPreference="light">
      <SafeAreaProvider initialMetrics={SAFE_AREA}>
        <QueryClientProvider client={createTestQueryClient()}>
          <SessionProvider>
            <ToastProvider>{children}</ToastProvider>
          </SessionProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </ThemeProvider>
  );
}

/** Signs in from outside the navigator, the way the Log in screen will. */
function SignInForTest() {
  const { signIn } = useSession();
  return (
    <Text
      onPress={() =>
        signIn({
          access: `mock-access-${MOCK_EMAILS.full}`,
          refresh: `mock-refresh-${MOCK_EMAILS.full}`,
        })
      }
    >
      test-sign-in
    </Text>
  );
}

async function renderApp(extra?: ReactNode) {
  await render(
    <Providers>
      <RootNavigator />
      {extra}
    </Providers>,
  );
}

const title = () => screen.getByTestId('header-title', HIDDEN).props.children;

beforeEach(async () => {
  mockLoginRenders.mockClear();
  resetPendingLink();
  resetPendingAuthRoute();
  await tokenStore.clear();
  jest.spyOn(Linking, 'getInitialURL').mockResolvedValue(null);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('auth gate (03 §5)', () => {
  it('case 2: no session opens the Auth stack at Log in', async () => {
    await renderApp();

    await waitFor(() => expect(title()).toBe('Log In'));
  });

  it('case 3: a session with an unverified email opens Verify Email Sent', async () => {
    server.use(
      http.get('*/me', () =>
        HttpResponse.json({
          id: 'u1',
          email: MOCK_EMAILS.full,
          name: null,
          email_verified: false,
        }),
      ),
    );
    await tokenStore.setRefreshToken(`mock-refresh-${MOCK_EMAILS.full}`);
    await renderApp();

    await waitFor(() => expect(title()).toBe('Check your email'));
    expect(mockLoginRenders).not.toHaveBeenCalled();
  });

  it('case 3: "Wrong email?" signs out and lands on Register with the email filled in', async () => {
    server.use(
      http.get('*/me', () =>
        HttpResponse.json({
          id: 'u1',
          email: MOCK_EMAILS.full,
          name: null,
          email_verified: false,
        }),
      ),
    );
    await tokenStore.setRefreshToken(`mock-refresh-${MOCK_EMAILS.full}`);
    await renderApp();
    await waitFor(() => expect(title()).toBe('Check your email'));
    await waitFor(() => expect(screen.getByTestId('verify-wrong-email')).toBeEnabled());

    await fireEvent.press(screen.getByTestId('verify-wrong-email'));

    await waitFor(() => expect(title()).toBe('Create your account'));
    expect(screen.getByTestId('register-email').props.value).toBe(MOCK_EMAILS.full);
    expect(await tokenStore.getRefreshToken()).toBeNull();
  });

  it.each([
    ['case 4: verified with zero subscriptions', MOCK_EMAILS.empty],
    ['case 5: verified with subscriptions', MOCK_EMAILS.full],
  ])('%s lands on Home without ever showing Log in', async (_label, email) => {
    await tokenStore.setRefreshToken(`mock-refresh-${email}`);
    await renderApp();

    await waitFor(() => expect(screen.getByTestId('tab-Home')).toBeSelected());
    expect(title()).toBe('Home');
    expect(mockLoginRenders).not.toHaveBeenCalled();
  });

  it('opens the app, not a lockout, when /me cannot be reached', async () => {
    server.use(http.get('*/me', () => HttpResponse.error()));
    await tokenStore.setRefreshToken(`mock-refresh-${MOCK_EMAILS.full}`);
    await renderApp();

    await waitFor(() => expect(screen.getByTestId('tab-Home')).toBeOnTheScreen());
    expect(mockLoginRenders).not.toHaveBeenCalled();
  });
});

describe('tab bar (03 §2)', () => {
  beforeEach(async () => {
    await tokenStore.setRefreshToken(`mock-refresh-${MOCK_EMAILS.full}`);
  });

  it('is one bar: Home, Calendar, the FAB, Analytics, Settings', async () => {
    await renderApp();
    await waitFor(() => expect(screen.getByTestId('tab-Home')).toBeOnTheScreen());

    expect(screen.getAllByTestId('tab-bar')).toHaveLength(1);
    expect(screen.getAllByRole('tab').map((tab) => tab.props.accessibilityLabel)).toEqual(
      ['Home', 'Calendar', 'Analytics', 'Settings'],
    );
    // Order in the bar: the FAB sits between Calendar and Analytics.
    const row = screen.getByTestId('tab-bar').props.children.props.children;
    expect(row.map((child: { key: string }) => child.key)).toEqual([
      expect.stringContaining('Home'),
      expect.stringContaining('Calendar'),
      'fab',
      expect.stringContaining('Analytics'),
      expect.stringContaining('Settings'),
    ]);
  });

  it('announces the FAB as a button, never as a tab', async () => {
    await renderApp();
    await waitFor(() => expect(screen.getByTestId('tab-fab')).toBeOnTheScreen());

    expect(screen.getByRole('button', { name: 'Add subscription' })).toBeOnTheScreen();
    expect(screen.queryByRole('tab', { name: 'Add subscription' })).toBeNull();
  });

  it('gives each tab the full bar height and clears the home indicator', async () => {
    await renderApp();
    await waitFor(() => expect(screen.getByTestId('tab-Home')).toBeOnTheScreen());

    expect(flattenStyle(screen.getByTestId('tab-Home').props.style).height).toBe(
      sizes.tabBar,
    );
    expect(sizes.tabBar).toBeGreaterThanOrEqual(sizes.minTouch);
    const bar = flattenStyle(screen.getByTestId('tab-bar').props.style);
    expect(bar.paddingBottom).toBe(SAFE_AREA.insets.bottom);
    expect(bar.height).toBe(sizes.tabBar + SAFE_AREA.insets.bottom);
  });

  it('switches tabs', async () => {
    await renderApp();
    await waitFor(() => expect(screen.getByTestId('tab-Calendar')).toBeOnTheScreen());

    await fireEvent.press(screen.getByTestId('tab-Calendar'));

    expect(screen.getByTestId('tab-Calendar')).toBeSelected();
    expect(screen.getByTestId('tab-Home')).not.toBeSelected();
  });
});

describe('modals (03 §3)', () => {
  beforeEach(async () => {
    await tokenStore.setRefreshToken(`mock-refresh-${MOCK_EMAILS.full}`);
  });

  it('the FAB opens Add Subscription with a close control, and no tab changes', async () => {
    await renderApp();
    await waitFor(() => expect(screen.getByTestId('tab-Calendar')).toBeOnTheScreen());
    await fireEvent.press(screen.getByTestId('tab-Calendar'));

    await fireEvent.press(screen.getByTestId('tab-fab'));

    await waitFor(() =>
      expect(screen.getByRole('header', { name: 'Add subscription' })).toBeOnTheScreen(),
    );
    expect(screen.getByRole('button', { name: 'Close' })).toBeOnTheScreen();
    // Rule 2: the tab the user came from stays selected; nothing else lights up.
    const selected = screen
      .getAllByRole('tab', HIDDEN)
      .filter((tab) => tab.props.accessibilityState?.selected);
    expect(selected.map((tab) => tab.props.accessibilityLabel)).toEqual(['Calendar']);
  });

  it('closing the modal returns to the tab it came from', async () => {
    await renderApp();
    await waitFor(() => expect(screen.getByTestId('tab-fab')).toBeOnTheScreen());
    await fireEvent.press(screen.getByTestId('tab-fab'));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Close' })).toBeOnTheScreen(),
    );

    await fireEvent.press(screen.getByRole('button', { name: 'Close' }));

    await waitFor(() =>
      expect(screen.queryByRole('header', { name: 'Add subscription' })).toBeNull(),
    );
    expect(screen.getByTestId('tab-Home')).toBeSelected();
  });

  it('headers are left-aligned', async () => {
    await renderApp();
    await waitFor(() => expect(screen.getByTestId('tab-Home')).toBeOnTheScreen());

    expect(flattenStyle(screen.getByTestId('header-title').props.style).textAlign).toBe(
      'left',
    );
  });

  it('header titles are 20pt (03 §4)', async () => {
    await renderApp();
    await waitFor(() => expect(screen.getByTestId('tab-Home')).toBeOnTheScreen());

    expect(flattenStyle(screen.getByTestId('header-title').props.style).fontSize).toBe(
      20,
    );
  });
});

describe('tab stacks (03 §1)', () => {
  beforeEach(async () => {
    await tokenStore.setRefreshToken(`mock-refresh-${MOCK_EMAILS.full}`);
  });

  const selectedTabs = () =>
    screen
      .getAllByRole('tab', HIDDEN)
      .filter((tab) => tab.props.accessibilityState?.selected)
      .map((tab) => tab.props.accessibilityLabel);

  it.each([
    ['Calendar', 'calendar-trial-shield', 'Trial Shield'],
    ['Settings', 'settings-shared-plans', 'Shared plans'],
    ['Settings', 'settings-connect-email', 'Connect email'],
  ])(
    '%s pushes %s inside the tab, with back and the tab bar kept',
    async (tab, rowTestID, expectedTitle) => {
      await renderApp();
      await waitFor(() => expect(screen.getByTestId(`tab-${tab}`)).toBeOnTheScreen());
      await fireEvent.press(screen.getByTestId(`tab-${tab}`));

      await fireEvent.press(screen.getByTestId(rowTestID));

      await waitFor(() =>
        expect(screen.getByRole('header', { name: expectedTitle })).toBeOnTheScreen(),
      );
      expect(screen.getByRole('button', { name: `Back to ${tab}` })).toBeOnTheScreen();
      expect(screen.getAllByTestId('tab-bar')).toHaveLength(1);
      expect(selectedTabs()).toEqual([tab]);
    },
  );

  it('tapping the selected tab pops its stack back to the root', async () => {
    await renderApp();
    await waitFor(() => expect(screen.getByTestId('tab-Calendar')).toBeOnTheScreen());
    await fireEvent.press(screen.getByTestId('tab-Calendar'));
    await fireEvent.press(screen.getByTestId('calendar-trial-shield'));
    await waitFor(() =>
      expect(screen.getByRole('header', { name: 'Trial Shield' })).toBeOnTheScreen(),
    );

    await fireEvent.press(screen.getByTestId('tab-Calendar'));

    await waitFor(() =>
      expect(screen.queryByRole('header', { name: 'Trial Shield' })).toBeNull(),
    );
    expect(screen.getByRole('header', { name: 'Calendar' })).toBeOnTheScreen();
  });

  it('Connect email opens Review extraction as a modal, and no tab changes', async () => {
    await renderApp();
    await waitFor(() => expect(screen.getByTestId('tab-Settings')).toBeOnTheScreen());
    await fireEvent.press(screen.getByTestId('tab-Settings'));
    await fireEvent.press(screen.getByTestId('settings-connect-email'));
    await waitFor(() =>
      expect(screen.getByTestId('connect-email-review')).toBeOnTheScreen(),
    );

    await fireEvent.press(screen.getByTestId('connect-email-review'));

    await waitFor(() =>
      expect(screen.getByRole('header', { name: 'Review extraction' })).toBeOnTheScreen(),
    );
    expect(screen.getByRole('button', { name: 'Close' })).toBeOnTheScreen();
    expect(selectedTabs()).toEqual(['Settings']);
  });
});

describe('the full tree is navigable (03 §1)', () => {
  const APP_ROUTES: [keyof AppStackParamList, object | undefined, string][] = [
    ['AddSubscription', undefined, 'Add subscription'],
    ['SubscriptionDetail', { id: 'sub_1' }, 'Subscription'],
    ['EditSubscription', { id: 'sub_1' }, 'Edit subscription'],
    ['EditHistory', { id: 'sub_1' }, 'Edit history'],
    ['SelectCurrency', undefined, 'Currency'],
    ['SelectTimeZone', undefined, 'Time zone'],
    ['NotificationRules', undefined, 'Notification rules'],
    ['ProfileAccount', undefined, 'Profile & account'],
    ['ReviewExtraction', undefined, 'Review extraction'],
  ];

  it.each(APP_ROUTES)('App: %s', async (route, params, expectedTitle) => {
    function Harness() {
      const ref = useNavigationContainerRef<AppStackParamList>();
      return (
        <NavigationContainer
          ref={ref}
          onReady={() => (ref.navigate as (r: string, p?: object) => void)(route, params)}
        >
          <AppNavigator />
        </NavigationContainer>
      );
    }
    await render(
      <Providers>
        <Harness />
      </Providers>,
    );

    await waitFor(() =>
      expect(screen.getByRole('header', { name: expectedTitle })).toBeOnTheScreen(),
    );
  });

  it('App: ConfirmCurrencyChange is a confirm sheet', async () => {
    function Harness() {
      const ref = useNavigationContainerRef<AppStackParamList>();
      return (
        <NavigationContainer
          ref={ref}
          onReady={() => ref.navigate('ConfirmCurrencyChange', { currency: 'EUR' })}
        >
          <AppNavigator />
        </NavigationContainer>
      );
    }
    await render(
      <Providers>
        <Harness />
      </Providers>,
    );

    await waitFor(() => expect(screen.getByText('Switch to EUR?')).toBeOnTheScreen());
  });

  const AUTH_ROUTES: [keyof AuthStackParamList, object | undefined, string][] = [
    ['Register', undefined, 'Create your account'],
    ['VerifyEmailSent', undefined, 'Check your email'],
    ['EmailConfirmed', { token: 't' }, 'Email confirmed'],
    ['ForgotPassword', undefined, 'Reset your password'],
    ['ResetLinkSent', { email: 'a@b.c' }, 'Check your email'],
    ['CreateNewPassword', { token: 't' }, 'Create a new password'],
    ['PasswordResetSuccess', undefined, 'Password updated'],
  ];

  it.each(AUTH_ROUTES)('Auth: %s', async (route, params, expectedTitle) => {
    function Harness() {
      const ref = useNavigationContainerRef<AuthStackParamList>();
      return (
        <NavigationContainer
          ref={ref}
          onReady={() => (ref.navigate as (r: string, p?: object) => void)(route, params)}
        >
          <AuthNavigator />
        </NavigationContainer>
      );
    }
    await render(
      <Providers>
        <Harness />
      </Providers>,
    );

    await waitFor(() =>
      expect(screen.getByRole('header', { name: expectedTitle })).toBeOnTheScreen(),
    );
    // Pushed over Log In, so there is somewhere to go back to. Some screens
    // also offer a "Back to Log In" link in the card, hence "at least one".
    expect(
      screen.getAllByRole('button', { name: 'Back to Log In' }).length,
    ).toBeGreaterThan(0);
  });

  it('Settings rows lead to the Settings modals', async () => {
    await tokenStore.setRefreshToken(`mock-refresh-${MOCK_EMAILS.full}`);
    await renderApp();
    await waitFor(() => expect(screen.getByTestId('tab-Settings')).toBeOnTheScreen());
    await fireEvent.press(screen.getByTestId('tab-Settings'));

    await fireEvent.press(screen.getByTestId('settings-timezone'));

    await waitFor(() =>
      expect(screen.getByRole('header', { name: 'Time zone' })).toBeOnTheScreen(),
    );
  });
});

describe('discard guard (03 §3, rule 3)', () => {
  const Stack = createNativeStackNavigator();

  function Start() {
    const navigation = useNavigation();
    return (
      <Button label="Open form" onPress={() => navigation.navigate('Form' as never)} />
    );
  }

  function Form() {
    const navigation = useNavigation();
    const [dirty, setDirty] = useState(false);
    const { sheet } = useDiscardGuard(dirty);
    return (
      <>
        <Text>The form</Text>
        <Button label="Type something" onPress={() => setDirty(true)} />
        <Button label="Close form" onPress={() => navigation.goBack()} />
        {sheet}
      </>
    );
  }

  async function renderHarness() {
    await render(
      <Providers>
        <NavigationContainer>
          <Stack.Navigator>
            <Stack.Screen name="Start" component={Start} />
            <Stack.Screen name="Form" component={Form} />
          </Stack.Navigator>
        </NavigationContainer>
      </Providers>,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Open form' }));
    await waitFor(() => expect(screen.getByText('The form')).toBeOnTheScreen());
  }

  it('a pristine form closes immediately, with no prompt', async () => {
    await renderHarness();

    await fireEvent.press(screen.getByRole('button', { name: 'Close form' }));

    await waitFor(() => expect(screen.queryByText('The form')).toBeNull());
    expect(screen.queryByText('Discard changes?')).toBeNull();
  });

  it('a dirty form asks first, and stays if the user keeps editing', async () => {
    await renderHarness();
    await fireEvent.press(screen.getByRole('button', { name: 'Type something' }));

    await fireEvent.press(screen.getByRole('button', { name: 'Close form' }));

    expect(screen.getByText('Discard changes?', HIDDEN)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('discard-guard-cancel', HIDDEN));
    expect(screen.getByText('The form')).toBeOnTheScreen();
  });

  it('a dirty form closes once the user chooses Discard', async () => {
    await renderHarness();
    await fireEvent.press(screen.getByRole('button', { name: 'Type something' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Close form' }));

    await fireEvent.press(screen.getByTestId('discard-guard-confirm', HIDDEN));

    await waitFor(() => expect(screen.queryByText('The form')).toBeNull());
  });
});

describe('deep links (03 §6)', () => {
  /** Captures the app's `url` listener so a test can deliver a link. */
  function captureUrlListener() {
    let deliver: (url: string) => void = () => {};
    jest.spyOn(Linking, 'addEventListener').mockImplementation((_type, handler) => {
      deliver = (url) => (handler as (event: { url: string }) => void)({ url });
      return { remove: jest.fn() } as unknown as ReturnType<
        typeof Linking.addEventListener
      >;
    });
    return (url: string) => act(async () => deliver(url));
  }

  it('cold start, signed out: reset-password opens Create New Password', async () => {
    jest
      .spyOn(Linking, 'getInitialURL')
      .mockResolvedValue('subtrak://reset-password?token=abc');
    await renderApp();

    await waitFor(() => expect(title()).toBe('Create a new password'));
  });

  it('cold start, signed out: verify-email opens Email Confirmed', async () => {
    jest
      .spyOn(Linking, 'getInitialURL')
      .mockResolvedValue('subtrak://verify-email?token=abc');
    await renderApp();

    await waitFor(() => expect(title()).toBe('Email confirmed'));
  });

  it('cold start, signed in: a subscription link opens its detail', async () => {
    await tokenStore.setRefreshToken(`mock-refresh-${MOCK_EMAILS.full}`);
    jest
      .spyOn(Linking, 'getInitialURL')
      .mockResolvedValue('subtrak://subscription/sub_1');
    await renderApp();

    await waitFor(() =>
      expect(screen.getByRole('header', { name: 'Subscription' })).toBeOnTheScreen(),
    );
  });

  it('backgrounded, signed out: reset-password still opens', async () => {
    const deliver = captureUrlListener();
    await renderApp();
    await waitFor(() => expect(title()).toBe('Log In'));

    await deliver('subtrak://reset-password?token=abc');

    await waitFor(() =>
      expect(
        screen.getByRole('header', { name: 'Create a new password' }),
      ).toBeOnTheScreen(),
    );
  });

  it('backgrounded, signed out: a subscription link waits for sign-in, then opens', async () => {
    const deliver = captureUrlListener();
    await renderApp(<SignInForTest />);
    await waitFor(() => expect(title()).toBe('Log In'));

    await deliver('subtrak://subscription/sub_1');
    // Parked, not dropped and not opened: the user is still signed out.
    expect(title()).toBe('Log In');

    await fireEvent.press(screen.getByText('test-sign-in'));

    await waitFor(() =>
      expect(screen.getByRole('header', { name: 'Subscription' })).toBeOnTheScreen(),
    );
  });

  it('backgrounded, signed in: a subscription link opens its detail', async () => {
    await tokenStore.setRefreshToken(`mock-refresh-${MOCK_EMAILS.full}`);
    const deliver = captureUrlListener();
    await renderApp();
    await waitFor(() => expect(screen.getByTestId('tab-Home')).toBeOnTheScreen());

    await deliver('subtrak://subscription/sub_9');

    await waitFor(() =>
      expect(screen.getByRole('header', { name: 'Subscription' })).toBeOnTheScreen(),
    );
  });
});
