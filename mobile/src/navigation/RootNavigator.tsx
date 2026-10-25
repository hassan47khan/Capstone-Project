/**
 * The root navigator (handoff 03 §5, §6).
 *
 * What this is for
 *   Choosing between the Auth stack and the App stack from the auth gate's
 *   decision, holding the splash until that decision is made, and replaying a
 *   deep link that arrived while the user was signed out.
 *
 * The gate (see src/session/useAuthGate.ts for the five cases)
 *   splash  → render nothing: Expo's splash stays up, so there is never a flash
 *             of Log in on the way to Home
 *   auth    → Auth stack at Login
 *   verify  → Auth stack at VerifyEmailSent
 *   app     → App stack, on the Home tab
 *
 * Why the two stacks are mutually exclusive
 *   Only one is mounted at a time. Signing out unmounts the entire app stack,
 *   which discards its navigation history — so the back gesture cannot return a
 *   signed-out user to a screen full of their data.
 *
 * Why there is no "redirect to login" anywhere in the app
 *   When a refresh token is rejected, the session provider clears itself, the
 *   gate says 'auth', and this component swaps stacks. No screen contains logic
 *   for it.
 */
import { NavigationContainer, useNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo } from 'react';

import { useAuthGate } from '@/session/useAuthGate';
import { useTheme } from '@/theme';

import { AppNavigator } from './AppNavigator';
import { AuthNavigator } from './AuthNavigator';
import { linking } from './linking';
import { takePendingAuthRoute } from './pendingAuthRoute';
import { setAppMounted, takePendingLink } from './pendingLink';
import { getNavigationTheme } from './theme';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

function AuthAtLogin() {
  return <AuthNavigator initialRouteName="Login" />;
}

function AuthAtVerify() {
  return <AuthNavigator initialRouteName="VerifyEmailSent" />;
}

export function RootNavigator() {
  const decision = useAuthGate();
  const navigationRef = useNavigationContainerRef<RootStackParamList>();
  const { colors, scheme } = useTheme();
  const navigationTheme = useMemo(
    () => getNavigationTheme(colors, scheme),
    [colors, scheme],
  );

  // Set during render, not in an effect, so the linking handlers see the right
  // value even for a cold-start URL resolved on the very first pass.
  setAppMounted(decision === 'app');

  /** Opens a deep link parked while the user was signed out (03 §6). */
  const replayPendingLink = useCallback(() => {
    if (decision !== 'app' || !navigationRef.isReady()) return;
    const url = takePendingLink();
    const id = url?.match(/^subtrak:\/\/subscription\/([^/?#]+)/)?.[1];
    if (id) {
      navigationRef.navigate('App', {
        screen: 'SubscriptionDetail',
        params: { id: decodeURIComponent(id) },
      });
    }
  }, [decision, navigationRef]);

  useEffect(replayPendingLink, [replayPendingLink]);

  /**
   * Opens an Auth route parked just before sign-out (pendingAuthRoute), such
   * as Register from "Wrong email?", once the remounted Auth stack is there.
   * Consumed in an effect, like the pending link above: an impure useState
   * initializer could run twice under StrictMode and drop it. Any route's
   * params go through, not only Register's.
   */
  const replayPendingAuthRoute = useCallback(() => {
    if (decision !== 'auth' || !navigationRef.isReady()) return;
    const parked = takePendingAuthRoute();
    if (!parked) return;
    navigationRef.navigate('Auth', {
      screen: parked.name,
      params: parked.params,
    } as RootStackParamList['Auth']);
  }, [decision, navigationRef]);

  useEffect(replayPendingAuthRoute, [replayPendingAuthRoute]);

  if (decision === 'splash') {
    return null;
  }

  return (
    <NavigationContainer
      ref={navigationRef}
      theme={navigationTheme}
      linking={linking}
      onReady={() => {
        replayPendingLink();
        replayPendingAuthRoute();
      }}
      // Shown if the deep-link handler is resolving a cold-start URL. Null keeps
      // the splash rather than flashing an empty screen.
      fallback={null}
    >
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {decision === 'app' ? (
          <Stack.Screen name="App" component={AppNavigator} />
        ) : (
          <Stack.Screen
            name="Auth"
            // A different component per decision, keyed, so moving from
            // 'auth' to 'verify' after sign-in remounts at the right screen.
            navigationKey={decision}
            component={decision === 'verify' ? AuthAtVerify : AuthAtLogin}
          />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
