/**
 * useCountdown — seconds left on a server-imposed wait (05 §4, §9).
 *
 * Drives "Resend in 0:42" on the check-your-email screens and the rate-limited
 * Log in button. The number of seconds comes from the server; this only counts
 * it down, once a second, and reports zero when the wait is over.
 */
import { useCallback, useEffect, useState } from 'react';

const SECOND_MS = 1000;

export interface Countdown {
  /** Whole seconds left; 0 when nothing is pending. */
  remaining: number;
  /** Starts (or restarts) the wait. */
  start: (seconds: number) => void;
}

export function useCountdown(): Countdown {
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (endsAt === null) return undefined;
    const timer = setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= endsAt) setEndsAt(null);
    }, SECOND_MS);
    return () => clearInterval(timer);
  }, [endsAt]);

  const start = useCallback((seconds: number) => {
    const current = Date.now();
    setNow(current);
    setEndsAt(seconds > 0 ? current + seconds * SECOND_MS : null);
  }, []);

  const remaining =
    endsAt === null ? 0 : Math.max(0, Math.ceil((endsAt - now) / SECOND_MS));
  return { remaining, start };
}

/** 42 → "0:42", 125 → "2:05". */
export function formatCountdown(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${rest.toString().padStart(2, '0')}`;
}
