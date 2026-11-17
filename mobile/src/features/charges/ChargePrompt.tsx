/**
 * "Was the charge different?" on Home (US-19; system design spec §Billing
 * events: the dashboard asks after a renewal date passes).
 *
 * One card per bill that went by unconfirmed, newest first, at most
 * MAX_CHARGES. "That's right" confirms the expected amount in place; "It was
 * different" opens ConfirmCharge to enter the real one. Home hides the whole
 * section when nothing is waiting.
 *
 * Neutral card, not the amber alert: it is a question, not a warning. The
 * warning comes later, from the server, if the amount turns out higher.
 */
import { useState } from 'react';
import { Text, View } from 'react-native';

import { messageFor, ApiError } from '@/api/errors';
import { Button, Card, FieldMessage } from '@/components';
import { makeStyles, spacing } from '@/theme';

import type { Charge } from './api';
import { CHARGE_COPY, expectedLine, promptLabel, promptTitle } from './chargeCopy';
import { useConfirmCharge } from './useConfirmCharge';

export const MAX_CHARGES = 3;

export function ChargePromptList({
  charges,
  onDifferent,
}: {
  charges: Charge[];
  onDifferent: (charge: Charge) => void;
}) {
  const styles = useStyles();
  return (
    <View style={styles.list}>
      {charges.slice(0, MAX_CHARGES).map((charge) => (
        <ChargePrompt
          key={charge.id}
          charge={charge}
          onDifferent={() => onDifferent(charge)}
        />
      ))}
    </View>
  );
}

function ChargePrompt({
  charge,
  onDifferent,
}: {
  charge: Charge;
  onDifferent: () => void;
}) {
  const styles = useStyles();
  const [error, setError] = useState<string>();
  const confirm = useConfirmCharge(charge.id, {
    onFailed: (failure) =>
      setError(
        failure instanceof ApiError && failure.isOffline
          ? CHARGE_COPY.offline
          : messageFor(failure),
      ),
  });
  const busy = confirm.isPending;

  return (
    <Card testID={`charge-${charge.id}`}>
      <View style={styles.body}>
        {/* Read as one sentence; the buttons stay separately focusable. */}
        <View accessible accessibilityLabel={promptLabel(charge)}>
          <Text style={styles.title}>{promptTitle(charge)}</Text>
          <Text style={styles.message}>{expectedLine(charge)}</Text>
        </View>
        <View style={styles.actions}>
          <View style={styles.action}>
            <Button
              label={CHARGE_COPY.confirm}
              onPress={() => {
                setError(undefined);
                confirm.mutate(undefined);
              }}
              loading={busy}
              loadingLabel="Confirming"
              accessibilityLabel={`${CHARGE_COPY.confirm}, ${charge.name} charged the expected amount`}
              fullWidth
              testID={`charge-${charge.id}-confirm`}
            />
          </View>
          <View style={styles.action}>
            <Button
              label={CHARGE_COPY.different}
              onPress={onDifferent}
              disabled={busy}
              variant="secondary"
              accessibilityHint="Opens a form to enter the amount charged"
              fullWidth
              testID={`charge-${charge.id}-different`}
            />
          </View>
        </View>
        {error ? <FieldMessage error={error} testID={`charge-${charge.id}`} /> : null}
      </View>
    </Card>
  );
}

const useStyles = makeStyles(({ colors, typography }) => ({
  list: {
    gap: spacing.md,
  },
  body: {
    gap: spacing.md,
  },
  title: {
    ...typography.alertTitle,
    color: colors.text,
  },
  message: {
    ...typography.bodyMd,
    color: colors.textMuted,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  action: {
    flex: 1,
  },
}));
