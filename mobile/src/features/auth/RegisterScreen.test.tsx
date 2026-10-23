/**
 * Create your account (05 §3, §9, §11; US-1), against the shared mock routes.
 */
import { NavigationContainer, useRoute } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { http, HttpResponse } from 'msw';
import { Linking, Text } from 'react-native';

import type { AuthStackParamList } from '@/navigation/types';
import { MOCK_EMAILS, MOCK_PASSWORD } from '@/test/fixtures';
import { createTestQueryClient, renderWithProviders } from '@/test/render';
import { server } from '@/test/server';
import { sizes } from '@/theme';

import { REGISTER_COPY, RegisterScreen, PRIVACY_URL, TERMS_URL } from './RegisterScreen';
import { RATE_LIMIT_FALLBACK_SECONDS } from './useCountdown';
import { PASSWORD_RULE } from './validation';

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

async function renderRegister({ pushed = true } = {}) {
  await renderWithProviders(
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName={pushed ? 'Login' : 'Register'}
        screenOptions={{ headerShown: false }}
      >
        <Stack.Screen name="Login" component={pushed ? PushRegister : Stub} />
        <Stack.Screen name="Register" component={RegisterScreen} />
        <Stack.Screen name="VerifyEmailSent" component={Stub} />
      </Stack.Navigator>
    </NavigationContainer>,
    { queryClient: createTestQueryClient() },
  );
  await screen.findByTestId('register-screen');
}

/** Stands in for Log In and immediately pushes Register over it. */
function PushRegister({
  navigation,
}: {
  navigation: { navigate: (r: 'Register') => void };
}) {
  navigation.navigate('Register');
  return <Text testID="stub">Login</Text>;
}

async function fillIn(email: string, password: string, agree = true) {
  await fireEvent.changeText(screen.getByTestId('register-email'), email);
  await fireEvent(screen.getByTestId('register-email'), 'blur');
  await fireEvent.changeText(screen.getByTestId('register-password'), password);
  if (agree) await fireEvent.press(screen.getByTestId('register-terms'));
}

const submit = () => fireEvent.press(screen.getByTestId('register-submit'));

describe('layout (05 §3)', () => {
  it('us1_has_no_confirm_field_and_no_rule_checklist', async () => {
    await renderRegister();

    expect(screen.getByRole('header', { name: REGISTER_COPY.title })).toBeOnTheScreen();
    expect(screen.queryByText(/confirm password/i)).toBeNull();
    expect(screen.queryByText(/uppercase|special character|one number/i)).toBeNull();
    // The one rule, as helper text.
    expect(screen.getByText(PASSWORD_RULE)).toBeOnTheScreen();
  });

  it('shows Back to Log In when pushed over Log In', async () => {
    await renderRegister();
    expect(screen.getByRole('button', { name: 'Back to Log In' })).toBeOnTheScreen();
  });

  it('has no back button when it is the first screen', async () => {
    await renderRegister({ pushed: false });
    expect(screen.queryByTestId('auth-back')).toBeNull();
  });

  it('announces the terms as a checkbox and the documents as links', async () => {
    await renderRegister();
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);

    expect(
      screen.getByRole('checkbox', { name: 'I agree to the Terms and Privacy Policy' }),
    ).not.toBeChecked();
    await fireEvent.press(screen.getByTestId('register-terms-link'));
    await fireEvent.press(screen.getByTestId('register-privacy-link'));

    expect(open).toHaveBeenNthCalledWith(1, TERMS_URL);
    expect(open).toHaveBeenNthCalledWith(2, PRIVACY_URL);
    open.mockRestore();
  });
});

describe('form (05 §3, §9)', () => {
  it('us1_create_account_disabled_until_terms_are_ticked', async () => {
    await renderRegister();

    await fillIn('new@subtrak.test', MOCK_PASSWORD, false);
    expect(screen.getByTestId('register-submit')).toBeDisabled();

    await fireEvent.press(screen.getByTestId('register-terms'));
    expect(screen.getByRole('checkbox')).toBeChecked();
    expect(screen.getByTestId('register-submit')).toBeEnabled();
  });

  it('us1_invalid_email_shows_inline_after_blur', async () => {
    await renderRegister();

    await fillIn('nope', MOCK_PASSWORD);

    expect(screen.getByText(REGISTER_COPY.invalidEmail)).toBeOnTheScreen();
    expect(screen.getByTestId('register-submit')).toBeDisabled();
  });

  it('us1_short_password_turns_the_helper_into_an_error_on_submit_not_while_typing', async () => {
    await renderRegister();
    await fillIn('new@subtrak.test', 'short');

    // While typing, it is still the helper: announced as a hint, not an error.
    expect(screen.getByTestId('register-password').props.accessibilityHint).toBe(
      PASSWORD_RULE,
    );
    await submit();

    expect(screen.getByTestId('register-password-error')).toHaveTextContent(
      PASSWORD_RULE,
    );
    expect(screen.queryByTestId('stub')).toBeNull();
  });
});

