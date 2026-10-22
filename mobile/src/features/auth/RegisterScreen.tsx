/**
 * Create your account (handoff 05 §3, US-1).
 *
 * Changed from the prototype on purpose (05 §3): no five-rule password
 * checklist and no confirm field. The only rule is the length, shown as one
 * line of helper text that turns into the error on submit, never on keystroke.
 *
 * What happens on submit
 *   201                 → Verify Email Sent, with the email filled in
 *   409 duplicate_email → inline on the email field, with a way to Log In
 *   400 with fields     → each message under its field
 *   429                 → the server's message; Create Account waits out a
 *                         countdown (RATE_LIMIT_FALLBACK_SECONDS), and the
 *                         banner clears when it ends
 *   400 naming no field → the message as the form banner (formErrors.ts)
 *   offline             → a toast; everything typed is kept
 *
 * The back button shows only when there is somewhere to go back to: the auth
 * gate and deep links can open this screen as the first in the stack.
 */
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Linking, Text, View } from 'react-native';

import { authApi } from '@/api/endpoints';
import { ApiError, messageFor } from '@/api/errors';
import { Button, TextField, useToast } from '@/components';
import type { AuthStackParamList } from '@/navigation/types';
import { makeStyles, spacing } from '@/theme';

import { AuthShell, FormError } from './AuthShell';
import { TermsCheckbox } from './TermsCheckbox';
import { formErrorsFrom } from './formErrors';
import {
  formatCountdown,
  RATE_LIMIT_FALLBACK_SECONDS,
  useCountdown,
} from './useCountdown';
import { isValidEmail, isValidPassword, PASSWORD_RULE } from './validation';

export const REGISTER_COPY = {
  title: 'Create your account',
  subtitle: 'Track every subscription in one place.',
  invalidEmail: 'Enter a valid email address.',
  duplicateEmail: 'An account with this email already exists.',
  offline: "Couldn't reach SubTrak. Check your connection.",
} as const;

// TODO(legal): the real documents are not published yet. Replace both before
// release; the links are announced with their destinations either way.
export const TERMS_URL = 'https://subtrak.app/terms';
export const PRIVACY_URL = 'https://subtrak.app/privacy';

type Navigation = NativeStackNavigationProp<AuthStackParamList, 'Register'>;
type Route = RouteProp<AuthStackParamList, 'Register'>;

export function RegisterScreen() {
  const styles = useStyles();
  const navigation = useNavigation<Navigation>();
  const toast = useToast();
  const cooldown = useCountdown();

  const route = useRoute<Route>();
  // Prefilled when the user came back from Verify Email Sent ("Wrong email?").
  const [email, setEmail] = useState(route.params?.email ?? '');
  const [password, setPassword] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [duplicate, setDuplicate] = useState(false);
  const [formError, setFormError] = useState<string>();
  // Shown only while the 429 countdown runs, so it clears when it ends.
  const [limitError, setLimitError] = useState<string>();
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>(
    {},
  );

  const trimmedEmail = email.trim();
  const emailValid = isValidEmail(trimmedEmail);

  const register = useMutation({
    mutationFn: authApi.register,
    onSuccess: (result) =>
      navigation.navigate('VerifyEmailSent', { email: result.email }),
    onError: (error) => {
      if (!(error instanceof ApiError)) {
        setFormError(messageFor(error));
      } else if (error.code === 'duplicate_email') {
        setDuplicate(true);
      } else if (error.status === 429) {
        setLimitError(error.message);
        cooldown.start(RATE_LIMIT_FALLBACK_SECONDS);
      } else if (error.isOffline) {
        toast.show(REGISTER_COPY.offline);
      } else if (error.fields) {
        const { fields, banner } = formErrorsFrom(error, ['email', 'password'] as const);
        setFieldErrors(fields);
        setFormError(banner);
      } else {
        setFormError(error.message);
      }
    },
  });

  const submitting = register.isPending;
  const waiting = cooldown.remaining > 0;
  // 05 §3: Terms unchecked → disabled. The length rule is checked on submit.
  const canSubmit =
    agreed && emailValid && password.length > 0 && !submitting && !waiting;

  const submit = () => {
    if (!canSubmit) return;
    setSubmitted(true);
    setFormError(undefined);
    setFieldErrors({});
    setDuplicate(false);
    if (!isValidPassword(password)) return;
    register.mutate({ email: trimmedEmail, password });
  };

  const emailError = duplicate
    ? REGISTER_COPY.duplicateEmail
    : (fieldErrors.email ??
      (emailTouched && email && !emailValid ? REGISTER_COPY.invalidEmail : undefined));
  const passwordError =
    fieldErrors.password ??
    (submitted && !isValidPassword(password) ? PASSWORD_RULE : undefined);

  const goToLogin = () =>
    navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Login');

  return (
    <AuthShell
      title={REGISTER_COPY.title}
      subtitle={REGISTER_COPY.subtitle}
      backLabel={navigation.canGoBack() ? 'Log In' : undefined}
      onBack={() => navigation.goBack()}
      testID="register-screen"
      footer={
        <>
          <Text style={styles.footerText}>Already have an account?</Text>
          <Button
            label="Log In"
            variant="ghost"
            onPress={goToLogin}
            testID="register-login"
          />
        </>
      }
    >
      <View style={styles.emailGroup}>
        <TextField
          label="Email address"
          placeholder="you@example.com"
          value={email}
          onChangeText={(next) => {
            setEmail(next);
            setDuplicate(false);
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
          testID="register-email"
        />
        {duplicate ? (
          <View style={styles.duplicate}>
            <Button
              label="Log in instead"
              variant="ghost"
              onPress={goToLogin}
              testID="register-duplicate-login"
            />
          </View>
        ) : null}
      </View>

      <TextField
        label="Password"
        placeholder="Create a password"
        value={password}
        onChangeText={(next) => {
          setPassword(next);
          setFieldErrors((prev) => ({ ...prev, password: undefined }));
        }}
        helper={PASSWORD_RULE}
        error={passwordError}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="go"
        onSubmitEditing={submit}
        editable={!submitting}
        testID="register-password"
      />

      <TermsCheckbox
        checked={agreed}
        onChange={setAgreed}
        onOpenTerms={() => Linking.openURL(TERMS_URL)}
        onOpenPrivacy={() => Linking.openURL(PRIVACY_URL)}
        disabled={submitting}
      />

      {/* 05 §9: everywhere but Log In, the form error sits above the primary. */}
      <FormError message={formError ?? (waiting ? limitError : undefined)} />

      <Button
        label={
          waiting
            ? `Try again in ${formatCountdown(cooldown.remaining)}`
            : 'Create Account'
        }
        onPress={submit}
        disabled={!canSubmit}
        loading={submitting}
        loadingLabel="Creating your account"
        fullWidth
        style={styles.primary}
        testID="register-submit"
      />
    </AuthShell>
  );
}

const useStyles = makeStyles(({ colors, typography }) => ({
  emailGroup: {
    gap: spacing.xs,
  },
  duplicate: {
    alignItems: 'flex-start',
  },
  primary: {
    marginTop: spacing.sm,
  },
  footerText: {
    ...typography.bodyMd,
    color: colors.textMuted,
  },
}));
