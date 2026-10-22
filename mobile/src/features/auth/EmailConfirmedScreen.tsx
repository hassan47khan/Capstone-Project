/**
 * Email confirmed, the landing for subtrak://verify-email?token=… (handoff 05
 * §1, §8; US-1; Figma "Email Confirmed").
 *
 * The token is sent once, on open. While it is checked the primary shows its
 * loading state; there is no skeleton (05 §9: auth screens fetch nothing).
 *
 *   confirmed         check icon, "Email confirmed", Continue
 *   token_expired     "This link has expired." with Send a new link as the
 *                     primary (05 §8)
 *   anything else     "This link isn't valid", same way out
 *   offline           Try again, without leaving the screen
 *
 * Continue
 *   The API contract has verify-email return tokens, so the link signs the
 *   user in and the auth gate opens Home (05 §6). A response without tokens
 *   (the in-app mock still sends { verified }) refreshes the profile when a
 *   session exists, and otherwise goes to Log In.
 */
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { View } from 'react-native';

import { authApi } from '@/api/endpoints';
import { ApiError } from '@/api/errors';
import { queryKeys } from '@/api/queryKeys';
import type { TokenPair } from '@/api/types';
import { Button } from '@/components';
import type { AuthStackParamList } from '@/navigation/types';
import { useSession } from '@/session/SessionContext';
import { makeStyles, spacing } from '@/theme';

import { AuthShell } from './AuthShell';
import { StatusIcon } from './StatusIcon';

export const CONFIRMED_COPY = {
  checking: 'Confirming your email',
  checkingBody: 'This only takes a moment.',
  title: 'Email confirmed',
  body: 'Your email has been confirmed successfully. Your SubTrak account is ready.',
  expired: 'This link has expired.',
  expiredBody: 'Confirmation links stop working after a while. Send yourself a new one.',
  invalid: "This link isn't valid",
  invalidBody: 'It may have been used already. Log in, or send yourself a new link.',
  offline: "Couldn't reach SubTrak",
  offlineBody: 'Check your connection and try again.',
} as const;

type Navigation = NativeStackNavigationProp<AuthStackParamList, 'EmailConfirmed'>;
type Route = RouteProp<AuthStackParamList, 'EmailConfirmed'>;

function isTokenPair(value: unknown): value is TokenPair {
  const pair = value as Partial<TokenPair> | null;
  return typeof pair?.access === 'string' && typeof pair?.refresh === 'string';
}

export function EmailConfirmedScreen() {
  const styles = useStyles();
  const navigation = useNavigation<Navigation>();
  const { token } = useRoute<Route>().params;
  const { status, signIn } = useSession();
  const queryClient = useQueryClient();

  const verify = useMutation({ mutationFn: authApi.verifyEmail });
  const { mutate } = verify;
  const sent = useRef(false);

  useEffect(() => {
    // Once: StrictMode runs effects twice, and the token is single-use.
    if (sent.current) return;
    sent.current = true;
    mutate({ token });
  }, [token, mutate]);

  const onContinue = async () => {
    if (isTokenPair(verify.data)) {
      await signIn(verify.data);
    } else if (status === 'authenticated') {
      await queryClient.invalidateQueries({ queryKey: queryKeys.session.profile() });
    } else {
      navigation.navigate('Login');
    }
  };

  const backLabel = navigation.canGoBack() ? 'Log In' : undefined;
  const onBack = () => navigation.goBack();

  if (verify.isError) {
    const error = verify.error;
    const offline = error instanceof ApiError && error.isOffline;
    const expired = error instanceof ApiError && error.code === 'token_expired';
    return (
      <AuthShell
        title={
          offline
            ? CONFIRMED_COPY.offline
            : expired
              ? CONFIRMED_COPY.expired
              : CONFIRMED_COPY.invalid
        }
        subtitle={
          offline
            ? CONFIRMED_COPY.offlineBody
            : expired
              ? CONFIRMED_COPY.expiredBody
              : CONFIRMED_COPY.invalidBody
        }
        backLabel={backLabel}
        onBack={onBack}
        testID="email-confirmed-screen"
      >
        {offline ? (
          <Button
            label="Try again"
            onPress={() => mutate({ token })}
            fullWidth
            testID="confirmed-retry"
          />
        ) : (
          <Button
            label="Send a new link"
            onPress={() => navigation.navigate('VerifyEmailSent')}
            fullWidth
            testID="confirmed-resend"
          />
        )}
        <View style={styles.links}>
          <Button
            label="Back to Log In"
            variant="ghost"
            onPress={() => navigation.navigate('Login')}
            testID="confirmed-back-to-login"
          />
        </View>
      </AuthShell>
    );
  }

  const confirmed = verify.isSuccess;
  return (
    <AuthShell
      title={confirmed ? CONFIRMED_COPY.title : CONFIRMED_COPY.checking}
      subtitle={confirmed ? CONFIRMED_COPY.body : CONFIRMED_COPY.checkingBody}
      icon={confirmed ? <StatusIcon kind="check" animate /> : null}
      backLabel={backLabel}
      onBack={onBack}
      testID="email-confirmed-screen"
    >
      <Button
        label="Continue"
        onPress={onContinue}
        loading={!confirmed}
        loadingLabel={CONFIRMED_COPY.checking}
        fullWidth
        testID="confirmed-continue"
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
