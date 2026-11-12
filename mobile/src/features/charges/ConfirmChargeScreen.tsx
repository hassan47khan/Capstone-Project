/**
 * Was the charge different? (US-19). A modal over Home, opened from a charge
 * card's "It was different".
 *
 * The user enters what the bill really was, in the charge's own currency.
 * POST /charges/{id}/confirm decides the rest: higher moves the price and
 * raises the price-increase alert if the Notification Rules want it, lower
 * moves the price quietly. The app never compares the two amounts.
 *
 * There is no GET for one charge, so the screen reads it from the unconfirmed
 * list (usually already cached by Home).
 *
 * States
 *   loading     skeleton rows while the list loads
 *   error       full-screen error with retry
 *   gone        the charge isn't waiting any more (confirmed elsewhere): Go back
 *   idle        Save disabled until the amount is a price above zero
 *   saving      Save shows a spinner; the field is locked; closing is blocked
 *   failed      the message under the amount field, field error or not
 *   saved       back to Home with a toast saying what was recorded
 */
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2 } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';

import { ApiError, fieldError, messageFor } from '@/api/errors';
import { formatDateLong } from '@/api/format';
import {
  Button,
  CurrencyField,
  EmptyState,
  ErrorState,
  Header,
  invalidPriceMessage,
  isValidPrice,
  Screen,
  Skeleton,
  SkeletonGroup,
} from '@/components';
import type { AppStackParamList } from '@/navigation/types';
import { useDiscardGuard } from '@/navigation/useDiscardGuard';
import { makeStyles, sizes, spacing } from '@/theme';

import { chargesKey, listCharges, type Charge } from './api';
import { CHARGE_COPY, expectedLine } from './chargeCopy';
import { useConfirmCharge } from './useConfirmCharge';

type Navigation = NativeStackNavigationProp<AppStackParamList>;
type Route = RouteProp<AppStackParamList, 'ConfirmCharge'>;

export function ConfirmChargeScreen() {
  const navigation = useNavigation<Navigation>();
  const { id } = useRoute<Route>().params;
  const close = () => navigation.goBack();
  const header = <Header title={CHARGE_COPY.screenTitle} onClose={close} />;

  const charges = useQuery({ queryKey: chargesKey, queryFn: listCharges });
  const charge = charges.data?.results.find((row) => row.id === id);

  if (charges.isError && !charges.data) {
    return (
      <Screen edges={['top', 'bottom']} testID="charge-screen">
        {header}
        <ErrorState
          error={charges.error}
          onRetry={() => charges.refetch()}
          testID="charge-error"
        />
      </Screen>
    );
  }

  if (!charges.data) {
    return (
      <Screen edges={['top', 'bottom']} testID="charge-screen">
        {header}
        <SkeletonGroup label={CHARGE_COPY.loading} testID="charge-loading">
          {[0, 1].map((row) => (
            <Skeleton key={row} height={sizes.field} />
          ))}
        </SkeletonGroup>
      </Screen>
    );
  }

  if (!charge) {
    return (
      <Screen edges={['top', 'bottom']} testID="charge-screen">
        {header}
        <EmptyState
          icon={CheckCircle2}
          title={CHARGE_COPY.goneTitle}
          message={CHARGE_COPY.goneBody}
          actionLabel={CHARGE_COPY.goBack}
          onAction={close}
          testID="charge-gone"
        />
      </Screen>
    );
  }

  return <AmountForm key={charge.id} charge={charge} />;
}

function AmountForm({ charge }: { charge: Charge }) {
  const styles = useStyles();
  const navigation = useNavigation<Navigation>();
  const currency = charge.expected.currency;

  const [amount, setAmount] = useState('');
  const [touched, setTouched] = useState(false);
  const [serverError, setServerError] = useState<string>();
  const [formError, setFormError] = useState<string>();
  // The ref is for the close-blocking listener, which can't see new state.
  const [isSaving, setIsSaving] = useState(false);
  const saving = useRef(false);
  const setSaving = (on: boolean) => {
    saving.current = on;
    setIsSaving(on);
  };

  const valid = isValidPrice(amount);
  const { sheet, allowLeave } = useDiscardGuard(amount !== '' && !isSaving);

  useEffect(
    () =>
      navigation.addListener('beforeRemove', (event) => {
        if (saving.current) event.preventDefault();
      }),
    [navigation],
  );

  const leave = () => {
    setSaving(false);
    if (!navigation.isFocused()) return;
    allowLeave();
    navigation.goBack();
  };

  const confirm = useConfirmCharge(charge.id, {
    onSettled: leave,
    onFailed: (error) => {
      setSaving(false);
      if (error instanceof ApiError && error.isOffline) {
        setFormError(CHARGE_COPY.offline);
        return;
      }
      const onField = fieldError(error, 'amount');
      if (onField) setServerError(onField);
      else setFormError(messageFor(error));
    },
  });

  const save = () => {
    setTouched(true);
    if (!valid || isSaving) return;
    setFormError(undefined);
    setSaving(true);
    confirm.mutate(amount);
  };

  // One error slot, the field's own, for every failure: the form has a single
  // input, so a separate form-level box would show the same thing twice over.
  const shownError =
    serverError ??
    formError ??
    (touched && amount !== '' && !valid ? invalidPriceMessage(currency) : undefined);

  return (
    <Screen
      edges={['top', 'bottom']}
      testID="charge-screen"
      footer={
        <View style={styles.footer}>
          <Button
            label={CHARGE_COPY.save}
            onPress={save}
            disabled={!valid}
            loading={isSaving}
            loadingLabel={CHARGE_COPY.saving}
            fullWidth
            testID="charge-save"
          />
          <Button
            label={CHARGE_COPY.cancel}
            onPress={() => navigation.goBack()}
            disabled={isSaving}
            variant="secondary"
            fullWidth
            testID="charge-cancel"
          />
        </View>
      }
    >
      <Header title={CHARGE_COPY.screenTitle} onClose={() => navigation.goBack()} />

      <View style={styles.summary}>
        <Text style={styles.name} accessibilityRole="header">
          {charge.name}
        </Text>
        <Text style={styles.detail}>Billed {formatDateLong(charge.charged_on)}</Text>
        <Text style={styles.detail} testID="charge-expected">
          {expectedLine(charge)}
        </Text>
      </View>

      <CurrencyField
        label={CHARGE_COPY.amountLabel}
        value={amount}
        onChangeValue={(next) => {
          setAmount(next);
          setServerError(undefined);
          setFormError(undefined);
        }}
        onBlur={() => setTouched(true)}
        currency={currency}
        helper={CHARGE_COPY.amountHelper}
        error={shownError}
        editable={!isSaving}
        testID="charge-amount"
      />

      {sheet}
    </Screen>
  );
}

const useStyles = makeStyles(({ colors, typography }) => ({
  footer: {
    gap: spacing.sm,
  },
  summary: {
    gap: spacing.xs,
    marginBottom: spacing.xl,
  },
  name: {
    ...typography.displaySm,
    color: colors.text,
  },
  detail: {
    ...typography.bodyMd,
    color: colors.textMuted,
  },
}));
