/**
 * Check your email, after registering (handoff 05 §4, US-1).
 *
 * Changed from the prototype on purpose (05 §4): the next step is to open the
 * mail app, so "Open Mail app" is the primary and Resend is secondary. Resend
 * is disabled while the server's cooldown runs, with the countdown visible
 * ("Resend in 0:42"), so it never offers a press the server would reject.
 *
 * Where the email comes from
 *   Register passes it as a param. When the auth gate opens this screen for a
 *   signed-in but unverified user (03 §5, case 3) there is no param, so it
 *   reads the profile. If neither is known, an email field appears for Resend.
 *
 * The cooldown is read from the resend response (`cooldown_seconds`, frozen in
 * the API contract). The hand-written client in src/api still types that
 * response as { verification_sent }, so the field is read defensively and
 * DEFAULT_RESEND_COOLDOWN_SECONDS covers a response without it.
 */
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Linking, Platform, Text, View } from 'react-native';

import { authApi, meApi } from '@/api/endpoints';
import { ApiError, messageFor } from '@/api/errors';
import { queryKeys } from '@/api/queryKeys';
import { Button, Skeleton, TextField, useToast } from '@/components';
import { parkAuthRoute } from '@/navigation/pendingAuthRoute';
import type { AuthStackParamList } from '@/navigation/types';
import { useSession } from '@/session/SessionContext';
import { makeStyles, sizes, spacing } from '@/theme';

import { AuthShell, FormError } from './AuthShell';
import { StatusIcon } from './StatusIcon';
import {
  formatCountdown,
  RATE_LIMIT_FALLBACK_SECONDS,
  useCountdown,
} from './useCountdown';
import { isValidEmail } from './validation';

export const VERIFY_COPY = {
  title: 'Check your email',
  sentTo: 'We sent a confirmation link to',
  sentToUnknown: 'We sent a confirmation link to your email address.',
  resent: 'Confirmation email resent',
  mailUnavailable: "Couldn't open your mail app. Open it yourself to find the link.",
  offline: "Couldn't reach SubTrak. Check your connection.",
} as const;

/** Used when the resend response carries no cooldown. */
export const DEFAULT_RESEND_COOLDOWN_SECONDS = 60;

type Navigation = NativeStackNavigationProp<AuthStackParamList, 'VerifyEmailSent'>;
type Route = RouteProp<AuthStackParamList, 'VerifyEmailSent'>;

/** Opens the default mail client, inbox first where the platform allows. */
export async function openMailApp(): Promise<void> {
  await Linking.openURL(Platform.OS === 'ios' ? 'message://' : 'mailto:');
}

export function VerifyEmailSentScreen() {
  const styles = useStyles();
  const navigation = useNavigation<Navigation>();
  const route = useRoute<Route>();
  const { status, signOut } = useSession();
  const toast = useToast();
  const cooldown = useCountdown();
  const [formError, setFormError] = useState<string>();
  const [typedEmail, setTypedEmail] = useState('');

  const paramEmail = route.params?.email;
  const profile = useQuery({
    queryKey: queryKeys.session.profile(),
    queryFn: meApi.getProfile,
    enabled: !paramEmail && status === 'authenticated',
  });
  const knownEmail = paramEmail ?? profile.data?.email;
  const email = knownEmail ?? typedEmail.trim();
  // A signed-in user's address is on its way from /me: show neither the
  // fallback field nor "your email address" yet, and hold the actions.
  const loadingEmail = !paramEmail && status === 'authenticated' && profile.isPending;

  const resend = useMutation({
    mutationFn: authApi.resendVerification,
    onSuccess: (response) => {
      const seconds = (response as { cooldown_seconds?: number }).cooldown_seconds;
      cooldown.start(seconds ?? DEFAULT_RESEND_COOLDOWN_SECONDS);
      toast.show(VERIFY_COPY.resent, 'success');
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 429) {
        setFormError(error.message);
        cooldown.start(RATE_LIMIT_FALLBACK_SECONDS);
      } else if (error instanceof ApiError && error.isOffline) {
        toast.show(VERIFY_COPY.offline);
      } else {
        setFormError(messageFor(error));
      }
    },
  });

  const waiting = cooldown.remaining > 0;
  const canResend = !loadingEmail && isValidEmail(email) && !waiting && !resend.isPending;

  const onResend = () => {
    if (!canResend) return;
    setFormError(undefined);
    resend.mutate({ email });
  };

  const onOpenMail = () =>
    openMailApp().catch(() => toast.show(VERIFY_COPY.mailUnavailable));

  // A signed-in but unverified user leaves through sign-out, which remounts
  // the Auth stack at Log In; a navigate() now would be lost. So Register is
  // parked first and the remounted stack opens on it (pendingAuthRoute).
  const leave = async (to: 'Register' | 'Login') => {
    // Forward the effective email (a typed address when none was known), not
    // just knownEmail, so an address the user entered here is not discarded.
    const registerParams = { email: email || undefined };
    if (status === 'authenticated') {
      if (to === 'Register') {
        parkAuthRoute({ name: 'Register', params: registerParams });
        await signOut();
        return;
      }
      await signOut();
    }
    if (to === 'Register') navigation.navigate('Register', registerParams);
    else navigation.navigate('Login');
  };

  return (
    <AuthShell
      title={VERIFY_COPY.title}
      icon={<StatusIcon kind="mail" />}
      subtitle={
        loadingEmail ? undefined : knownEmail ? (
          <>
            {VERIFY_COPY.sentTo} <Text style={styles.email}>{knownEmail}</Text>.
          </>
        ) : (
          VERIFY_COPY.sentToUnknown
        )
      }
      backLabel={navigation.canGoBack() ? 'Log In' : undefined}
      onBack={() => navigation.goBack()}
      testID="verify-email-sent-screen"
    >
      {loadingEmail ? (
        <Skeleton height={sizes.minTouch} testID="verify-email-loading" />
      ) : knownEmail ? null : (
        <TextField
          label="Email address"
          placeholder="you@example.com"
          value={typedEmail}
          onChangeText={setTypedEmail}
          keyboardType="email-address"
          autoComplete="email"
          textContentType="emailAddress"
          testID="verify-email"
        />
      )}

      <FormError message={formError} />

      <Button
        label="Open Mail app"
        onPress={onOpenMail}
        fullWidth
        testID="verify-open-mail"
      />
      <Button
        label={waiting ? `Resend in ${formatCountdown(cooldown.remaining)}` : 'Resend'}
        variant="secondary"
        onPress={onResend}
        disabled={!canResend}
        loading={resend.isPending}
        loadingLabel="Resending the email"
        fullWidth
        testID="verify-resend"
      />

      <View style={styles.links}>
        <Button
          label="Wrong email?"
          variant="ghost"
          onPress={() => leave('Register')}
          disabled={loadingEmail}
          testID="verify-wrong-email"
        />
        <Button
          label="Back to Log In"
          variant="ghost"
          onPress={() => leave('Login')}
          testID="verify-back-to-login"
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
