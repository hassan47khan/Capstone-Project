/**
 * Log in (05 §2, §5, §9, §11; US-2), against the shared mock routes.
 */
import { NavigationContainer, useRoute } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import {
  act,
  fireEvent,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { http, HttpResponse } from 'msw';
import { Text } from 'react-native';

import type { AuthStackParamList } from '@/navigation/types';
import { SessionProvider, useSession } from '@/session/SessionContext';
import { tokenStore } from '@/session/tokenStore';
import { MOCK_EMAILS, MOCK_PASSWORD } from '@/test/fixtures';
import { renderWithProviders } from '@/test/render';
import { server } from '@/test/server';
import { sizes } from '@/theme';

import { AUTH_NAV_BAR_HEIGHT } from './AuthShell';
import { LOGIN_COPY, LoginScreen, RATE_LIMIT_FALLBACK_SECONDS } from './LoginScreen';
import { authTestQueryClient } from './testClient';
import { formatCountdown, useCountdown } from './useCountdown';

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

async function renderLogin() {
  await renderWithProviders(
    <SessionProvider>
      <SessionStatus />
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="Register" component={Stub} />
          <Stack.Screen name="ForgotPassword" component={Stub} />
          <Stack.Screen name="VerifyEmailSent" component={Stub} />
        </Stack.Navigator>
      </NavigationContainer>
    </SessionProvider>,
    { queryClient: authTestQueryClient() },
  );
  await waitFor(() =>
    expect(screen.getByTestId('session-status')).toHaveTextContent('unauthenticated'),
  );
}

async function fillIn(email: string, password: string) {
  await fireEvent.changeText(screen.getByTestId('login-email'), email);
  await fireEvent(screen.getByTestId('login-email'), 'blur');
  await fireEvent.changeText(screen.getByTestId('login-password'), password);
}

const submit = () => fireEvent.press(screen.getByTestId('login-submit'));

beforeEach(async () => {
  await tokenStore.clear();
});

describe('shared shell (05 §2)', () => {
  it('shows the brand nav bar and the heading as the screen header', async () => {
    await renderLogin();

    expect(screen.getByText('SubTrak')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Log In' })).toBeOnTheScreen();
    // Snapped to the header token until a 64pt token exists (see AuthShell).
    expect(AUTH_NAV_BAR_HEIGHT).toBe(sizes.header);
  });

  it('matches the Figma copy: labels, placeholders, the footer link', async () => {
    await renderLogin();

    expect(screen.getByText('Email address')).toBeOnTheScreen();
    expect(screen.getByPlaceholderText('you@example.com')).toBeOnTheScreen();
    expect(screen.getByPlaceholderText('Enter your password')).toBeOnTheScreen();
    expect(screen.getByText("Don't have an account?")).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Create Account' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Forgot password?' })).toBeOnTheScreen();
  });

  it('has no back button on the first screen of the stack', async () => {
    await renderLogin();

    expect(screen.queryByTestId('auth-back')).toBeNull();
  });

  it('renders under reduced motion', async () => {
    await renderWithProviders(
      <SessionProvider>
        <NavigationContainer>
          <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen name="Login" component={LoginScreen} />
          </Stack.Navigator>
        </NavigationContainer>
      </SessionProvider>,
      { reduceMotion: true },
    );

    expect(screen.getByRole('header', { name: LOGIN_COPY.title })).toBeOnTheScreen();
  });
});

describe('form (05 §5, §9)', () => {
  it('us2_login_disabled_until_email_and_password_entered', async () => {
    await renderLogin();
    expect(screen.getByTestId('login-submit')).toBeDisabled();

    await fillIn(MOCK_EMAILS.full, MOCK_PASSWORD);

    expect(screen.getByTestId('login-submit')).toBeEnabled();
  });

  it('us2_invalid_email_shows_inline_after_blur', async () => {
    await renderLogin();

    await fillIn('not-an-email', MOCK_PASSWORD);

    expect(screen.getByText(LOGIN_COPY.invalidEmail)).toBeOnTheScreen();
    expect(screen.getByTestId('login-submit')).toBeDisabled();
  });

  it('masks the password with a Show password toggle', async () => {
    await renderLogin();

    expect(screen.getByRole('button', { name: 'Show password' })).toBeOnTheScreen();
  });
});

