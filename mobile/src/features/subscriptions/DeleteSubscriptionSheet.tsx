/**
 * Detail's ⋯ menu, its "Delete subscription?" confirm, and the Undo toast
 * (handoff 07 §4, §7; US-7).
 *
 * One sheet, two steps: the menu ("Delete subscription"), then the confirm in
 * the same sheet. Two sheets would be two Modals, and iOS can't present one
 * while the other is still closing, so the confirm could fail to appear.
 *
 * Delete is soft: DELETE /subscriptions/{id} takes it out of every list and
 * total and keeps its history. The sheet pops back to wherever Detail was
 * opened from, then shows "Subscription deleted · Undo" for 6 seconds. Undo
 * calls POST /subscriptions/{id}/restore, which puts back the status it had
 * (active or cancelled).
 *
 * The confirm step is BottomSheet's destructive tone (alert header, no grabber)
 * with no backdrop or back-button dismissal (07 §7, 02 §12). ConfirmSheet can't
 * take the bold "{Name} ($15.49/mo)" lead-in or a busy state.
 *
 * States
 *   menu       "Delete subscription"; disabled with a reason when offline
 *   confirm    "Delete" + "Cancel"
 *   deleting   Delete shows a spinner, Cancel disabled; the sheet can't close
 *   failed     the message under the copy; both buttons work again
 *   404        already gone: close and refetch; Detail shows "Not found"
 *   deleted    back to the previous screen, with the Undo toast
 */
import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { ApiError, messageFor } from '@/api/errors';
import { formatMoney } from '@/api/format';
import { queryKeys, subscriptionWriteInvalidations } from '@/api/queryKeys';
import { BottomSheet, Button, useToast } from '@/components';
import { makeStyles, spacing } from '@/theme';

import { deleteSubscription, restoreSubscription, type SubscriptionDetail } from './api';
import { cycleSuffix } from './historyLines';

export const DELETE_COPY = {
  menuTitle: 'More options',
  menuDelete: 'Delete subscription',
  offline: 'Connect to the internet to make changes.',
  title: 'Delete subscription?',
  // 07 §7, after the bold "{Name} ({price}/{cycle})".
  body: ' will be removed from your subscriptions and totals. Its history is kept.',
  confirm: 'Delete',
  confirming: 'Deleting subscription',
  keep: 'Cancel',
  deleted: 'Subscription deleted',
  undo: 'Undo',
  restored: 'Subscription restored',
  undoFailed: "Couldn't undo the delete.",
  retry: 'Try again',
} as const;

// 07 §7: the Undo toast stays up for 6 seconds.
export const UNDO_HOLD_MS = 6000;

interface Props {
  visible: boolean;
  subscription: SubscriptionDetail;
  /** No connection: Delete is disabled with a reason (07 §9). */
  offline: boolean;
  /** Called when the menu is dismissed or the user keeps it. */
  onClose: () => void;
  /** Called once it's deleted: leave Detail. */
  onDeleted: () => void;
}

// Everything that shows subscriptions or totals refetches. The deleted one's
// own detail doesn't: it would 404 while Detail is still sliding away.
function refreshAllBut(queryClient: QueryClient, id: string) {
  const detailKey = JSON.stringify(queryKeys.subscriptions.detail(id));
  for (const queryKey of subscriptionWriteInvalidations) {
    void queryClient.invalidateQueries({
      queryKey,
      predicate: (query) => JSON.stringify(query.queryKey) !== detailKey,
    });
  }
}

export function DeleteSubscriptionSheet({
  visible,
  subscription,
  offline,
  onClose,
  onDeleted,
}: Props) {
  const styles = useStyles();
  // Each opening starts at the menu (set while rendering, like BottomSheet).
  const [step, setStep] = useState<'menu' | 'confirm'>('menu');
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setStep('menu');
  }
  const queryClient = useQueryClient();
  const toast = useToast();
  const { id, name } = subscription;
  const price = formatMoney(
    subscription.billing_price,
    subscription.billing_currency,
  ).display;
  const suffix = cycleSuffix({
    billing_cycle: subscription.billing_cycle,
    custom_cycle_count: subscription.custom_cycle_count,
    custom_cycle_unit: subscription.custom_cycle_unit,
  });
  const lead = `${name} (${price}${suffix})`;

  // Undo can run after Detail has closed, so it uses only app-wide things
  // (the cache and the toast), never this sheet's state.
  const undo = () => {
    restoreSubscription(id).then(
      (restored) => {
        queryClient.setQueryData(queryKeys.subscriptions.detail(id), restored);
        refreshAllBut(queryClient, id);
        toast.show(DELETE_COPY.restored);
      },
      () =>
        // Still deleted: offer the same undo again rather than lose it.
        toast.show(DELETE_COPY.undoFailed, 'neutral', {
          action: { label: DELETE_COPY.retry, onPress: undo },
          holdMs: UNDO_HOLD_MS,
        }),
    );
  };

  const remove = useMutation({
    mutationFn: () => deleteSubscription(id),
    onSuccess: () => {
      refreshAllBut(queryClient, id);
      onDeleted();
      toast.show(DELETE_COPY.deleted, 'neutral', {
        action: {
          label: DELETE_COPY.undo,
          onPress: undo,
          accessibilityLabel: `Undo deleting ${name}`,
        },
        holdMs: UNDO_HOLD_MS,
      });
    },
    onError: (error) => {
      // Gone already (deleted on another device): nothing to delete. Refresh
      // and let Detail show its own "Not found".
      if (error instanceof ApiError && error.status === 404) {
        for (const queryKey of subscriptionWriteInvalidations) {
          void queryClient.invalidateQueries({ queryKey });
        }
        onClose();
        remove.reset();
      }
    },
  });

  const busy = remove.isPending;

  const keep = () => {
    if (busy) return;
    remove.reset(); // a reopened sheet starts clean
    onClose();
  };

  if (step === 'menu') {
    return (
      <BottomSheet
        visible={visible}
        onClose={onClose}
        title={DELETE_COPY.menuTitle}
        testID="detail-menu"
      >
        <Button
          label={DELETE_COPY.menuDelete}
          variant="destructiveOutline"
          onPress={() => setStep('confirm')}
          disabled={offline}
          accessibilityHint={offline ? DELETE_COPY.offline : undefined}
          fullWidth
          testID="detail-menu-delete"
        />
        {offline ? <Text style={styles.body}>{DELETE_COPY.offline}</Text> : null}
      </BottomSheet>
    );
  }

  return (
    <BottomSheet
      visible={visible}
      onClose={keep}
      title={DELETE_COPY.title}
      tone="destructive"
      // 07 §7: no backdrop-tap or back-button dismissal; pick a button.
      dismissible={false}
      testID="delete-sheet"
    >
      <Text style={styles.body} testID="delete-sheet-body">
        <Text style={styles.lead}>{lead}</Text>
        {DELETE_COPY.body}
      </Text>
      {remove.isError ? (
        <Text
          style={styles.error}
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
          testID="delete-sheet-error"
        >
          {messageFor(remove.error)}
        </Text>
      ) : null}
      <View style={styles.actions}>
        <Button
          label={DELETE_COPY.confirm}
          variant="destructive"
          loading={busy}
          loadingLabel={DELETE_COPY.confirming}
          onPress={() => remove.mutate()}
          fullWidth
          testID="delete-sheet-confirm"
        />
        <Button
          label={DELETE_COPY.keep}
          variant="secondary"
          onPress={keep}
          disabled={busy}
          fullWidth
          testID="delete-sheet-keep"
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
  lead: {
    ...typography.labelBold,
    color: colors.text,
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
