/**
 * useBiometricUnlock — Face ID / Touch ID on Log In (handoff 05 §5).
 *
 * Offered only when all three hold: a session has existed on this device and
 * its refresh token was parked at sign-out (biometricStore), the device has
 * biometric hardware, and the user has enrolled. Then the prompt opens by
 * itself once each time Log In comes into focus, and a button stays on the
 * screen to try again.
 *
 *   success    → the parked refresh token goes through the normal refresh
 *                call and the session starts; the auth gate opens Home
 *   cancel     → nothing: the form is right there, with no error (05 §5)
 *   rejected   → the token is dead (expired, or revoked by a reset), so the
 *                stored state is cleared and the button disappears
 *   offline    → the token is kept for next time
 */
import { useFocusEffect } from '@react-navigation/native';
import * as LocalAuthentication from 'expo-local-authentication';
import { useCallback, useRef, useState } from 'react';

import { isRefreshRejected } from '@/api/client';
import { authApi } from '@/api/endpoints';
import { ApiError, messageFor } from '@/api/errors';
import { useToast } from '@/components';
import { biometricStore } from '@/session/biometricStore';
import { useSession } from '@/session/SessionContext';

export type BiometricKind = 'Face ID' | 'Touch ID' | 'biometrics';

export const BIOMETRIC_PROMPT = 'Log in to SubTrak';

/** Shown when the refresh after a successful biometric prompt can't reach the server. */
export const BIOMETRIC_OFFLINE = "Couldn't reach SubTrak. Check your connection.";

/** The kind the device offers, or null when there is none or none enrolled. */
export async function availableBiometric(): Promise<BiometricKind | null> {
  try {
    if (!(await LocalAuthentication.hasHardwareAsync())) return null;
    if (!(await LocalAuthentication.isEnrolledAsync())) return null;
    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
    if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
      return 'Face ID';
    }
    if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT))
      return 'Touch ID';
    return 'biometrics';
  } catch {
    return null;
  }
}

export interface BiometricUnlock {
  /** What to call it on the button, or null when unlock is not offered. */
  kind: BiometricKind | null;
  busy: boolean;
  unlock: () => Promise<void>;
}

export function useBiometricUnlock(): BiometricUnlock {
  const { signIn } = useSession();
  const toast = useToast();
  const [kind, setKind] = useState<BiometricKind | null>(null);
  const [busy, setBusy] = useState(false);
  const running = useRef(false);

  const unlock = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    try {
      const refresh = await biometricStore.parkedRefreshToken();
      if (!refresh) {
        setKind(null);
        return;
      }
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: BIOMETRIC_PROMPT,
        cancelLabel: 'Use password',
      });
      if (!result.success) return;
      try {
        await signIn(await authApi.refresh({ refresh }));
      } catch (error) {
        if (error instanceof ApiError && isRefreshRejected(error.status)) {
          // The token is dead (expired or revoked): stop offering biometric.
          await biometricStore.forget();
          setKind(null);
        } else if (error instanceof ApiError && error.isOffline) {
          // Keep the token for next time, but say why nothing happened.
          toast.show(BIOMETRIC_OFFLINE);
        } else {
          toast.show(messageFor(error));
        }
      }
    } finally {
      running.current = false;
      setBusy(false);
    }
  }, [signIn, toast]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        const offered =
          (await biometricStore.isEstablished()) &&
          Boolean(await biometricStore.parkedRefreshToken());
        const available = offered ? await availableBiometric() : null;
        if (cancelled) return;
        setKind(available);
        if (available) await unlock();
      })();
      return () => {
        cancelled = true;
      };
    }, [unlock]),
  );

  return { kind, busy, unlock };
}
