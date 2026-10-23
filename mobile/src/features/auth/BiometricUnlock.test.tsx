/**
 * Biometric unlock on Log In (05 §5, §12 "Biometric unlock works after first
 * successful login"), with expo-local-authentication mocked.
 */
import { NavigationContainer, useNavigation } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { http, HttpResponse } from 'msw';
import { AppState, Text, type AppStateStatus } from 'react-native';

import type { AuthStackParamList } from '@/navigation/types';
import { biometricStore } from '@/session/biometricStore';
import { SessionProvider, useSession } from '@/session/SessionContext';
import { tokenStore } from '@/session/tokenStore';
import { MOCK_EMAILS } from '@/test/fixtures';
import { createTestQueryClient, renderWithProviders } from '@/test/render';
import { server } from '@/test/server';

import { LoginScreen } from './LoginScreen';
import {
  BIOMETRIC_OFFLINE,
  BIOMETRIC_PROMPT,
  resetBiometricAutoPrompt,
} from './useBiometricUnlock';

jest.mock('expo-local-authentication', () => ({
  AuthenticationType: { FINGERPRINT: 1, FACIAL_RECOGNITION: 2, IRIS: 3 },
  hasHardwareAsync: jest.fn(),
  isEnrolledAsync: jest.fn(),
  supportedAuthenticationTypesAsync: jest.fn(),
  authenticateAsync: jest.fn(),
}));

const auth = jest.mocked(LocalAuthentication);
const PARKED = `mock-refresh-${MOCK_EMAILS.full}`;
const Stack = createNativeStackNavigator<AuthStackParamList>();

function Status() {
  return <Text testID="session-status">{useSession().status}</Text>;
}

function SignOutButton() {
  const { signIn, signOut } = useSession();
  return (
    <>
      <Text
        testID="test-sign-in"
        onPress={() => signIn({ access: 'a', refresh: 'fresh-refresh' })}
      >
        sign in
      </Text>
      <Text testID="test-sign-out" onPress={() => signOut()}>
        sign out
      </Text>
      <Text testID="test-abandon" onPress={() => signOut({ park: false })}>
        abandon
      </Text>
    </>
  );
}

async function renderLogin() {
  await renderWithProviders(
    <SessionProvider>
      <Status />
      <SignOutButton />
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Login" component={LoginScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </SessionProvider>,
    { queryClient: createTestQueryClient() },
  );
  await waitFor(() =>
    expect(screen.getByTestId('session-status')).not.toHaveTextContent('loading'),
  );
}

/** A device that had a session and signed out: the token is parked. */
async function afterASignOut() {
  await biometricStore.markEstablished();
  await biometricStore.park(PARKED);
}

function device({ hardware = true, enrolled = true, face = true } = {}) {
  auth.hasHardwareAsync.mockResolvedValue(hardware);
  auth.isEnrolledAsync.mockResolvedValue(enrolled);
  auth.supportedAuthenticationTypesAsync.mockResolvedValue(
    face
      ? [LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION]
      : [LocalAuthentication.AuthenticationType.FINGERPRINT],
  );
}

beforeEach(async () => {
  jest.clearAllMocks();
  await tokenStore.clear();
  await biometricStore.forget();
  auth.authenticateAsync.mockResolvedValue({ success: false, error: 'user_cancel' });
  resetBiometricAutoPrompt();
});

/** Stands in for Register, with a way back to Log In. */
function RegisterStub() {
  const navigation = useNavigation();
  return (
    <Text testID="go-back" onPress={() => navigation.goBack()}>
      back
    </Text>
  );
}

it('after a cancel, coming back to Log In does not prompt again until the app reopens', async () => {
  let onAppState: ((next: AppStateStatus) => void) | undefined;
  const listen = jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation((_type, handler) => {
      onAppState = handler as (next: AppStateStatus) => void;
      return { remove: jest.fn() } as unknown as ReturnType<
        typeof AppState.addEventListener
      >;
    });
  device();
  await afterASignOut();
  await renderWithProviders(
    <SessionProvider>
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="Register" component={RegisterStub} />
        </Stack.Navigator>
      </NavigationContainer>
    </SessionProvider>,
    { queryClient: createTestQueryClient() },
  );
  // The first focus prompts; the user cancels.
  await waitFor(() => expect(auth.authenticateAsync).toHaveBeenCalledTimes(1));
  expect(await screen.findByTestId('login-biometric')).toBeEnabled();

  // Away and back: no second automatic prompt, but the button is still there.
  await fireEvent.press(screen.getByTestId('login-register'));
  await fireEvent.press(await screen.findByTestId('go-back'));
  expect(await screen.findByTestId('login-biometric')).toBeOnTheScreen();
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(auth.authenticateAsync).toHaveBeenCalledTimes(1);

  // Backgrounded and reopened: the next focus prompts again.
  await act(async () => {
    onAppState?.('background');
    onAppState?.('active');
  });
  await fireEvent.press(screen.getByTestId('login-register'));
  await fireEvent.press(await screen.findByTestId('go-back'));
  await waitFor(() => expect(auth.authenticateAsync).toHaveBeenCalledTimes(2));
  listen.mockRestore();
});

