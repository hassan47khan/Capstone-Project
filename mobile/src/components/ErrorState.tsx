/**
 * ErrorState — what a screen shows when loading failed.
 *
 * What it is for
 *   Any screen whose data did not arrive: the server erred, the request timed
 *   out, or the phone has no connection.
 *
 * Why offline is a distinct variant and not just another message
 *   The two need different things from the user. A server error is ours to fix
 *   and worth retrying immediately; being offline is theirs, and a Retry button
 *   that fails again instantly is worse than useless. Prompt section 9 asks for
 *   "error with retry, and a distinct offline state", and this is that
 *   distinction made concrete.
 *
 * Why a 404 gets its own variant
 *   The API returns 404 for another user's record as well as a missing one, so
 *   ids cannot be probed. The copy therefore has to work for both and must never
 *   say "you do not have permission" — that would confirm the record exists.
 *
 * Design tokens
 *   title    typography.rowTitle
 *   body     typography.body, centred
 *
 * Used by: every screen that loads data.
 */
import { StyleSheet, Text, View } from 'react-native';

import { ApiError } from '@/api/errors';
import { spacing, typography } from '@/theme';

import { Button } from './Button';

export type ErrorVariant = 'error' | 'offline' | 'notFound';

export interface ErrorStateProps {
  /**
   * The thrown error. The variant is derived from it, so a caller normally
   * passes the error straight from a query and nothing else.
   */
  error?: unknown;

  /** Forces a variant, for a screen that already knows what went wrong. */
  variant?: ErrorVariant;

  /** Omit on a screen where retrying cannot help, such as a 404. */
  onRetry?: () => void;

  testID?: string;
}

/** Copy per variant. Plain, specific, and free of blame. */
const COPY: Record<ErrorVariant, { title: string; message: string; retryLabel: string }> =
  {
    error: {
      title: 'Something went wrong',
      message: 'We could not load this just now. Try again in a moment.',
      retryLabel: 'Try again',
    },
    offline: {
      title: 'You are offline',
      message: 'Check your connection. Your subscriptions will load once you are back.',
      retryLabel: 'Try again',
    },
    notFound: {
      title: 'Not found',
      // Deliberately says nothing about ownership. See the header comment.
      message: 'This item is no longer available.',
      retryLabel: 'Go back',
    },
  };

/** Picks the variant from the error, defaulting to the generic one. */
function variantFor(error: unknown): ErrorVariant {
  if (!(error instanceof ApiError)) return 'error';
  if (error.isOffline) return 'offline';
  if (error.status === 404) return 'notFound';
  return 'error';
}

export function ErrorState({ error, variant, onRetry, testID }: ErrorStateProps) {
  const resolved = variant ?? variantFor(error);
  const copy = COPY[resolved];

  return (
    <View
      style={styles.container}
      accessible
      // "alert" so the failure is announced on arrival rather than waiting to be
      // found — a user who cannot see the screen otherwise just gets silence.
      accessibilityRole="alert"
      accessibilityLabel={`${copy.title}. ${copy.message}`}
      testID={testID}
    >
      <Text style={styles.title}>{copy.title}</Text>
      <Text style={styles.message}>{copy.message}</Text>

      {onRetry ? (
        <Button
          label={copy.retryLabel}
          onPress={onRetry}
          variant="secondary"
          testID={testID ? `${testID}-retry` : undefined}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xxl * 2,
    paddingHorizontal: spacing.xl,
  },
  title: {
    ...typography.rowTitle,
    textAlign: 'center',
  },
  message: {
    ...typography.body,
    textAlign: 'center',
    maxWidth: 280,
    marginBottom: spacing.sm,
  },
});
