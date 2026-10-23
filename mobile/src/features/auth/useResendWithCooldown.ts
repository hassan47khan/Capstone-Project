/**
 * Resend, shared by the two check-your-email screens (05 §4): Verify Email
 * Sent and Reset Link Sent.
 *
 *   success   the server's cooldown_seconds starts the countdown (a response
 *             without it gets DEFAULT_RESEND_COOLDOWN_SECONDS), and a toast
 *   429       the server's message, shown only while the fallback countdown
 *             runs, so it clears when Resend comes back
 *   offline   a toast
 *   other     the message, above the actions
 *
 * Resend is unavailable while a request is in flight and while the countdown
 * runs. `initialCooldown` seeds the countdown on mount, for a screen reached
 * right after a send whose response already named the wait.
 *
 * The contract returns cooldown_seconds; the hand-written client in src/api
 * still types these responses without it, so it is read defensively.
 */
import { useMutation } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Linking, Platform } from 'react-native';

import { ApiError, messageFor } from '@/api/errors';
import { useToast } from '@/components';

import { RATE_LIMIT_FALLBACK_SECONDS, useCountdown } from './useCountdown';

/** Used when a resend response carries no cooldown. */
export const DEFAULT_RESEND_COOLDOWN_SECONDS = 60;

/** Opens the default mail client, inbox first where the platform allows. */
export async function openMailApp(): Promise<void> {
  await Linking.openURL(Platform.OS === 'ios' ? 'message://' : 'mailto:');
}

/** cooldown_seconds from a response the client does not type it on yet. */
export function cooldownFrom(response: unknown): number | undefined {
  const seconds = (response as { cooldown_seconds?: unknown } | null)?.cooldown_seconds;
  return typeof seconds === 'number' ? seconds : undefined;
}

export interface ResendOptions<Body> {
  send: (body: Body) => Promise<unknown>;
  /** The success toast, e.g. "Confirmation email resent". */
  resentMessage: string;
  offlineMessage: string;
  /** Seconds to wait before the first resend, from the send that led here. */
  initialCooldown?: number;
}

export interface Resend<Body> {
  /** Seconds left; 0 when Resend can be pressed. */
  remaining: number;
  waiting: boolean;
  pending: boolean;
  /** Message for the form banner, if any. */
  error?: string;
  resend: (body: Body) => void;
  /** Opens the mail app, or toasts `fallback` when none opens. */
  openMail: (fallback: string) => void;
}

export function useResendWithCooldown<Body>({
  send,
  resentMessage,
  offlineMessage,
  initialCooldown,
}: ResendOptions<Body>): Resend<Body> {
  const toast = useToast();
  const cooldown = useCountdown();
  const [formError, setFormError] = useState<string>();
  const [limitError, setLimitError] = useState<string>();

  const seeded = useRef(false);
  const { start } = cooldown;
  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    if (initialCooldown && initialCooldown > 0) start(initialCooldown);
  }, [initialCooldown, start]);

  const mutation = useMutation({
    mutationFn: send,
    onSuccess: (response) => {
      start(cooldownFrom(response) ?? DEFAULT_RESEND_COOLDOWN_SECONDS);
      toast.show(resentMessage, 'success');
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 429) {
        setLimitError(error.message);
        start(RATE_LIMIT_FALLBACK_SECONDS);
      } else if (error instanceof ApiError && error.isOffline) {
        toast.show(offlineMessage);
      } else {
        setFormError(messageFor(error));
      }
    },
  });

  const waiting = cooldown.remaining > 0;
  const pending = mutation.isPending;

  return {
    remaining: cooldown.remaining,
    waiting,
    pending,
    error: formError ?? (waiting ? limitError : undefined),
    resend: (body) => {
      if (waiting || pending) return;
      setFormError(undefined);
      mutation.mutate(body);
    },
    openMail: (fallback) => {
      openMailApp().catch(() => toast.show(fallback));
    },
  };
}
