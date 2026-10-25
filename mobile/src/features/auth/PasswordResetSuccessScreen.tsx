/**
 * Password updated, the end of the reset flow (handoff 05 §1, US-3).
 *
 * A terminal screen: no back button, one way on. Log In resets the stack so
 * Back cannot walk into the spent reset link.
 */
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { Button } from '@/components';
import type { AuthStackParamList } from '@/navigation/types';

import { AuthShell } from './AuthShell';
import { StatusIcon } from './StatusIcon';

export const RESET_SUCCESS_COPY = {
  title: 'Password updated',
  body: 'Your password has been changed, and you have been signed out everywhere else. Log in with your new password.',
} as const;

type Navigation = NativeStackNavigationProp<AuthStackParamList, 'PasswordResetSuccess'>;

export function PasswordResetSuccessScreen() {
  const navigation = useNavigation<Navigation>();

  return (
    <AuthShell
      title={RESET_SUCCESS_COPY.title}
      subtitle={RESET_SUCCESS_COPY.body}
      icon={<StatusIcon kind="check" animate />}
      testID="password-reset-success-screen"
    >
      <Button
        label="Log In"
        onPress={() => navigation.reset({ index: 0, routes: [{ name: 'Login' }] })}
        fullWidth
        testID="reset-success-login"
      />
    </AuthShell>
  );
}
