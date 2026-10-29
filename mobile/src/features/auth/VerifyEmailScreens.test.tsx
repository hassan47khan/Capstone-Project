/**
 * Check your email and Email confirmed (05 §4, §8; US-1), against the shared
 * mock routes.
 */
import { NavigationContainer, useRoute } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { http, HttpResponse } from 'msw';
import { Linking, Text } from 'react-native';

import type { AuthStackParamList } from '@/navigation/types';
import { SessionProvider, useSession } from '@/session/SessionContext';
import { tokenStore } from '@/session/tokenStore';
import { MOCK_EMAILS } from '@/test/fixtures';
import { createTestQueryClient, renderWithProviders } from '@/test/render';
import { server } from '@/test/server';

import { CONFIRMED_COPY, EmailConfirmedScreen } from './EmailConfirmedScreen';
import { DEFAULT_RESEND_COOLDOWN_SECONDS } from './useResendWithCooldown';
import { VERIFY_COPY, VerifyEmailSentScreen } from './VerifyEmailSentScreen';

const Stack = createNativeStackNavigator<AuthStackParamList>();

function Stub() {
  const route = useRoute();
  const params = route.params as { email?: string } | undefined;
  return (
    <Text testID="stub">
      {route.name}
      {params?.email ? ` ${params.email}` : ''}
    </Text>
  );
}

function SessionStatus() {
  return <Text testID="session-status">{useSession().status}</Text>;
}

async function renderAt<R extends 'VerifyEmailSent' | 'EmailConfirmed'>(
  route: R,
  params: AuthStackParamList[R],
) {
  await renderWithProviders(
    <SessionProvider>
      <SessionStatus />
      <NavigationContainer>
        <Stack.Navigator initialRouteName={route} screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Login" component={Stub} />
          <Stack.Screen name="Register" component={Stub} />
          <Stack.Screen
            name="VerifyEmailSent"
            component={VerifyEmailSentScreen}
            initialParams={route === 'VerifyEmailSent' ? (params as object) : undefined}
          />
          <Stack.Screen
            name="EmailConfirmed"
            component={EmailConfirmedScreen}
            initialParams={route === 'EmailConfirmed' ? (params as object) : undefined}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </SessionProvider>,
    { queryClient: createTestQueryClient() },
  );
  await waitFor(() =>
    expect(screen.getByTestId('session-status')).not.toHaveTextContent('loading'),
  );
}

beforeEach(async () => {
  await tokenStore.clear();
});

