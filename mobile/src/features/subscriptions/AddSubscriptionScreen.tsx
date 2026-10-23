/**
 * Add subscription (handoff 07 §1–3; US-7). Figma `4:3340` / `4:3417` / `4:3509`.
 *
 * A modal with an X. Saving sends POST /subscriptions; the server checks the
 * data again, works out the next bill date and does every sum.
 *
 * States (07 §9)
 *   idle        Save disabled until the form is valid
 *   error       each field's message shows after it loses focus (or on Save)
 *   saving      Save shows a spinner; fields are locked
 *   failed      a banner at the top; everything typed is kept
 *   saved       opens the new subscription's detail screen
 *
 * Closing a form with something typed in asks "Discard changes?" first; an
 * untouched form closes straight away (07 §1, useDiscardGuard).
 *
 *
 */
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { ApiError, messageFor } from '@/api/errors';
import { subscriptionWriteInvalidations } from '@/api/queryKeys';
import { Button, Header, Screen } from '@/components';
import type { AppStackParamList } from '@/navigation/types';
import { useDiscardGuard } from '@/navigation/useDiscardGuard';
import { makeStyles, radius, spacing } from '@/theme';

import { createSubscription } from './api';
import { SubscriptionForm } from './SubscriptionForm';
import {
  EMPTY_FORM,
  formErrorsFromServer,
  isFormDirty,
  toSubscriptionInput,
  validateForm,
  type FormErrors,
  type FormField,
  type FormValues,
} from './formRules';
import { localToday } from './today';

export const ADD_COPY = {
  title: 'Add subscription',
  save: 'Save',
  saving: 'Saving subscription',
  offline: "You're offline, so this wasn't saved. Connect and try again.",
} as const;

type Navigation = NativeStackNavigationProp<AppStackParamList>;

export function AddSubscriptionScreen() {
  const styles = useStyles();
  const navigation = useNavigation<Navigation>();
  const queryClient = useQueryClient();

  const [values, setValues] = useState<FormValues>(EMPTY_FORM);
  // Fields the user has left; their errors are shown from then on.
  const [touched, setTouched] = useState<Set<FormField>>(new Set());
  // After pressing Save, every error shows, touched or not.
  const [submitted, setSubmitted] = useState(false);
  // Errors the server sent back for particular fields.
  const [serverErrors, setServerErrors] = useState<FormErrors>({});
  // A problem not tied to one field (offline, server down).
  const [formError, setFormError] = useState<string>();

  const errors = validateForm(values, localToday());
  const valid = Object.keys(errors).length === 0;
  const { sheet, allowLeave } = useDiscardGuard(isFormDirty(values, EMPTY_FORM));

  const create = useMutation({
    mutationFn: createSubscription,
    onSuccess: async (created) => {
      // Totals on Home and Analytics include it now, so refresh them.
      await Promise.all(
        subscriptionWriteInvalidations.map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      );
      allowLeave();
      navigation.replace('SubscriptionDetail', { id: created.id });
    },
    onError: (error) => {
      if (error instanceof ApiError && error.isOffline) {
        setFormError(ADD_COPY.offline);
      } else if (error instanceof ApiError && error.fields) {
        setServerErrors(formErrorsFromServer(error.fields));
        setSubmitted(true);
      } else {
        setFormError(messageFor(error));
      }
    },
  });

  // Errors to show: the server's first, then our own for fields the user
  // has left (or all of them after Save).
  const shown: FormErrors = { ...serverErrors };
  for (const [field, message] of Object.entries(errors) as [FormField, string][]) {
    if (!shown[field] && (submitted || touched.has(field))) shown[field] = message;
  }

  const change = (patch: Partial<FormValues>) => {
    setValues((previous) => ({ ...previous, ...patch }));
    // Typing in a field clears the server's old message for it.
    setServerErrors((previous) => {
      const next = { ...previous };
      for (const key of Object.keys(patch)) delete next[key as FormField];
      return next;
    });
    setFormError(undefined);
  };

  const blur = (field: FormField) =>
    setTouched((previous) => new Set(previous).add(field));

  const save = () => {
    setSubmitted(true);
    if (!valid || create.isPending) return;
    create.mutate(toSubscriptionInput(values));
  };

  return (
    <Screen
      edges={['top', 'bottom']}
      testID="add-screen"
      footer={
        <Button
          label={ADD_COPY.save}
          onPress={save}
          disabled={!valid}
          loading={create.isPending}
          loadingLabel={ADD_COPY.saving}
          fullWidth
          testID="add-save"
        />
      }
    >
      <Header title={ADD_COPY.title} onClose={() => navigation.goBack()} />

      {formError ? (
        <View
          style={styles.formError}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
        >
          <Text style={styles.formErrorText} testID="add-form-error">
            {formError}
          </Text>
        </View>
      ) : null}

      <SubscriptionForm
        values={values}
        errors={shown}
        onChange={change}
        onBlur={blur}
        disabled={create.isPending}
      />

      {sheet}
    </Screen>
  );
}

const useStyles = makeStyles(({ colors, typography }) => ({
  // Same look as the auth screens' form error.
  formError: {
    backgroundColor: colors.dangerSurface,
    borderRadius: radius.card,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  formErrorText: {
    ...typography.bodyMd,
    color: colors.danger,
  },
}));
