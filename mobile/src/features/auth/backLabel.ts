/**
 * What the auth back button says: the screen goBack() actually returns to,
 * read from the stack, so "Back to …" is never a guess. Undefined when there
 * is nothing to go back to (the screen opened first, from the gate or a link).
 */
import type { NavigationProp } from '@react-navigation/native';

import type { AuthStackParamList } from '@/navigation/types';

const LABELS: Record<keyof AuthStackParamList, string> = {
  Login: 'Log In',
  Register: 'Create your account',
  VerifyEmailSent: 'Check your email',
  EmailConfirmed: 'Email confirmed',
  ForgotPassword: 'Forgot password',
  ResetLinkSent: 'Check your email',
  CreateNewPassword: 'Create a new password',
  PasswordResetSuccess: 'Password updated',
};

export function backLabelFor(
  navigation: Pick<NavigationProp<AuthStackParamList>, 'canGoBack' | 'getState'>,
): string | undefined {
  if (!navigation.canGoBack()) return undefined;
  const { routes, index } = navigation.getState();
  const previous = routes[index - 1]?.name as keyof AuthStackParamList | undefined;
  return previous ? LABELS[previous] : undefined;
}