describe('Check your email (05 §4)', () => {
  it('names the inbox and makes Open Mail app the primary', async () => {
    await renderAt('VerifyEmailSent', { email: 'new@subtrak.test' });

    expect(screen.getByRole('header', { name: VERIFY_COPY.title })).toBeOnTheScreen();
    expect(screen.getByText('new@subtrak.test')).toBeOnTheScreen();
    expect(
      screen.getByTestId('status-icon-mail', { includeHiddenElements: true }),
    ).toBeTruthy();
    // Order is the hierarchy: primary, then Resend, then the two links.
    const labels = screen.getAllByRole('button').map((b) => b.props.accessibilityLabel);
    expect(labels).toEqual(['Open Mail app', 'Resend', 'Wrong email?', 'Back to Log In']);
  });

  it('opens the mail app', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    await renderAt('VerifyEmailSent', { email: 'new@subtrak.test' });

    await fireEvent.press(screen.getByTestId('verify-open-mail'));

    expect(open).toHaveBeenCalledTimes(1);
    open.mockRestore();
  });

  it('says so when no mail app opens', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('none'));
    await renderAt('VerifyEmailSent', { email: 'new@subtrak.test' });

    await fireEvent.press(screen.getByTestId('verify-open-mail'));

    expect(await screen.findByText(VERIFY_COPY.mailUnavailable)).toBeOnTheScreen();
    open.mockRestore();
  });

  it('us1_resend_uses_the_server_cooldown_and_counts_down', async () => {
    server.use(
      http.post('*/auth/resend-verification', () =>
        HttpResponse.json({ cooldown_seconds: 42 }),
      ),
    );
    await renderAt('VerifyEmailSent', { email: 'new@subtrak.test' });

    await fireEvent.press(screen.getByTestId('verify-resend'));

    expect(await screen.findByText('Resend in 0:42')).toBeOnTheScreen();
    expect(screen.getByTestId('verify-resend')).toBeDisabled();
    expect(screen.getByText(VERIFY_COPY.resent)).toBeOnTheScreen();
  });

  it('falls back to a default cooldown when the response has none', async () => {
    await renderAt('VerifyEmailSent', { email: 'new@subtrak.test' });

    await fireEvent.press(screen.getByTestId('verify-resend'));

    expect(await screen.findByText(`Resend in 1:00`)).toBeOnTheScreen();
    expect(DEFAULT_RESEND_COOLDOWN_SECONDS).toBe(60);
  });

  it('shows a 429 and waits it out', async () => {
    server.use(
      http.post('*/auth/resend-verification', () =>
        HttpResponse.json(
          {
            error: {
              code: 'throttled',
              message: 'Too many requests. Try again shortly.',
            },
          },
          { status: 429 },
        ),
      ),
    );
    await renderAt('VerifyEmailSent', { email: 'new@subtrak.test' });

    await fireEvent.press(screen.getByTestId('verify-resend'));

    expect(await screen.findByTestId('form-error')).toHaveTextContent(
      'Too many requests. Try again shortly.',
    );
    expect(screen.getByTestId('verify-resend')).toBeDisabled();
  });

  it('shows a toast when offline', async () => {
    server.use(http.post('*/auth/resend-verification', () => HttpResponse.error()));
    await renderAt('VerifyEmailSent', { email: 'new@subtrak.test' });

    await fireEvent.press(screen.getByTestId('verify-resend'));

    expect(await screen.findByText(VERIFY_COPY.offline)).toBeOnTheScreen();
  });

  it('shows any other failure above the actions', async () => {
    server.use(
      http.post('*/auth/resend-verification', () =>
        HttpResponse.json(
          { error: { code: 'server_error', message: 'Down.' } },
          { status: 500 },
        ),
      ),
    );
    await renderAt('VerifyEmailSent', { email: 'new@subtrak.test' });

    await fireEvent.press(screen.getByTestId('verify-resend'));

    expect(await screen.findByTestId('form-error')).toHaveTextContent('Down.');
  });

  it('asks for the email when it is not known, and resends to it', async () => {
    await renderAt('VerifyEmailSent', undefined);

    expect(screen.getByText(VERIFY_COPY.sentToUnknown)).toBeOnTheScreen();
    expect(screen.getByTestId('verify-resend')).toBeDisabled();
    await fireEvent.changeText(screen.getByTestId('verify-email'), 'new@subtrak.test');

    expect(screen.getByTestId('verify-resend')).toBeEnabled();
  });

  it('shows a skeleton, not the fallback field, while the profile loads', async () => {
    server.use(
      http.get('*/me', async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return HttpResponse.json({
          id: 'u1',
          email: MOCK_EMAILS.full,
          name: null,
          email_verified: false,
        });
      }),
    );
    await tokenStore.setRefreshToken(`mock-refresh-${MOCK_EMAILS.full}`);
    await renderAt('VerifyEmailSent', undefined);

    expect(
      screen.getByTestId('verify-email-loading', { includeHiddenElements: true }),
    ).toBeTruthy();
    expect(screen.queryByTestId('verify-email')).toBeNull();
    expect(screen.queryByText(VERIFY_COPY.sentToUnknown)).toBeNull();
    expect(screen.getByTestId('verify-resend')).toBeDisabled();
    expect(screen.getByTestId('verify-wrong-email')).toBeDisabled();

    expect(await screen.findByText(MOCK_EMAILS.full)).toBeOnTheScreen();
    expect(
      screen.queryByTestId('verify-email-loading', { includeHiddenElements: true }),
    ).toBeNull();
    expect(screen.getByTestId('verify-resend')).toBeEnabled();
  });

  it('reads the email from the profile for a signed-in, unverified user', async () => {
    await tokenStore.setRefreshToken(`mock-refresh-${MOCK_EMAILS.full}`);
    await renderAt('VerifyEmailSent', undefined);

    expect(await screen.findByText(MOCK_EMAILS.full)).toBeOnTheScreen();
  });

  it('Wrong email? goes back to Register with the email filled in', async () => {
    await renderAt('VerifyEmailSent', { email: 'typo@subtrak.test' });

    await fireEvent.press(screen.getByTestId('verify-wrong-email'));

    expect(await screen.findByTestId('stub')).toHaveTextContent(
      'Register typo@subtrak.test',
    );
  });

  it('Back to Log In signs a signed-in user out and leaves navigation to the gate', async () => {
    await tokenStore.setRefreshToken(`mock-refresh-${MOCK_EMAILS.full}`);
    await renderAt('VerifyEmailSent', undefined);
    expect(screen.getByTestId('session-status')).toHaveTextContent('authenticated');

    await fireEvent.press(screen.getByTestId('verify-back-to-login'));

    await waitFor(() =>
      expect(screen.getByTestId('session-status')).toHaveTextContent('unauthenticated'),
    );
    // Signing out remounts the Auth stack at Log In (RootNavigator); this
    // screen navigates nowhere itself.
    expect(screen.queryByTestId('stub')).toBeNull();
  });
});

