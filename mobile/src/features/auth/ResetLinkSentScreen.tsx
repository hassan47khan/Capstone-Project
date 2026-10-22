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
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { authApi } from '@/api/endpoints';
import { ApiError, messageFor } from '@/api/errors';
import { Button, useToast } from '@/components';
import type { AuthStackParamList } from '@/navigation/types';
import { makeStyles, spacing } from '@/theme';

import { AuthShell, FormError } from './AuthShell';
import { StatusIcon } from './StatusIcon';
import {
  formatCountdown,
  RATE_LIMIT_FALLBACK_SECONDS,
  useCountdown,
} from './useCountdown';
import { DEFAULT_RESEND_COOLDOWN_SECONDS, openMailApp } from './VerifyEmailSentScreen';

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
  const { email } = useRoute<Route>().params;
  const toast = useToast();
  const cooldown = useCountdown();
  const [formError, setFormError] = useState<string>();

  const resend = useMutation({
    mutationFn: authApi.requestPasswordReset,
    onSuccess: (response) => {
      // The contract returns cooldown_seconds; the hand-written client types
      // this response as { sent }, so it is read defensively.
      const seconds = (response as { cooldown_seconds?: number }).cooldown_seconds;
      cooldown.start(seconds ?? DEFAULT_RESEND_COOLDOWN_SECONDS);
      toast.show(RESET_SENT_COPY.resent, 'success');
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 429) {
        setFormError(error.message);
        cooldown.start(RATE_LIMIT_FALLBACK_SECONDS);
      } else if (error instanceof ApiError && error.isOffline) {
        toast.show(RESET_SENT_COPY.offline);
      } else {
        setFormError(messageFor(error));
      }
    },
  });

  const waiting = cooldown.remaining > 0;

  const onResend = () => {
    if (waiting || resend.isPending) return;
    setFormError(undefined);
    resend.mutate({ email });
  };

  return (
    <AuthShell
      title={RESET_SENT_COPY.title}
      icon={<StatusIcon kind="mail" />}
      subtitle={
        <>
          {RESET_SENT_COPY.sentTo} <Text style={styles.email}>{email}</Text>.
        </>
      }
      backLabel={navigation.canGoBack() ? 'Log In' : undefined}
      onBack={() => navigation.goBack()}
      testID="reset-link-sent-screen"
    >
      <FormError message={formError} />

      <Button
        label="Open Mail app"
        onPress={() =>
          openMailApp().catch(() => toast.show(RESET_SENT_COPY.mailUnavailable))
        }
        fullWidth
        testID="reset-open-mail"
      />
      <Button
        label={waiting ? `Resend in ${formatCountdown(cooldown.remaining)}` : 'Resend'}
        variant="secondary"
        onPress={onResend}
        disabled={waiting}
        loading={resend.isPending}
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