describe('submitting (US-1)', () => {
  it('us1_success_goes_to_verify_email_sent_with_the_email', async () => {
    await renderRegister();
    await fillIn('new@subtrak.test', MOCK_PASSWORD);

    await submit();

    expect(await screen.findByText('VerifyEmailSent new@subtrak.test')).toBeOnTheScreen();
  });

  it('us1_duplicate_email_shows_inline_with_a_way_to_log_in', async () => {
    await renderRegister();
    await fillIn(MOCK_EMAILS.full, MOCK_PASSWORD);

    await submit();

    expect(await screen.findByText(REGISTER_COPY.duplicateEmail)).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('register-duplicate-login'));
    expect(await screen.findByText('Login')).toBeOnTheScreen();
  });

  it('shows the server field messages', async () => {
    server.use(
      http.post('*/auth/register', () =>
        HttpResponse.json(
          {
            error: {
              code: 'validation_error',
              message: 'Use at least 8 characters.',
              fields: { password: ['Use at least 8 characters.'] },
            },
          },
          { status: 400 },
        ),
      ),
    );
    await renderRegister();
    await fillIn('new@subtrak.test', MOCK_PASSWORD);

    await submit();

    expect(await screen.findByTestId('register-password-error')).toHaveTextContent(
      'Use at least 8 characters.',
    );
  });

  it('us1_any_password_of_8_characters_is_accepted', async () => {
    await renderRegister();
    // No digit and no symbol: the rule is length only (05 §3).
    await fillIn('new@subtrak.test', 'longenough');

    await submit();

    expect(await screen.findByText('VerifyEmailSent new@subtrak.test')).toBeOnTheScreen();
  });

  it('shows the message as a banner when a 400 names no field on this form', async () => {
    server.use(
      http.post('*/auth/register', () =>
        HttpResponse.json(
          {
            error: {
              code: 'validation_error',
              message: 'Registration is closed right now.',
              fields: {},
            },
          },
          { status: 400 },
        ),
      ),
    );
    await renderRegister();
    await fillIn('new@subtrak.test', MOCK_PASSWORD);

    await submit();

    expect(await screen.findByTestId('form-error')).toHaveTextContent(
      'Registration is closed right now.',
    );
  });

  it('clears the rate-limit banner when the countdown ends', async () => {
    server.use(
      http.post('*/auth/register', () =>
        HttpResponse.json(
          { error: { code: 'throttled', message: 'Too many attempts.' } },
          { status: 429 },
        ),
      ),
    );
    await renderRegister();
    await fillIn('new@subtrak.test', MOCK_PASSWORD);
    await submit();
    await screen.findByTestId('form-error');

    const later = Date.now() + (RATE_LIMIT_FALLBACK_SECONDS + 1) * 1000;
    const now = jest.spyOn(Date, 'now').mockReturnValue(later);
    try {
      await waitFor(() => expect(screen.queryByTestId('form-error')).toBeNull(), {
        timeout: 3000,
      });
      expect(screen.getByTestId('register-submit')).toBeEnabled();
    } finally {
      now.mockRestore();
    }
  });

  it('us1_rate_limited_waits_out_a_countdown', async () => {
    server.use(
      http.post('*/auth/register', () =>
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
    await renderRegister();
    await fillIn('new@subtrak.test', MOCK_PASSWORD);

    await submit();

    expect(await screen.findByTestId('form-error')).toBeOnTheScreen();
    expect(screen.getByText('Try again in 1:00')).toBeOnTheScreen();
    expect(screen.getByTestId('register-submit')).toBeDisabled();
  });

  it('us1_offline_shows_a_toast_and_keeps_the_form', async () => {
    server.use(http.post('*/auth/register', () => HttpResponse.error()));
    await renderRegister();
    await fillIn('new@subtrak.test', MOCK_PASSWORD);

    await submit();

    expect(await screen.findByText(REGISTER_COPY.offline)).toBeOnTheScreen();
    expect(screen.getByTestId('register-email').props.value).toBe('new@subtrak.test');
    expect(screen.getByRole('checkbox')).toBeChecked();
  });

  it('shows any other server message above the button', async () => {
    server.use(
      http.post('*/auth/register', () =>
        HttpResponse.json(
          {
            error: { code: 'server_error', message: 'Something went wrong on our end.' },
          },
          { status: 500 },
        ),
      ),
    );
    await renderRegister();
    await fillIn('new@subtrak.test', MOCK_PASSWORD);

    await submit();

    expect(await screen.findByTestId('form-error')).toHaveTextContent(
      'Something went wrong on our end.',
    );
  });
});

it('gives the Terms and Privacy links a 44pt touch target', async () => {
  await renderRegister();

  for (const id of ['register-terms-link', 'register-privacy-link', 'register-terms']) {
    const { hitSlop } = screen.getByTestId(id).props;
    expect(sizes.icon + 2 * hitSlop).toBeGreaterThanOrEqual(sizes.minTouch);
  }
});

describe('navigation', () => {
  it('the footer Log In goes back to Log In', async () => {
    await renderRegister();

    await fireEvent.press(screen.getByTestId('register-login'));

    expect(await screen.findByText('Login')).toBeOnTheScreen();
  });
});