describe('Email confirmed (05 §8)', () => {
  it('us1_confirms_the_link_then_continues_to_log_in', async () => {
    await renderAt('EmailConfirmed', { token: 'good' });

    expect(
      await screen.findByRole('header', { name: CONFIRMED_COPY.title }),
    ).toBeOnTheScreen();
    expect(screen.getByText(CONFIRMED_COPY.body)).toBeOnTheScreen();

    await fireEvent.press(screen.getByTestId('confirmed-continue'));

    expect(await screen.findByTestId('stub')).toHaveTextContent('Login');
  });

  it('shows Continue busy while the link is checked', async () => {
    server.use(
      http.post('*/auth/verify-email', async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return HttpResponse.json({ verified: true });
      }),
    );
    await renderAt('EmailConfirmed', { token: 'slow' });

    expect(
      screen.getByRole('header', { name: CONFIRMED_COPY.checking }),
    ).toBeOnTheScreen();
    expect(screen.getByTestId('confirmed-continue')).toBeBusy();
    await screen.findByRole('header', { name: CONFIRMED_COPY.title });
  });

  it('signs in with the tokens the contract returns', async () => {
    server.use(
      http.post('*/auth/verify-email', () =>
        HttpResponse.json({
          access: `mock-access-${MOCK_EMAILS.full}`,
          refresh: `mock-refresh-${MOCK_EMAILS.full}`,
        }),
      ),
    );
    await renderAt('EmailConfirmed', { token: 'good' });
    await screen.findByRole('header', { name: CONFIRMED_COPY.title });

    await fireEvent.press(screen.getByTestId('confirmed-continue'));

    await waitFor(() =>
      expect(screen.getByTestId('session-status')).toHaveTextContent('authenticated'),
    );
    expect(await tokenStore.getRefreshToken()).toBe(`mock-refresh-${MOCK_EMAILS.full}`);
  });

  it('refreshes the profile when the user is already signed in', async () => {
    await tokenStore.setRefreshToken(`mock-refresh-${MOCK_EMAILS.full}`);
    await renderAt('EmailConfirmed', { token: 'good' });
    await screen.findByRole('header', { name: CONFIRMED_COPY.title });

    await fireEvent.press(screen.getByTestId('confirmed-continue'));

    expect(screen.getByTestId('session-status')).toHaveTextContent('authenticated');
  });

  it('a signed-in user whose /me still says unverified goes back to Check your email', async () => {
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
    await renderAt('EmailConfirmed', { token: 'good' });
    await screen.findByRole('header', { name: CONFIRMED_COPY.title });

    await fireEvent.press(screen.getByTestId('confirmed-continue'));

    expect(
      await screen.findByRole('header', { name: VERIFY_COPY.title }),
    ).toBeOnTheScreen();
  });

  it('shows an error, and stays, when /me cannot be refetched', async () => {
    await tokenStore.setRefreshToken(`mock-refresh-${MOCK_EMAILS.full}`);
    await renderAt('EmailConfirmed', { token: 'good' });
    await screen.findByRole('header', { name: CONFIRMED_COPY.title });
    server.use(http.get('*/me', () => HttpResponse.error()));

    await fireEvent.press(screen.getByTestId('confirmed-continue'));

    expect(await screen.findByTestId('form-error')).toHaveTextContent(
      CONFIRMED_COPY.continueFailed,
    );
    expect(screen.getByTestId('confirmed-continue')).toBeEnabled();
  });

  it('shows an error when signing in with the returned tokens fails', async () => {
    server.use(
      http.post('*/auth/verify-email', () =>
        HttpResponse.json({
          access: `mock-access-${MOCK_EMAILS.full}`,
          refresh: `mock-refresh-${MOCK_EMAILS.full}`,
        }),
      ),
    );
    const store = jest
      .spyOn(tokenStore, 'setTokens')
      .mockRejectedValue(new Error('keychain'));
    try {
      await renderAt('EmailConfirmed', { token: 'good' });
      await screen.findByRole('header', { name: CONFIRMED_COPY.title });

      await fireEvent.press(screen.getByTestId('confirmed-continue'));

      expect(await screen.findByTestId('form-error')).toHaveTextContent(
        CONFIRMED_COPY.continueFailed,
      );
    } finally {
      store.mockRestore();
    }
  });

  it('us1_expired_link_offers_a_new_one_as_the_primary', async () => {
    await renderAt('EmailConfirmed', { token: 'expired' });

    expect(
      await screen.findByRole('header', { name: CONFIRMED_COPY.expired }),
    ).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('confirmed-resend'));

    expect(await screen.findByText(VERIFY_COPY.title)).toBeOnTheScreen();
  });

  it('an invalid link says so and leads back to Log In', async () => {
    await renderAt('EmailConfirmed', { token: '' });

    expect(
      await screen.findByRole('header', { name: CONFIRMED_COPY.invalid }),
    ).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('confirmed-back-to-login'));

    expect(await screen.findByTestId('stub')).toHaveTextContent('Login');
  });

  it('a link with no token at all says so instead of crashing', async () => {
    // A malformed subtrak://verify-email with no ?token= routes here with no
    // params; the screen must show the invalid-link state, not throw.
    await renderAt('EmailConfirmed', undefined);

    expect(
      await screen.findByRole('header', { name: CONFIRMED_COPY.invalid }),
    ).toBeOnTheScreen();
    expect(screen.getByTestId('confirmed-back-to-login')).toBeOnTheScreen();
  });

  it('offline keeps the user here with Try again', async () => {
    let calls = 0;
    server.use(
      http.post('*/auth/verify-email', () => {
        calls += 1;
        return calls === 1 ? HttpResponse.error() : HttpResponse.json({ verified: true });
      }),
    );
    await renderAt('EmailConfirmed', { token: 'good' });

    expect(
      await screen.findByRole('header', { name: CONFIRMED_COPY.offline }),
    ).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('confirmed-retry'));

    expect(
      await screen.findByRole('header', { name: CONFIRMED_COPY.title }),
    ).toBeOnTheScreen();
  });

  it('draws the check without animating under reduced motion', async () => {
    await renderWithProviders(
      <SessionProvider>
        <NavigationContainer>
          <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen
              name="EmailConfirmed"
              component={EmailConfirmedScreen}
              initialParams={{ token: 'good' }}
            />
          </Stack.Navigator>
        </NavigationContainer>
      </SessionProvider>,
      { queryClient: createTestQueryClient(), reduceMotion: true },
    );

    expect(
      await screen.findByTestId('status-icon-check', { includeHiddenElements: true }),
    ).toBeTruthy();
  });
});
