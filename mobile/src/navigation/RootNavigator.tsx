/**
 * The root navigator.
 *
 * What this is for
 *   Choosing between the auth stack and the app stack based on session status,
 *   and holding the splash while that is still being determined.
 *
 * Why the two stacks are mutually exclusive
 *   Only one is mounted at a time. Signing out unmounts the entire app stack,
 *   which discards its navigation history — so the back gesture cannot return a
 *   signed-out user to a screen full of their data. Rendering both and
 *   navigating between them would leave that history intact.
 *
 * Why there is no "redirect to login" anywhere in the app
 *   When a refresh token is rejected, the HTTP client calls `onRefreshFailed`,
 *   the session provider clears itself, `status` becomes 'unauthenticated', and
 *   this component swaps stacks. No screen contains logic for it, and there is
 *   no window in which a screen renders against a dead session.
 */
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { useSession } from '@/session/SessionContext';

import { AppNavigator } from './AppNavigator';
import { AuthNavigator } from './AuthNavigator';
import { linking } from './linking';
import { navigationTheme } from './theme';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  const { status } = useSession();

  // Still reading secure storage. Rendering nothing keeps the splash up rather
  // than flashing the login screen at a user who is in fact signed in.
  if (status === 'loading') {
    return null;
  }

  return (
    <NavigationContainer
      theme={navigationTheme}
      linking={linking}
      // Shown if the deep-link handler is resolving a cold-start URL. Null keeps
      // the splash rather than flashing an empty screen.
      fallback={null}
    >
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {status === 'authenticated' ? (
          <Stack.Screen name="App" component={AppNavigator} />
        ) : (
          <Stack.Screen name="Auth" component={AuthNavigator} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
