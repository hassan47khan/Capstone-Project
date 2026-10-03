/**
 * The unauthenticated stack (Epic A).
 *
 * What this is for
 *   Welcome, Sign up, Confirm email, Log in, Forgot password, Reset password.
 *
 * Why there is no header
 *   Each screen draws its own `Header`, with the large serif title the design
 *   uses and a back link that names its destination. React Navigation's default
 *   header would sit above that as a second, mismatched title bar.
 *
 * The screens themselves are placeholders in Phase 0 — the real ones are Phase 1.
 * The stack exists now so the navigation shell can be built and tested.
 */
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { ConfirmEmailScreen } from '@/features/auth/ConfirmEmailScreen';
import { ForgotPasswordScreen } from '@/features/auth/ForgotPasswordScreen';
import { LogInScreen } from '@/features/auth/LogInScreen';
import { ResetPasswordScreen } from '@/features/auth/ResetPasswordScreen';
import { SignUpScreen } from '@/features/auth/SignUpScreen';
import { WelcomeScreen } from '@/features/auth/WelcomeScreen';

import type { AuthStackParamList } from './types';

const Stack = createNativeStackNavigator<AuthStackParamList>();

export function AuthNavigator() {
  return (
    <Stack.Navigator initialRouteName="Welcome" screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Welcome" component={WelcomeScreen} />
      <Stack.Screen name="SignUp" component={SignUpScreen} />
      <Stack.Screen name="ConfirmEmail" component={ConfirmEmailScreen} />
      <Stack.Screen name="LogIn" component={LogInScreen} />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
      <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} />
    </Stack.Navigator>
  );
}
