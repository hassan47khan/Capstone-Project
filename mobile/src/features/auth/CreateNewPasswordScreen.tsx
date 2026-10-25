/**
 * Create a new password, the landing for subtrak://reset-password?token=…
 * (handoff 05 §1, §8; US-3).
 *
 * One field with show/hide and the same 8-character rule as Register, shown
 * as helper text that turns into the error on submit. No confirm field (05 §3).
 *
 *   success                    → Password Updated, replacing this screen so
 *                                Back cannot return to a spent link
 *   token_expired              → "This link has expired." (05 §8)
 *   token_invalid              → "This link has already been used." (05 §8)
 *     both with "Request a new link" → Forgot Password
 *   400 with fields            → under the field
 *   offline                    → a toast; the password is kept
 *
 * The server signs every other session out when this succeeds (token_version).
 */
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';

import { authApi } from '@/api/endpoints';
import { ApiError, fieldError, messageFor } from '@/api/errors';
import { Button, TextField, useToast } from '@/components';
import type { AuthStackParamList } from '@/navigation/types';
import { makeStyles, spacing } from '@/theme';

import { AuthShell, FormError } from './AuthShell';
import { isValidPassword, PASSWORD_RULE } from './validation';

export const NEW_PASSWORD_COPY = {
  title: 'Create a new password',
  subtitle: 'Choose a password you have not used for SubTrak before.',
  expired: 'This link has expired.',
  used: 'This link has already been used.',
  offline: "Couldn't reach SubTrak. Check your connection.",
} as const;

type Navigation = NativeStackNavigationProp<AuthStackParamList, 'CreateNewPassword'>;
type Route = RouteProp<AuthStackParamList, 'CreateNewPassword'>;

export function CreateNewPasswordScreen() {
  const styles = useStyles();
  const navigation = useNavigation<Navigation>();
  const { token } = useRoute<Route>().params;
  const toast = useToast();

  const [password, setPassword] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [serverFieldError, setServerFieldError] = useState<string>();
  const [linkError, setLinkError] = useState<string>();
  const [formError, setFormError] = useState<string>();

  const confirm = useMutation({
    mutationFn: authApi.confirmPasswordReset,
    onSuccess: () => navigation.replace('PasswordResetSuccess'),
    onError: (error) => {
      if (!(error instanceof ApiError)) {
        setFormError(messageFor(error));
      } else if (error.code === 'token_expired') {
        setLinkError(NEW_PASSWORD_COPY.expired);
      } else if (error.code === 'token_invalid') {
        setLinkError(NEW_PASSWORD_COPY.used);
      } else if (error.isOffline) {
        toast.show(NEW_PASSWORD_COPY.offline);
      } else if (fieldError(error, 'password')) {
        setServerFieldError(fieldError(error, 'password'));
      } else {
        setFormError(error.message);
      }
    },
  });

  const submit = () => {
    if (confirm.isPending || password.length === 0) return;
    setSubmitted(true);
    setFormError(undefined);
    setServerFieldError(undefined);
    if (!isValidPassword(password)) return;
    confirm.mutate({ token, password });
  };

  const passwordError =
    serverFieldError ??
    (submitted && !isValidPassword(password) ? PASSWORD_RULE : undefined);

  if (linkError) {
    return (
      <AuthShell
        title={linkError}
        subtitle="Request a new link and we'll email it to you."
        testID="create-new-password-screen"
      >
        <Button
          label="Request a new link"
          onPress={() => navigation.navigate('ForgotPassword')}
          fullWidth
          testID="new-password-request-again"
        />
        <View style={styles.links}>
          <Button
            label="Back to Log In"
            variant="ghost"
            onPress={() => navigation.navigate('Login')}
            testID="new-password-back-to-login"
          />
        </View>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={NEW_PASSWORD_COPY.title}
      subtitle={NEW_PASSWORD_COPY.subtitle}
      backLabel={navigation.canGoBack() ? 'Log In' : undefined}
      onBack={() => navigation.goBack()}
      testID="create-new-password-screen"
    >
      <TextField
        label="New password"
        placeholder="Create a password"
        value={password}
        onChangeText={(next) => {
          setPassword(next);
          setServerFieldError(undefined);
        }}
        helper={PASSWORD_RULE}
        error={passwordError}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="done"
        onSubmitEditing={submit}
        editable={!confirm.isPending}
        testID="new-password"
      />

      <FormError message={formError} />

      <Button
        label="Save new password"
        onPress={submit}
        disabled={password.length === 0 || confirm.isPending}
        loading={confirm.isPending}
        loadingLabel="Saving your new password"
        fullWidth
        testID="new-password-submit"
      />
    </AuthShell>
  );
}

const useStyles = makeStyles(() => ({
  links: {
    alignItems: 'center',
    gap: spacing.xs,
  },
}));
