/**
 * "Mark as cancelled" confirm sheet (handoff 07 §7; US-7).
 *
 * Confirming calls POST /subscriptions/{id}/cancel. The server keeps the
 * history, takes it out of every total and sets saved_per_year; the client
 * just refetches.
 *
 * Built on BottomSheet, not ConfirmSheet: 07 §7 wants an explicit choice for
 * both sheets (no backdrop tap), and ConfirmSheet only does that when it's red.
 *
 * States
 *   idle        "Mark as cancelled" + "Keep it"
 *   cancelling  confirm shows a spinner, "Keep it" disabled; the sheet can't close
 *   failed      the message under the copy; both buttons work again
 *   409         "already cancelled" counts as done: refetch and close
 *   404         deleted elsewhere: close and refetch; Detail shows "Not found"
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Text, View } from 'react-native';

import { ApiError, messageFor } from '@/api/errors';
import { queryKeys, subscriptionWriteInvalidations } from '@/api/queryKeys';
import { BottomSheet, Button } from '@/components';
import { makeStyles, spacing } from '@/theme';

import { cancelSubscription, type SubscriptionDetail } from './api';

export const CANCEL_COPY = {
  title: 'Mark as cancelled?',
  // 07 §7, word for word.
  body: (name: string) =>
    `${name} will stop counting toward your monthly total. Its history stays, and you can reactivate it anytime.`,
  confirm: 'Mark as cancelled',
  confirming: 'Marking as cancelled',
  keep: 'Keep it',
} as const;

interface Props {
  visible: boolean;
  id: string;
  name: string;
  /** Called once it's cancelled, or when the user keeps it. */
  onClose: () => void;
}

export function CancelSubscriptionSheet({ visible, id, name, onClose }: Props) {
  const styles = useStyles();
  const queryClient = useQueryClient();

  const refreshAndClose = (updated?: SubscriptionDetail) => {
    // Show "Cancelled" straight away, so the button can't be tapped twice
    // while the refetch runs.
    if (updated) queryClient.setQueryData(queryKeys.subscriptions.detail(id), updated);
    // Detail, lists, Home and Analytics all refetch (cancelled leaves totals).
    for (const queryKey of subscriptionWriteInvalidations) {
      void queryClient.invalidateQueries({ queryKey });
    }
    onClose();
  };

  const cancel = useMutation({
    mutationFn: () => cancelSubscription(id),
    onSuccess: (updated) => refreshAndClose(updated),
    onError: (error) => {
      // Already cancelled (another device, or a retry after a timeout): the
      // goal is met. Gone (deleted elsewhere): nothing to cancel, so refresh
      // and let Detail show its own "Not found".
      if (
        error instanceof ApiError &&
        (error.code === 'already_cancelled' || error.status === 404)
      ) {
        refreshAndClose();
        cancel.reset();
      }
    },
  });

  const busy = cancel.isPending;
  const failed = cancel.isError;

  const keep = () => {
    if (busy) return;
    cancel.reset(); // a reopened sheet starts clean
    onClose();
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={keep}
      title={CANCEL_COPY.title}
      // 07 §7: no backdrop-tap or back-button dismissal; pick a button.
      dismissible={false}
      testID="cancel-sheet"
    >
      <Text style={styles.body}>{CANCEL_COPY.body(name)}</Text>
      {failed ? (
        <Text
          style={styles.error}
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
          testID="cancel-sheet-error"
        >
          {messageFor(cancel.error)}
        </Text>
      ) : null}
      <View style={styles.actions}>
        <Button
          label={CANCEL_COPY.confirm}
          loading={busy}
          loadingLabel={CANCEL_COPY.confirming}
          onPress={() => cancel.mutate()}
          fullWidth
          testID="cancel-sheet-confirm"
        />
        <Button
          label={CANCEL_COPY.keep}
          variant="secondary"
          onPress={keep}
          disabled={busy}
          fullWidth
          testID="cancel-sheet-keep"
        />
      </View>
    </BottomSheet>
  );
}

const useStyles = makeStyles(({ colors, typography }) => ({
  body: {
    ...typography.bodyMd,
    color: colors.textMuted,
  },
  // Red only because it's an error (01 §2).
  error: {
    ...typography.bodyMd,
    color: colors.danger,
  },
  actions: {
    gap: spacing.md,
  },
}));
