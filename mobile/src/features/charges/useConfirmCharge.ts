/**
 * Confirming a charge, shared by the Home prompt and the amount screen.
 *
 * A confirmation can change the subscription's price, so it invalidates
 * everything a subscription write does, plus the charge list itself.
 *
 * 409 (already confirmed, say on another device) and 404 (gone, or not
 * yours) both mean there is nothing left to ask: the list refetches, a toast
 * says why, and `onSettled` reports it as handled. Any other failure goes to
 * `onFailed` for the caller to show where it happened.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { ApiError } from '@/api/errors';
import { subscriptionWriteInvalidations } from '@/api/queryKeys';
import type { MoneyString } from '@/api/types';
import { useToast } from '@/components';

import { chargesKey, confirmCharge } from './api';
import { CHARGE_COPY, confirmedMessage } from './chargeCopy';

interface Options {
  /** The charge is no longer waiting: confirmed now, or already. */
  onSettled?: () => void;
  /** Anything else: offline, a field error, the server down. */
  onFailed?: (error: unknown) => void;
}

export function useConfirmCharge(id: string, { onSettled, onFailed }: Options = {}) {
  const queryClient = useQueryClient();
  const toast = useToast();

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: chargesKey });
    for (const queryKey of subscriptionWriteInvalidations) {
      void queryClient.invalidateQueries({ queryKey });
    }
  };

  return useMutation({
    mutationFn: (amount?: MoneyString) => confirmCharge(id, amount),
    onSuccess: (charge) => {
      refresh();
      toast.show(confirmedMessage(charge), 'success');
      onSettled?.();
    },
    onError: (error) => {
      if (error instanceof ApiError && (error.status === 409 || error.status === 404)) {
        void queryClient.invalidateQueries({ queryKey: chargesKey });
        toast.show(
          error.status === 409 ? CHARGE_COPY.alreadyConfirmed : CHARGE_COPY.notFound,
          'neutral',
        );
        onSettled?.();
        return;
      }
      onFailed?.(error);
    },
  });
}
