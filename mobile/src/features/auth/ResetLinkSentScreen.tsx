/**
 * Check your email, after asking for a reset (handoff 05 §4, US-3; Figma
 * "Reset Email Sent").
 *
 * The frame makes "Resend Reset Link" the primary. 05 §4 overrides that, as on
 * Verify Email Sent: "Open Mail app" is the primary, Resend is secondary with
 * the server's cooldown counting down, then "Wrong email?" and "Back to Log
 * In". A successful resend shows the frame's toast, "Password reset email
 * resent".
 */
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Text, View } from 'react-native';

import { authApi } from '@/api/endpoints';
import { Button } from '@/components';
import type { AuthStackParamList } from '@/navigation/types';
import { makeStyles, spacing } from '@/theme';

import { AuthShell, FormError } from './AuthShell';
import { backLabelFor } from './backLabel';
import { StatusIcon } from './StatusIcon';
import { formatCountdown } from './useCountdown';
import { useResendWithCooldown } from './useResendWithCooldown';

export const RESET_SENT_COPY = {
  title: 'Check your email',
  sentTo: 'We sent a password reset link to',
  resent: 'Password reset email resent',
  mailUnavailable: "Couldn't open your mail app. Open it yourself to find the link.",
  offline: "Couldn't reach SubTrak. Check your connection.",
} as const;

type Navigation = NativeStackNavigationProp<AuthStackParamList, 'ResetLinkSent'>;
type Route = RouteProp<AuthStackParamList, 'ResetLinkSent'>;

export function ResetLinkSentScreen() {
  const styles = useStyles();
  const navigation = useNavigation<Navigation>();
  // `cooldown` comes from the request Forgot Password just made, so Resend
  // starts disabled rather than inviting a 429.
  const { email, cooldown } = useRoute<Route>().params;
  const resend = useResendWithCooldown({
    send: authApi.requestPasswordReset,
    resentMessage: RESET_SENT_COPY.resent,
    offlineMessage: RESET_SENT_COPY.offline,
    initialCooldown: cooldown,
  });

  return (
    <AuthShell
      title={RESET_SENT_COPY.title}
      icon={<StatusIcon kind="mail" />}
      subtitle={
        <>
          {RESET_SENT_COPY.sentTo} <Text style={styles.email}>{email}</Text>.
        </>
      }
      // Names the screen goBack() returns to: Forgot password, normally.
      backLabel={backLabelFor(navigation)}
      onBack={() => navigation.goBack()}
      testID="reset-link-sent-screen"
    >
      <FormError message={resend.error} />

      <Button
        label="Open Mail app"
        onPress={() => resend.openMail(RESET_SENT_COPY.mailUnavailable)}
        fullWidth
        testID="reset-open-mail"
      />
      <Button
        label={
          resend.waiting ? `Resend in ${formatCountdown(resend.remaining)}` : 'Resend'
        }
        variant="secondary"
        onPress={() => resend.resend({ email })}
        disabled={resend.waiting || resend.pending}
        loading={resend.pending}
        loadingLabel="Resending the reset link"
        fullWidth
        testID="reset-resend"
      />

      <View style={styles.links}>
        <Button
          label="Wrong email?"
          variant="ghost"
          onPress={() => navigation.navigate('ForgotPassword', { email })}
          testID="reset-wrong-email"
        />
        <Button
          label="Back to Log In"
          variant="ghost"
          onPress={() => navigation.navigate('Login')}
          testID="reset-back-to-login"
        />
      </View>
    </AuthShell>
  );
}

const useStyles = makeStyles(({ colors, typography }) => ({
  email: {
    ...typography.labelSemibold,
    color: colors.text,
  },
  links: {
    alignItems: 'center',
    gap: spacing.xs,
  },
}));
