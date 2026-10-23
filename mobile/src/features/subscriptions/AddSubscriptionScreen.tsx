// Add subscription screen (07 §1–3). Shows "Subscription added" after saving.
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

import { AddSuccess } from './AddSuccess';
import { createSubscription, type SubscriptionDetail } from './api';
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
  const [touched, setTouched] = useState<Set<FormField>>(new Set()); // fields the user has left
  const [submitted, setSubmitted] = useState(false); // after Save, show all errors
  const [serverErrors, setServerErrors] = useState<FormErrors>({});
  const [formError, setFormError] = useState<string>(); // offline / server down
  const [created, setCreated] = useState<SubscriptionDetail | null>(null); // saved → success screen

  const errors = validateForm(values, localToday());
  const valid = Object.keys(errors).length === 0;
  const { sheet } = useDiscardGuard(isFormDirty(values, EMPTY_FORM));

  const create = useMutation({
    mutationFn: createSubscription,
    onSuccess: async (saved) => {
      // Refresh totals on Home and Analytics.
      await Promise.all(
        subscriptionWriteInvalidations.map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      );
      // Clear the form so leaving won't ask to discard, and "Add another" starts fresh.
      setValues(EMPTY_FORM);
      setTouched(new Set());
      setSubmitted(false);
      setCreated(saved);
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

  // Server errors first, then ours for fields the user has left (or all after Save).
  const shown: FormErrors = { ...serverErrors };
  for (const [field, message] of Object.entries(errors) as [FormField, string][]) {
    if (!shown[field] && (submitted || touched.has(field))) shown[field] = message;
  }

  const change = (patch: Partial<FormValues>) => {
    setValues((previous) => ({ ...previous, ...patch }));
    // Editing a field clears its old server error.
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

  // Saved: show the success screen instead of the form.
  if (created) {
    return (
      <Screen edges={['top', 'bottom']} gutter="compact" testID="add-screen">
        <AddSuccess
          created={created}
          onViewDashboard={() => navigation.navigate('MainTabs', { screen: 'Home' })}
          onAddAnother={() => setCreated(null)}
        />
      </Screen>
    );
  }

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
