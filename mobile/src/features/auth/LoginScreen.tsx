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
 *   account_locked (423)    → the server's lockout message
 *   throttled (429)         → the server's message, and Log in disabled behind
 *                             a visible countdown
 *   offline                 → a toast; everything typed is kept
 *
 * The countdown on a 429 is RATE_LIMIT_FALLBACK_SECONDS: the client does not
 * surface Retry-After yet, so the screen cannot know the server's real wait.
 *
 * Not here yet: biometric unlock (05 §5) needs expo-local-authentication,
 * which is a new dependency and lands in its own change.
 */
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { authApi } from '@/api/endpoints';
import { ApiError, fieldError, messageFor } from '@/api/errors';
import { Button, TextField, useToast } from '@/components';
import type { AuthStackParamList } from '@/navigation/types';
import { useSession } from '@/session/SessionContext';
import { makeStyles, spacing } from '@/theme';

import { AuthShell, FormError } from './AuthShell';
import { formatCountdown, useCountdown } from './useCountdown';
import { isValidEmail } from './validation';

export const LOGIN_COPY = {
  title: 'Log In',
  invalidCredentials: 'Email or password is incorrect.',
  invalidEmail: 'Enter a valid email address.',
  offline: "Couldn't reach SubTrak. Check your connection.",
} as const;

/** Used for a 429 until the client exposes the server's Retry-After. */
export const RATE_LIMIT_FALLBACK_SECONDS = 60;

type Navigation = NativeStackNavigationProp<AuthStackParamList, 'Login'>;

export function LoginScreen() {
  const styles = useStyles();
  const navigation = useNavigation<Navigation>();
  const { signIn } = useSession();
  const toast = useToast();
  const cooldown = useCountdown();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailTouched, setEmailTouched] = useState(false);
  const [formError, setFormError] = useState<string>();
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
      } else if (error.status === 429) {
        setFormError(error.message);
        cooldown.start(RATE_LIMIT_FALLBACK_SECONDS);
      } else if (error.isOffline) {
        toast.show(LOGIN_COPY.offline);
      } else if (error.fields) {
        setFieldErrors({
          email: fieldError(error, 'email'),
          password: fieldError(error, 'password'),
        });
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
      <FormError message={formError} />

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
