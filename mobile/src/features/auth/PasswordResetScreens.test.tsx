/**
 * The password-reset flow (05 §1, §4, §8; US-3): Forgot your password?, Check
 * your email, Create a new password, Password updated. Against the shared
 * mock routes.
 */
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { fireEvent, screen } from '@testing-library/react-native';
import { http, HttpResponse } from 'msw';
import { Linking, Text } from 'react-native';

import type { AuthStackParamList } from '@/navigation/types';
import { createTestQueryClient, renderWithProviders } from '@/test/render';
import { server } from '@/test/server';

import { CreateNewPasswordScreen, NEW_PASSWORD_COPY } from './CreateNewPasswordScreen';
import { FORGOT_COPY, ForgotPasswordScreen } from './ForgotPasswordScreen';
import {
  PasswordResetSuccessScreen,
  RESET_SUCCESS_COPY,
} from './PasswordResetSuccessScreen';
import { RESET_SENT_COPY, ResetLinkSentScreen } from './ResetLinkSentScreen';
import { PASSWORD_RULE } from './validation';

const Stack = createNativeStackNavigator<AuthStackParamList>();

function LoginStub() {
  return <Text testID="stub">Login</Text>;
}

/** The real reset screens, behind a stub Log In, starting where a test says. */
async function renderFlow<R extends keyof AuthStackParamList>(
  route: R,
  params?: AuthStackParamList[R],
) {
  await renderWithProviders(
    <NavigationContainer>
      <Stack.Navigator initialRouteName={route} screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Login" component={LoginStub} />
        <Stack.Screen
          name="ForgotPassword"
          component={ForgotPasswordScreen}
          initialParams={route === 'ForgotPassword' ? (params as object) : undefined}
        />
        <Stack.Screen
          name="ResetLinkSent"
          component={ResetLinkSentScreen}
          initialParams={route === 'ResetLinkSent' ? (params as object) : undefined}
        />
        <Stack.Screen
          name="CreateNewPassword"
          component={CreateNewPasswordScreen}
          initialParams={route === 'CreateNewPassword' ? (params as object) : undefined}
        />
        <Stack.Screen
          name="PasswordResetSuccess"
          component={PasswordResetSuccessScreen}
        />
      </Stack.Navigator>
    </NavigationContainer>,
    { queryClient: createTestQueryClient() },
  );
}

describe('Forgot your password? (Figma "Forgot Password")', () => {
  it('matches the frame copy', async () => {
    await renderFlow('ForgotPassword');

    expect(screen.getByRole('header', { name: FORGOT_COPY.title })).toBeOnTheScreen();
    expect(screen.getByText(FORGOT_COPY.subtitle)).toBeOnTheScreen();
    expect(screen.getByPlaceholderText('you@example.com')).toBeOnTheScreen();
    expect(screen.getByTestId('forgot-submit')).toBeDisabled();
  });

  it('us3_any_valid_email_moves_on_to_check_your_email', async () => {
    await renderFlow('ForgotPassword');
    await fireEvent.changeText(screen.getByTestId('forgot-email'), 'anyone@subtrak.test');

    await fireEvent.press(screen.getByTestId('forgot-submit'));

    expect(await screen.findByText('anyone@subtrak.test')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: RESET_SENT_COPY.title })).toBeOnTheScreen();
  });

  it('flags an invalid email after blur', async () => {
    await renderFlow('ForgotPassword');
    await fireEvent.changeText(screen.getByTestId('forgot-email'), 'nope');
    await fireEvent(screen.getByTestId('forgot-email'), 'blur');

    expect(screen.getByText(FORGOT_COPY.invalidEmail)).toBeOnTheScreen();
  });

  it('is prefilled when it comes back from Wrong email?', async () => {
    await renderFlow('ForgotPassword', { email: 'typo@subtrak.test' });

    expect(screen.getByTestId('forgot-email').props.value).toBe('typo@subtrak.test');
  });

  it.each([
    [429, 'throttled', 'Too many requests. Try again shortly.'],
    [500, 'server_error', 'Down.'],
  ])('shows a %s above the button', async (status, code, message) => {
    server.use(
      http.post('*/auth/password-reset/request', () =>
        HttpResponse.json({ error: { code, message } }, { status }),
      ),
    );
    await renderFlow('ForgotPassword');
    await fireEvent.changeText(screen.getByTestId('forgot-email'), 'a@subtrak.test');

    await fireEvent.press(screen.getByTestId('forgot-submit'));

    expect(await screen.findByTestId('form-error')).toHaveTextContent(message);
  });

  it('shows a toast when offline', async () => {
    server.use(http.post('*/auth/password-reset/request', () => HttpResponse.error()));
    await renderFlow('ForgotPassword');
    await fireEvent.changeText(screen.getByTestId('forgot-email'), 'a@subtrak.test');

    await fireEvent.press(screen.getByTestId('forgot-submit'));

    expect(await screen.findByText(FORGOT_COPY.offline)).toBeOnTheScreen();
  });

  it('Back to Log In', async () => {
    await renderFlow('ForgotPassword');

    await fireEvent.press(screen.getByTestId('forgot-back-to-login'));

    expect(await screen.findByTestId('stub')).toHaveTextContent('Login');
  });
});

