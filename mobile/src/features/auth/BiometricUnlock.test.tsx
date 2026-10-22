/**
 * Biometric unlock on Log In (05 §5, §12 "Biometric unlock works after first
 * successful login"), with expo-local-authentication mocked.
 */
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { http, HttpResponse } from 'msw';
import { Text } from 'react-native';

import type { AuthStackParamList } from '@/navigation/types';
import { biometricStore } from '@/session/biometricStore';
import { SessionProvider, useSession } from '@/session/SessionContext';
import { tokenStore } from '@/session/tokenStore';
import { MOCK_EMAILS } from '@/test/fixtures';
import { createTestQueryClient, renderWithProviders } from '@/test/render';
import { server } from '@/test/server';

import { LoginScreen } from './LoginScreen';
import { BIOMETRIC_PROMPT } from './useBiometricUnlock';

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

it('offline keeps the parked token for next time', async () => {
  server.use(http.post('*/auth/refresh', () => HttpResponse.error()));
  device();
  await afterASignOut();
  auth.authenticateAsync.mockResolvedValue({ success: true });

  await renderLogin();

  await waitFor(() => expect(auth.authenticateAsync).toHaveBeenCalled());
  await waitFor(() => expect(screen.getByTestId('login-biometric')).toBeEnabled());
  expect(await biometricStore.parkedRefreshToken()).toBe(PARKED);
});

describe('session layer', () => {
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
});
