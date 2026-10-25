/**
 * Log in (handoff 05 §5, US-2).
 *
 * What happens on submit
 *   success                 → tokens go to the session (secure store); the
 *                             auth gate then opens Home, or Verify Email Sent
 *                             for an unverified profile
 *   invalid_credentials     → one form-level message above the fields, never
 *                             saying whether the email or the password was wrong
 *   email_not_verified      → straight to Verify Email Sent with the email
 *                             prefilled; no error shown
 *   account_locked (423)    → the server's lockout message, and Log In
 *   throttled (429)           disabled behind a visible countdown; the banner
 *                             clears when the countdown ends
 *   other 400                 messages under their fields, or the banner when
 *                             none of them is a field here
 *   offline                 → a toast; everything typed is kept
 *
 * The countdown is RATE_LIMIT_FALLBACK_SECONDS: the client does not surface
 * Retry-After yet, so the screen cannot know the server's real wait.
 *
 * Biometric unlock (05 §5): once a session has existed on this device, Face
 * ID / Touch ID is offered here and prompts by itself when the screen comes
 * into focus. Cancelling leaves the form as it is. See useBiometricUnlock.
 */
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { authApi } from '@/api/endpoints';
import { ApiError, messageFor } from '@/api/errors';
import { Button, TextField, useToast } from '@/components';
import type { AuthStackParamList } from '@/navigation/types';
import { useSession } from '@/session/SessionContext';
import { makeStyles, spacing } from '@/theme';

import { AuthShell, FormError } from './AuthShell';
import { formErrorsFrom } from './formErrors';
import { useBiometricUnlock } from './useBiometricUnlock';
import {
  formatCountdown,
  RATE_LIMIT_FALLBACK_SECONDS,
  useCountdown,
} from './useCountdown';
import { isValidEmail } from './validation';

export const LOGIN_COPY = {
  title: 'Log In',
  invalidCredentials: 'Email or password is incorrect.',
  invalidEmail: 'Enter a valid email address.',
  offline: "Couldn't reach SubTrak. Check your connection.",
} as const;

// Re-exported for the screens that first imported it from here.
export { RATE_LIMIT_FALLBACK_SECONDS };

type Navigation = NativeStackNavigationProp<AuthStackParamList, 'Login'>;

export function LoginScreen() {
  const styles = useStyles();
  const navigation = useNavigation<Navigation>();
  const { signIn } = useSession();
  const toast = useToast();
  const cooldown = useCountdown();
  const biometric = useBiometricUnlock();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailTouched, setEmailTouched] = useState(false);
  const [formError, setFormError] = useState<string>();
  // Shown only while the 423/429 countdown runs, so it clears when Log In
  // comes back.
  const [limitError, setLimitError] = useState<string>();
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>(
    {},
  );

  const trimmedEmail = email.trim();
  const emailValid = isValidEmail(trimmedEmail);

  const login = useMutation({
    mutationFn: authApi.login,
    onSuccess: (tokens) => signIn(tokens),
    onError: (error) => {
      if (!(error instanceof ApiError)) {
        setFormError(messageFor(error));
      } else if (error.code === 'email_not_verified') {
        navigation.navigate('VerifyEmailSent', { email: trimmedEmail });
      } else if (error.code === 'invalid_credentials') {
        setFormError(LOGIN_COPY.invalidCredentials);
      } else if (error.status === 429 || error.code === 'account_locked') {
        setLimitError(error.message);
        cooldown.start(RATE_LIMIT_FALLBACK_SECONDS);
      } else if (error.isOffline) {
        toast.show(LOGIN_COPY.offline);
      } else if (error.fields) {
        const { fields, banner } = formErrorsFrom(error, ['email', 'password'] as const);
        setFieldErrors(fields);
        setFormError(banner);
      } else {
        setFormError(error.message);
      }
    },
  });

  const submitting = login.isPending;
  const waiting = cooldown.remaining > 0;
  const canSubmit = emailValid && password.length > 0 && !submitting && !waiting;

  const submit = () => {
    if (!canSubmit) return;
    setFormError(undefined);
    setFieldErrors({});
    login.mutate({ email: trimmedEmail, password });
  };

  const emailError =
    fieldErrors.email ??
    (emailTouched && email && !emailValid ? LOGIN_COPY.invalidEmail : undefined);

  return (
    <AuthShell
      title={LOGIN_COPY.title}
      testID="login-screen"
      footer={
        <>
          <Text style={styles.footerText}>Don&apos;t have an account?</Text>
          <Button
            label="Create Account"
            variant="ghost"
            onPress={() => navigation.navigate('Register')}
            testID="login-register"
          />
        </>
      }
    >
      {/* 05 §5: a wrong-credentials message sits above the fields. */}
      <FormError message={formError ?? (waiting ? limitError : undefined)} />

      <TextField
        label="Email address"
        placeholder="you@example.com"
        value={email}
        onChangeText={(next) => {
          setEmail(next);
          setFieldErrors((prev) => ({ ...prev, email: undefined }));
        }}
        onBlur={() => setEmailTouched(true)}
        error={emailError}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        textContentType="emailAddress"
        returnKeyType="next"
        editable={!submitting}
        testID="login-email"
      />

      <View style={styles.passwordGroup}>
        <TextField
          label="Password"
          placeholder="Enter your password"
          value={password}
          onChangeText={(next) => {
            setPassword(next);
            setFieldErrors((prev) => ({ ...prev, password: undefined }));
          }}
          error={fieldErrors.password}
          secureTextEntry
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={submit}
          editable={!submitting}
          testID="login-password"
        />
        <View style={styles.forgot}>
          <Button
            label="Forgot password?"
            variant="ghost"
            onPress={() => navigation.navigate('ForgotPassword')}
            testID="login-forgot"
          />
        </View>
      </View>

      <Button
        label={waiting ? `Try again in ${formatCountdown(cooldown.remaining)}` : 'Log In'}
        onPress={submit}
        disabled={!canSubmit}
        loading={submitting}
        loadingLabel="Logging in"
        fullWidth
        style={styles.primary}
        testID="login-submit"
      />

      {biometric.kind ? (
        <Button
          label={`Log in with ${biometric.kind}`}
          variant="secondary"
          onPress={biometric.unlock}
          // Gated by the 423/429 countdown like the password button, so the
          // lockout cannot be sidestepped by restoring the parked session.
          disabled={waiting}
          loading={biometric.busy}
          loadingLabel={`Waiting for ${biometric.kind}`}
          fullWidth
          testID="login-biometric"
        />
      ) : null}
    </AuthShell>
  );
}

const useStyles = makeStyles(({ colors, typography }) => ({
  passwordGroup: {
    gap: spacing.xs,
  },
  // 05 §5: "Forgot password" trailing-aligned with the password field.
  forgot: {
    alignItems: 'flex-end',
  },
  // 05 §2: the primary sits 24–32 below the last field; the body gap gives 16.
  primary: {
    marginTop: spacing.sm,
  },
  footerText: {
    ...typography.bodyMd,
    color: colors.textMuted,
  },
}));
