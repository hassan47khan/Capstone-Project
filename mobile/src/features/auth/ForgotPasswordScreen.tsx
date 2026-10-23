/**
 * Forgot your password? (handoff 05 §1, US-3; Figma "Forgot Password").
 *
 * The request always succeeds for a well-formed email, registered or not, so
 * the screen cannot be used to discover accounts. It moves straight on to
 * Reset Link Sent with the address it was given.
 */
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';

import { authApi } from '@/api/endpoints';
import { ApiError, messageFor } from '@/api/errors';
import { Button, TextField, useToast } from '@/components';
import type { AuthStackParamList } from '@/navigation/types';
import { makeStyles, spacing } from '@/theme';

import { AuthShell, FormError } from './AuthShell';
import {
  formatCountdown,
  RATE_LIMIT_FALLBACK_SECONDS,
  useCountdown,
} from './useCountdown';
import { cooldownFrom } from './useResendWithCooldown';
import { isValidEmail } from './validation';

export const FORGOT_COPY = {
  title: 'Forgot your password?',
  subtitle:
    "Enter the email address associated with your account and we'll send you a password reset link.",
  invalidEmail: 'Enter a valid email address.',
  offline: "Couldn't reach SubTrak. Check your connection.",
} as const;

type Navigation = NativeStackNavigationProp<AuthStackParamList, 'ForgotPassword'>;
type Route = RouteProp<AuthStackParamList, 'ForgotPassword'>;

export function ForgotPasswordScreen() {
  const styles = useStyles();
  const navigation = useNavigation<Navigation>();
  const route = useRoute<Route>();
  const toast = useToast();
  const cooldown = useCountdown();

  // Prefilled when the user came back from Reset Link Sent ("Wrong email?").
  const [email, setEmail] = useState(route.params?.email ?? '');
  const [touched, setTouched] = useState(false);
  const [formError, setFormError] = useState<string>();

  const trimmed = email.trim();
  const valid = isValidEmail(trimmed);

  const request = useMutation({
    mutationFn: authApi.requestPasswordReset,
    // Pass the server's wait along, so Resend on the next screen starts
    // disabled instead of inviting a 429.
    onSuccess: (response) =>
      navigation.navigate('ResetLinkSent', {
        email: trimmed,
        cooldown: cooldownFrom(response),
      }),
    onError: (error) => {
      if (error instanceof ApiError && error.status === 429) {
        setFormError(error.message);
        cooldown.start(RATE_LIMIT_FALLBACK_SECONDS);
      } else if (error instanceof ApiError && error.isOffline) {
        toast.show(FORGOT_COPY.offline);
      } else {
        setFormError(messageFor(error));
      }
    },
  });

  const waiting = cooldown.remaining > 0;
  const canSubmit = valid && !request.isPending && !waiting;

  const submit = () => {
    if (!canSubmit) return;
    setFormError(undefined);
    request.mutate({ email: trimmed });
  };

  return (
    <AuthShell
      title={FORGOT_COPY.title}
      subtitle={FORGOT_COPY.subtitle}
      backLabel={navigation.canGoBack() ? 'Log In' : undefined}
      onBack={() => navigation.goBack()}
      testID="forgot-password-screen"
    >
      <TextField
        label="Email address"
        placeholder="you@example.com"
        value={email}
        onChangeText={setEmail}
        onBlur={() => setTouched(true)}
        error={touched && email && !valid ? FORGOT_COPY.invalidEmail : undefined}
        keyboardType="email-address"
        autoComplete="email"
        textContentType="emailAddress"
        returnKeyType="send"
        onSubmitEditing={submit}
        editable={!request.isPending}
        testID="forgot-email"
      />

      <FormError message={formError} />

      <Button
        label={
          waiting
            ? `Try again in ${formatCountdown(cooldown.remaining)}`
            : 'Send Reset Link'
        }
        onPress={submit}
        disabled={!canSubmit}
        loading={request.isPending}
        loadingLabel="Sending the reset link"
        fullWidth
        testID="forgot-submit"
      />
      <View style={styles.links}>
        <Button
          label="Back to Log In"
          variant="ghost"
          onPress={() => navigation.navigate('Login')}
          testID="forgot-back-to-login"
        />
      </View>
    </AuthShell>
  );
}

const useStyles = makeStyles(() => ({
  links: {
    alignItems: 'center',
    gap: spacing.xs,
  },
}));