describe('submitting (US-2)', () => {
  it('us2_valid_credentials_sign_in_and_store_tokens_securely', async () => {
    await renderLogin();
    await fillIn(MOCK_EMAILS.full, MOCK_PASSWORD);

    await submit();

    await waitFor(() =>
      expect(screen.getByTestId('session-status')).toHaveTextContent('authenticated'),
    );
    expect(await tokenStore.getRefreshToken()).toBe(`mock-refresh-${MOCK_EMAILS.full}`);
  });

  it.each([
    ['wrong password', MOCK_EMAILS.full, 'wrong-password'],
    ['unknown email', 'nobody@subtrak.test', MOCK_PASSWORD],
  ])(
    'us2_%s_gets_the_same_message_and_keeps_the_form',
    async (_case, email, password) => {
      await renderLogin();
      await fillIn(email, password);

      await submit();

      expect(await screen.findByTestId('form-error')).toHaveTextContent(
        LOGIN_COPY.invalidCredentials,
      );
      expect(screen.getByTestId('login-email').props.value).toBe(email);
      expect(screen.getByTestId('session-status')).toHaveTextContent('unauthenticated');
    },
  );

  it('us2_locked_account_shows_the_lockout_message_and_disables_log_in', async () => {
    await renderLogin();
    await fillIn(MOCK_EMAILS.locked, MOCK_PASSWORD);

    await submit();

    expect(await screen.findByTestId('form-error')).toHaveTextContent(
      'Too many failed attempts. Try again in 15 minutes.',
    );
    expect(screen.getByTestId('login-submit')).toBeDisabled();
    expect(
      screen.getByText(`Try again in ${formatCountdown(RATE_LIMIT_FALLBACK_SECONDS)}`),
    ).toBeOnTheScreen();
  });

  it('clears the lockout banner and re-enables Log In when the countdown ends', async () => {
    await renderLogin();
    await fillIn(MOCK_EMAILS.locked, MOCK_PASSWORD);
    await submit();
    await screen.findByTestId('form-error');

    // Jump past the wait; the countdown's next one-second tick sees it.
    const later = Date.now() + (RATE_LIMIT_FALLBACK_SECONDS + 1) * 1000;
    const now = jest.spyOn(Date, 'now').mockReturnValue(later);
    try {
      await waitFor(() => expect(screen.queryByTestId('form-error')).toBeNull(), {
        timeout: 3000,
      });
      expect(screen.getByTestId('login-submit')).toBeEnabled();
      expect(screen.queryByText(/^Try again in/)).toBeNull();
    } finally {
      now.mockRestore();
    }
  });

  it('shows the message as a banner when a 400 names no field on this form', async () => {
    server.use(
      http.post('*/auth/login', () =>
        HttpResponse.json(
          {
            error: {
              code: 'validation_error',
              message: 'Something about this request is off.',
              fields: { non_field_errors: ['Something about this request is off.'] },
            },
          },
          { status: 400 },
        ),
      ),
    );
    await renderLogin();
    await fillIn(MOCK_EMAILS.full, MOCK_PASSWORD);

    await submit();

    expect(await screen.findByTestId('form-error')).toHaveTextContent(
      'Something about this request is off.',
    );
  });

  it('us2_unverified_account_goes_to_verify_email_sent_without_an_error', async () => {
    server.use(
      http.post('*/auth/login', () =>
        HttpResponse.json(
          { error: { code: 'email_not_verified', message: 'Verify your email first.' } },
          { status: 403 },
        ),
      ),
    );
    await renderLogin();
    await fillIn(MOCK_EMAILS.full, MOCK_PASSWORD);

    await submit();

    expect(await screen.findByTestId('stub')).toHaveTextContent(
      `VerifyEmailSent ${MOCK_EMAILS.full}`,
    );
  });

  it('us2_rate_limited_disables_log_in_with_a_countdown', async () => {
    server.use(
      http.post('*/auth/login', () =>
        HttpResponse.json(
          {
            error: {
              code: 'throttled',
              message: 'Too many attempts. Try again in 1 minutes.',
            },
          },
          { status: 429 },
        ),
      ),
    );
    await renderLogin();
    await fillIn(MOCK_EMAILS.full, MOCK_PASSWORD);

    await submit();

    expect(await screen.findByTestId('form-error')).toHaveTextContent(
      'Too many attempts. Try again in 1 minutes.',
    );
    expect(screen.getByTestId('login-submit')).toBeDisabled();
    expect(
      screen.getByText(`Try again in ${formatCountdown(RATE_LIMIT_FALLBACK_SECONDS)}`),
    ).toBeOnTheScreen();
  });

  it('us2_offline_shows_a_toast_and_keeps_what_was_typed', async () => {
    server.use(http.post('*/auth/login', () => HttpResponse.error()));
    await renderLogin();
    await fillIn(MOCK_EMAILS.full, MOCK_PASSWORD);

    await submit();

    expect(await screen.findByText(LOGIN_COPY.offline)).toBeOnTheScreen();
    expect(screen.getByTestId('login-email').props.value).toBe(MOCK_EMAILS.full);
    expect(screen.getByTestId('login-password').props.value).toBe(MOCK_PASSWORD);
    expect(screen.queryByTestId('form-error')).toBeNull();
    expect(screen.getByTestId('login-submit')).toBeEnabled();
  });

  it('shows field errors the server returns', async () => {
    server.use(
      http.post('*/auth/login', () =>
        HttpResponse.json(
          {
            error: {
              code: 'validation_error',
              message: 'Enter your password.',
              fields: { password: ['Enter your password.'] },
            },
          },
          { status: 400 },
        ),
      ),
    );
    await renderLogin();
    await fillIn(MOCK_EMAILS.full, ' ');

    await submit();

    expect(await screen.findByText('Enter your password.')).toBeOnTheScreen();
  });

  it('shows the server message for any other failure', async () => {
    server.use(
      http.post('*/auth/login', () =>
        HttpResponse.json(
          {
            error: { code: 'server_error', message: 'Something went wrong on our end.' },
          },
          { status: 500 },
        ),
      ),
    );
    await renderLogin();
    await fillIn(MOCK_EMAILS.full, MOCK_PASSWORD);

    await submit();

    expect(await screen.findByTestId('form-error')).toHaveTextContent(
      'Something went wrong on our end.',
    );
  });
});

describe('navigation', () => {
  it.each([
    ['login-forgot', 'ForgotPassword'],
    ['login-register', 'Register'],
  ])('%s opens %s', async (testID, route) => {
    await renderLogin();

    await fireEvent.press(screen.getByTestId(testID));

    expect(await screen.findByTestId('stub')).toHaveTextContent(route);
  });
});

describe('useCountdown', () => {
  it('formats minutes and seconds', () => {
    expect(formatCountdown(42)).toBe('0:42');
    expect(formatCountdown(125)).toBe('2:05');
  });

  it('counts down to zero and re-enables Log in', async () => {
    jest.useFakeTimers();
    try {
      const { result } = await renderHook(() => useCountdown());

      await act(() => result.current.start(2));
      expect(result.current.remaining).toBe(2);

      await act(() => jest.advanceTimersByTime(2000));
      expect(result.current.remaining).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });
});