it('does not prompt when no biometric is enrolled', async () => {
  device({ enrolled: false });
  await afterASignOut();

  await renderLogin();

  await waitFor(() => expect(auth.isEnrolledAsync).toHaveBeenCalled());
  expect(auth.authenticateAsync).not.toHaveBeenCalled();
  expect(screen.queryByTestId('login-biometric')).toBeNull();
});

it('does not prompt without hardware', async () => {
  device({ hardware: false });
  await afterASignOut();

  await renderLogin();

  await waitFor(() => expect(auth.hasHardwareAsync).toHaveBeenCalled());
  expect(auth.authenticateAsync).not.toHaveBeenCalled();
});

it('does not prompt on a device that never had a session', async () => {
  device();

  await renderLogin();

  expect(auth.authenticateAsync).not.toHaveBeenCalled();
  expect(screen.queryByTestId('login-biometric')).toBeNull();
});

it('us2_biometric_after_first_login_prompts_and_restores_the_session', async () => {
  device();
  await afterASignOut();
  auth.authenticateAsync.mockResolvedValue({ success: true });

  await renderLogin();

  await waitFor(() =>
    expect(screen.getByTestId('session-status')).toHaveTextContent('authenticated'),
  );
  expect(auth.authenticateAsync).toHaveBeenCalledWith(
    expect.objectContaining({ promptMessage: BIOMETRIC_PROMPT }),
  );
  expect(await tokenStore.getRefreshToken()).toBe(PARKED);
});

it('cancelling leaves the form, with no error, and a button to try again', async () => {
  device();
  await afterASignOut();

  await renderLogin();

  await waitFor(() => expect(auth.authenticateAsync).toHaveBeenCalledTimes(1));
  expect(
    await screen.findByRole('button', { name: 'Log in with Face ID' }),
  ).toBeOnTheScreen();
  expect(screen.queryByTestId('form-error')).toBeNull();
  expect(screen.getByTestId('login-email')).toBeOnTheScreen();
  expect(screen.getByTestId('session-status')).toHaveTextContent('unauthenticated');

  auth.authenticateAsync.mockResolvedValue({ success: true });
  await fireEvent.press(screen.getByTestId('login-biometric'));
  await waitFor(() =>
    expect(screen.getByTestId('session-status')).toHaveTextContent('authenticated'),
  );
});

it('names Touch ID on a fingerprint device', async () => {
  device({ face: false });
  await afterASignOut();

  await renderLogin();

  expect(
    await screen.findByRole('button', { name: 'Log in with Touch ID' }),
  ).toBeOnTheScreen();
});

it('a rejected refresh clears the stored state and shows only the form', async () => {
  server.use(
    http.post('*/auth/refresh', () =>
      HttpResponse.json(
        { error: { code: 'token_invalid', message: 'Your session has expired.' } },
        { status: 401 },
      ),
    ),
  );
  device();
  await afterASignOut();
  auth.authenticateAsync.mockResolvedValue({ success: true });

  await renderLogin();

  await waitFor(() => expect(screen.queryByTestId('login-biometric')).toBeNull());
  expect(await biometricStore.isEstablished()).toBe(false);
  expect(await biometricStore.parkedRefreshToken()).toBeNull();
  expect(screen.queryByTestId('form-error')).toBeNull();
  expect(screen.getByTestId('session-status')).toHaveTextContent('unauthenticated');
});

it('offline keeps the parked token for next time, and says why', async () => {
  server.use(http.post('*/auth/refresh', () => HttpResponse.error()));
  device();
  await afterASignOut();
  auth.authenticateAsync.mockResolvedValue({ success: true });

  await renderLogin();

  await waitFor(() => expect(auth.authenticateAsync).toHaveBeenCalled());
  await waitFor(() => expect(screen.getByTestId('login-biometric')).toBeEnabled());
  expect(await screen.findByText(BIOMETRIC_OFFLINE)).toBeOnTheScreen();
  expect(await biometricStore.parkedRefreshToken()).toBe(PARKED);
});

