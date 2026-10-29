/**
 * useBiometricUnlock — Face ID / Touch ID on Log In (handoff 05 §5).
 *
 * Offered only when all three hold: a session has existed on this device and
 * its refresh token was parked at sign-out (biometricStore), the device has
 * biometric hardware, and the user has enrolled. A "Log in with Face ID"
 * button stays on the screen whenever it is offered.
 *
 * The automatic prompt
 *   It opens by itself when Log In comes into focus, until the user cancels or
 *   declines it once. After that it stays quiet, however often Log In comes
 *   back into focus, until the app is backgrounded and reopened or launched
 *   fresh. The button still works the whole time.
 *
 * Once the OS prompt succeeds, the session layer does the rest
 * (session.restoreParked): the parked token goes through the client's own
 * single-flight refresh, never a separate call to /auth/refresh.
 *   success    → the session starts; the auth gate opens Home
 *   cancel     → nothing: the form is right there, with no error (05 §5)
 *   rejected   → the token is dead (expired, or revoked by a reset): it is
 *                forgotten and the button disappears
 *   offline    → the token is kept for next time, and a toast says why
 */
import { useFocusEffect } from '@react-navigation/native';
import * as LocalAuthentication from 'expo-local-authentication';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { useToast } from '@/components';
import { biometricStore } from '@/session/biometricStore';
import {
  ParkedSessionRejected,
  ParkedSessionUnavailable,
  useSession,
} from '@/session/SessionContext';

export type BiometricKind = 'Face ID' | 'Touch ID' | 'biometrics';

export const BIOMETRIC_PROMPT = 'Log in to SubTrak';

/** Shown when the refresh after a successful biometric prompt can't reach the server. */
export const BIOMETRIC_OFFLINE = "Couldn't reach SubTrak. Check your connection.";

/**
 * Set when the user cancels or declines the prompt; cleared when the app comes
 * back to the foreground. Module-level, so it outlives Log In unmounting and
 * remounting within one app session, and a fresh launch starts clear.
 */
let autoPromptDeclined = false;

/** Test helper: as if the app had just launched. */
export function resetBiometricAutoPrompt(): void {
  autoPromptDeclined = false;
}

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
  const { restoreParked } = useSession();
  const toast = useToast();
  const [kind, setKind] = useState<BiometricKind | null>(null);
  const [busy, setBusy] = useState(false);
  const running = useRef(false);

  // Coming back from the background counts as reopening the app.
  useEffect(() => {
    // currentState can be null before the first change event.
    let previous: string | null | undefined = AppState.currentState;
    const subscription = AppState.addEventListener('change', (next) => {
      if ((previous === 'background' || previous === 'inactive') && next === 'active') {
        autoPromptDeclined = false;
      }
      previous = next;
    });
    // Optional: test environments can hand back no subscription.
    return () => subscription?.remove?.();
  }, []);

  const unlock = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    try {
      if (!(await biometricStore.parkedRefreshToken())) {
        setKind(null);
        return;
      }
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: BIOMETRIC_PROMPT,
        cancelLabel: 'Use password',
      });
      if (!result.success) {
        autoPromptDeclined = true;
        return;
      }
      try {
        await restoreParked();
      } catch (error) {
        if (error instanceof ParkedSessionRejected) {
          setKind(null);
        } else if (error instanceof ParkedSessionUnavailable) {
          toast.show(BIOMETRIC_OFFLINE);
        } else {
          throw error;
        }
      }
    } finally {
      running.current = false;
      setBusy(false);
    }
  }, [restoreParked, toast]);

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
        if (available && !autoPromptDeclined) await unlock();
      })();
      return () => {
        cancelled = true;
      };
    }, [unlock]),
  );

  return { kind, busy, unlock };
}
