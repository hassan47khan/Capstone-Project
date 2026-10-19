/**
 * useAuthGate — decides which stack the app opens on (handoff 03 §5).
 *
 * The five launch cases
 *   1. Session still resolving from secure storage   → 'splash'
 *   2. No valid session                              → 'auth'
 *   3. Valid session, email not verified             → 'verify'  (Auth at VerifyEmailSent)
 *   4. Valid session, verified, zero subscriptions   → 'app'     (Home, empty state — 06)
 *   5. Valid session, verified, has subscriptions    → 'app'     (Home)
 *
 * No flash of the wrong stack
 *   While the session or the profile is still loading the gate says 'splash',
 *   and RootNavigator renders nothing, which keeps Expo's splash screen up.
 *   So a signed-in user never glimpses Log in on the way to Home.
 *
 * Where verification comes from
 *   The session itself only knows "signed in or not". Whether the email is
 *   verified lives on the profile (`GET /me`), fetched once the session is
 *   authenticated and cached under the session's profile key.
 *
 * If /me cannot be reached
 *   An offline launch with a valid session falls through to the app rather
 *   than locking the user out; the screens show their own offline states. Only
 *   an explicit `email_verified: false` routes to verification.
 */
import { useQuery } from '@tanstack/react-query';

import { meApi } from '@/api/endpoints';
import { queryKeys } from '@/api/queryKeys';

import { useSession } from './SessionContext';

export type GateDecision = 'splash' | 'auth' | 'verify' | 'app';

export function useAuthGate(): GateDecision {
  const { status } = useSession();
  const authenticated = status === 'authenticated';

  const profile = useQuery({
    queryKey: queryKeys.session.profile(),
    queryFn: meApi.getProfile,
    enabled: authenticated,
    // A failed profile fetch must not hold the splash: the app opens and its
    // screens handle being offline.
    retry: false,
  });

  if (status === 'loading') return 'splash';
  if (!authenticated) return 'auth';
  if (profile.isPending && profile.fetchStatus !== 'idle') return 'splash';
  if (profile.data && !profile.data.email_verified) return 'verify';
  return 'app';
}