it('a login lockout countdown also disables biometric unlock', async () => {
  server.use(
    http.post('*/auth/login', () =>
      HttpResponse.json(
        {
          error: {
            code: 'account_locked',
            message: 'Too many attempts. Try again in 15 minutes.',
          },
        },
        { status: 423 },
      ),
    ),
  );
  device();
  await afterASignOut();

  await renderLogin();
  // The auto-prompt is cancelled by default, so biometric sits enabled first.
  await waitFor(() => expect(auth.authenticateAsync).toHaveBeenCalled());
  expect(screen.getByTestId('login-biometric')).toBeEnabled();

  await fireEvent.changeText(screen.getByTestId('login-email'), 'alex@example.com');
  await fireEvent.changeText(screen.getByTestId('login-password'), 'whatever1!');
  await fireEvent.press(screen.getByTestId('login-submit'));

  // Locked out behind the countdown: the parked session cannot sidestep it.
  await waitFor(() => expect(screen.getByTestId('login-biometric')).toBeDisabled());
});

describe('session layer', () => {
  it('restoreParked goes through the single-flight refresh: two at once, one request', async () => {
    let refreshes = 0;
    server.use(
      http.post('*/auth/refresh', async () => {
        refreshes += 1;
        await new Promise((resolve) => setTimeout(resolve, 30));
        return HttpResponse.json({
          access: `mock-access-${MOCK_EMAILS.full}`,
          refresh: `mock-refresh-${MOCK_EMAILS.full}`,
        });
      }),
    );
    await afterASignOut();

    function RestoreTwice() {
      const { restoreParked, status } = useSession();
      return (
        <Text
          testID="restore-twice"
          onPress={() => {
            void restoreParked();
            void restoreParked();
          }}
        >
          {status}
        </Text>
      );
    }
    await renderWithProviders(
      <SessionProvider>
        <RestoreTwice />
      </SessionProvider>,
      { queryClient: createTestQueryClient() },
    );
    await waitFor(() =>
      expect(screen.getByTestId('restore-twice')).toHaveTextContent('unauthenticated'),
    );

    await fireEvent.press(screen.getByTestId('restore-twice'));

    await waitFor(() =>
      expect(screen.getByTestId('restore-twice')).toHaveTextContent('authenticated'),
    );
    expect(refreshes).toBe(1);
    expect(await tokenStore.getRefreshToken()).toBe(`mock-refresh-${MOCK_EMAILS.full}`);
    expect(await biometricStore.parkedRefreshToken()).toBeNull();
  });

  it('signing in marks the device; signing out parks the refresh token', async () => {
    device({ enrolled: false });
    await renderLogin();

    await fireEvent.press(screen.getByTestId('test-sign-in'));
    await waitFor(() =>
      expect(screen.getByTestId('session-status')).toHaveTextContent('authenticated'),
    );
    expect(await biometricStore.isEstablished()).toBe(true);
    expect(await biometricStore.parkedRefreshToken()).toBeNull();

    await fireEvent.press(screen.getByTestId('test-sign-out'));
    await waitFor(() =>
      expect(screen.getByTestId('session-status')).toHaveTextContent('unauthenticated'),
    );
    expect(await biometricStore.parkedRefreshToken()).toBe('fresh-refresh');
    expect(await tokenStore.getRefreshToken()).toBeNull();
  });

  it('does not park anything on a device that never signed in', async () => {
    await biometricStore.park('stray');

    expect(await biometricStore.parkedRefreshToken()).toBeNull();
  });

  it('abandoning the session discards the token instead of parking it', async () => {
    device({ enrolled: false });
    await renderLogin();

    await fireEvent.press(screen.getByTestId('test-sign-in'));
    await waitFor(() =>
      expect(screen.getByTestId('session-status')).toHaveTextContent('authenticated'),
    );

    await fireEvent.press(screen.getByTestId('test-abandon'));
    await waitFor(() =>
      expect(screen.getByTestId('session-status')).toHaveTextContent('unauthenticated'),
    );
    expect(await biometricStore.parkedRefreshToken()).toBeNull();
    expect(await tokenStore.getRefreshToken()).toBeNull();
  });
});