describe('Check your email, reset (05 §4 over the frame)', () => {
  it('makes Open Mail app the primary, not Resend Reset Link', async () => {
    await renderFlow('ResetLinkSent', { email: 'a@subtrak.test' });

    const labels = screen.getAllByRole('button').map((b) => b.props.accessibilityLabel);
    expect(labels).toEqual(['Open Mail app', 'Resend', 'Wrong email?', 'Back to Log In']);
    expect(screen.getByText(/We sent a password reset link to/)).toBeOnTheScreen();
  });

  it('us3_resend_shows_the_frame_toast_and_counts_down', async () => {
    server.use(
      http.post('*/auth/password-reset/request', () =>
        HttpResponse.json({ cooldown_seconds: 30 }),
      ),
    );
    await renderFlow('ResetLinkSent', { email: 'a@subtrak.test' });

    await fireEvent.press(screen.getByTestId('reset-resend'));

    expect(await screen.findByText(RESET_SENT_COPY.resent)).toBeOnTheScreen();
    expect(screen.getByText('Resend in 0:30')).toBeOnTheScreen();
    expect(screen.getByTestId('reset-resend')).toBeDisabled();
  });

  it.each([
    [429, 'throttled', 'Slow down.'],
    [500, 'server_error', 'Down.'],
  ])('shows a %s', async (status, code, message) => {
    server.use(
      http.post('*/auth/password-reset/request', () =>
        HttpResponse.json({ error: { code, message } }, { status }),
      ),
    );
    await renderFlow('ResetLinkSent', { email: 'a@subtrak.test' });

    await fireEvent.press(screen.getByTestId('reset-resend'));

    expect(await screen.findByTestId('form-error')).toHaveTextContent(message);
  });

  it('shows a toast when offline, and when no mail app opens', async () => {
    server.use(http.post('*/auth/password-reset/request', () => HttpResponse.error()));
    const open = jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('none'));
    await renderFlow('ResetLinkSent', { email: 'a@subtrak.test' });

    await fireEvent.press(screen.getByTestId('reset-resend'));
    expect(await screen.findByText(RESET_SENT_COPY.offline)).toBeOnTheScreen();

    await fireEvent.press(screen.getByTestId('reset-open-mail'));
    expect(await screen.findByText(RESET_SENT_COPY.mailUnavailable)).toBeOnTheScreen();
    open.mockRestore();
  });

  it('Wrong email? goes back with the address filled in', async () => {
    await renderFlow('ResetLinkSent', { email: 'typo@subtrak.test' });

    await fireEvent.press(screen.getByTestId('reset-wrong-email'));

    expect(
      await screen.findByRole('header', { name: FORGOT_COPY.title }),
    ).toBeOnTheScreen();
    expect(screen.getByTestId('forgot-email').props.value).toBe('typo@subtrak.test');
  });

  it('Back to Log In', async () => {
    await renderFlow('ResetLinkSent', { email: 'a@subtrak.test' });

    await fireEvent.press(screen.getByTestId('reset-back-to-login'));

    expect(await screen.findByTestId('stub')).toHaveTextContent('Login');
  });
});

