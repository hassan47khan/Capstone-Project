/**
 * The unauthenticated stack (handoff 03 §1, screens in handoff 05).
 *
 * What it is for
 *   Log in, Register, the email-verification pair, and the four-step password
 *   reset. There is no Welcome or marketing screen: the app opens on Log in
 *   (03 §7).
 *
 * Where it starts
 *   `Login`, normally. The auth gate starts it on `VerifyEmailSent` instead for
 *   a signed-in user whose email is not yet verified (03 §5, case 3).
 *
 * Why there is no navigator header
 *   Each screen draws its own `Header` with the serif title the design uses.
 */
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { CreateNewPasswordScreen } from '@/features/auth/CreateNewPasswordScreen';
import { EmailConfirmedScreen } from '@/features/auth/EmailConfirmedScreen';
import { ForgotPasswordScreen } from '@/features/auth/ForgotPasswordScreen';
import { LoginScreen } from '@/features/auth/LoginScreen';
import { PasswordResetSuccessScreen } from '@/features/auth/PasswordResetSuccessScreen';
import { RegisterScreen } from '@/features/auth/RegisterScreen';
import { ResetLinkSentScreen } from '@/features/auth/ResetLinkSentScreen';
import { VerifyEmailSentScreen } from '@/features/auth/VerifyEmailSentScreen';

import type { AuthStackParamList } from './types';

const Stack = createNativeStackNavigator<AuthStackParamList>();

export interface AuthNavigatorProps {
  /** Which screen the stack opens on. */
  initialRouteName?: keyof AuthStackParamList;
}

export function AuthNavigator({ initialRouteName = 'Login' }: AuthNavigatorProps) {
  return (
    <Stack.Navigator
      initialRouteName={initialRouteName}
      screenOptions={{ headerShown: false }}
    >
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
      <Stack.Screen name="VerifyEmailSent" component={VerifyEmailSentScreen} />
      <Stack.Screen name="EmailConfirmed" component={EmailConfirmedScreen} />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
      <Stack.Screen name="ResetLinkSent" component={ResetLinkSentScreen} />
      <Stack.Screen name="CreateNewPassword" component={CreateNewPasswordScreen} />
      <Stack.Screen name="PasswordResetSuccess" component={PasswordResetSuccessScreen} />
    </Stack.Navigator>
  );
}