describe('Create a new password (05 §8)', () => {
  const enter = async (password: string) => {
    await fireEvent.changeText(screen.getByTestId('new-password'), password);
    await fireEvent.press(screen.getByTestId('new-password-submit'));
  };

  it('us3_has_one_field_with_the_length_rule_and_no_confirm', async () => {
    await renderFlow('CreateNewPassword', { token: 'good' });

    expect(
      screen.getByRole('header', { name: NEW_PASSWORD_COPY.title }),
    ).toBeOnTheScreen();
    expect(screen.getByText(PASSWORD_RULE)).toBeOnTheScreen();
    expect(screen.queryByText(/confirm/i)).toBeNull();
    expect(screen.getByRole('button', { name: 'Show password' })).toBeOnTheScreen();
  });

  it('us3_short_password_errors_on_submit', async () => {
    await renderFlow('CreateNewPassword', { token: 'good' });

    await enter('short');

    expect(screen.getByTestId('new-password-error')).toHaveTextContent(PASSWORD_RULE);
  });

  it('us3_success_replaces_the_screen_with_password_updated', async () => {
    await renderFlow('CreateNewPassword', { token: 'good' });

    await enter('longenough');

    expect(
      await screen.findByRole('header', { name: RESET_SUCCESS_COPY.title }),
    ).toBeOnTheScreen();
    // Terminal: no back into the spent link.
    expect(screen.queryByTestId('auth-back')).toBeNull();
    await fireEvent.press(screen.getByTestId('reset-success-login'));
    expect(await screen.findByTestId('stub')).toHaveTextContent('Login');
  });

  it.each([
    ['token_expired', NEW_PASSWORD_COPY.expired],
    ['token_invalid', NEW_PASSWORD_COPY.used],
  ])('us3_%s_says_so_and_offers_a_new_link', async (code, title) => {
    server.use(
      http.post('*/auth/password-reset/confirm', () =>
        HttpResponse.json({ error: { code, message: 'x' } }, { status: 400 }),
      ),
    );
    await renderFlow('CreateNewPassword', { token: 'old' });

    await enter('longenough');

    expect(await screen.findByRole('header', { name: title })).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('new-password-request-again'));
    expect(
      await screen.findByRole('header', { name: FORGOT_COPY.title }),
    ).toBeOnTheScreen();
  });

  it('the expired-link state also leads back to Log In', async () => {
    await renderFlow('CreateNewPassword', { token: 'expired' });

    await enter('longenough');
    await fireEvent.press(await screen.findByTestId('new-password-back-to-login'));

    expect(await screen.findByTestId('stub')).toHaveTextContent('Login');
  });

  it('shows a server field message under the field', async () => {
    server.use(
      http.post('*/auth/password-reset/confirm', () =>
        HttpResponse.json(
          {
            error: {
              code: 'validation_error',
              message: 'Too common.',
              fields: { password: ['Too common.'] },
            },
          },
          { status: 400 },
        ),
      ),
    );
    await renderFlow('CreateNewPassword', { token: 'good' });

    await enter('password123');

    expect(await screen.findByTestId('new-password-error')).toHaveTextContent(
      'Too common.',
    );
  });

  it('shows any other failure above the button, and a toast when offline', async () => {
    server.use(
      http.post('*/auth/password-reset/confirm', () =>
        HttpResponse.json(
          { error: { code: 'server_error', message: 'Down.' } },
          { status: 500 },
        ),
      ),
    );
    await renderFlow('CreateNewPassword', { token: 'good' });
    await enter('longenough');
    expect(await screen.findByTestId('form-error')).toHaveTextContent('Down.');

    server.use(http.post('*/auth/password-reset/confirm', () => HttpResponse.error()));
    await fireEvent.press(screen.getByTestId('new-password-submit'));
    expect(await screen.findByText(NEW_PASSWORD_COPY.offline)).toBeOnTheScreen();
    expect(screen.getByTestId('new-password').props.value).toBe('longenough');
  });
});
