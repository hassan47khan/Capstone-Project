/**
 * Add subscription (handoff 07 §1–3; US-7). Figma `4:3340` / `4:3417` / `4:3509`
 * / `4:3587`.
 *
 * A modal with an X. Saving sends POST /subscriptions; the server checks the
 * data again, works out the next bill date and does every sum.
 *
 * States (07 §9)
 *   idle        Save disabled until the form is valid, with a hint saying why
 *   error       each field's message shows after it loses focus (or on Save)
 *   saving      Save shows a spinner; fields are locked; the form can't be
 *               closed (X, swipe or Android back) until the server answers.
 *               07 §9 says the X "still dismisses with a warning", but a sent
 *               save can't be cancelled, so "discard" would be untrue.
 *   failed      a field message, or a banner when the error has no field;
 *               everything typed is kept
 *   saved       the form is replaced by "Subscription added" (AddSuccess);
 *               "Add another" brings back a fresh, error-free form
 *
 * Closing a form with something typed in asks "Discard changes?" first; an
 * untouched form closes straight away (07 §1, useDiscardGuard).
 *
 * Retries reuse the same Idempotency-Key while the form is unchanged, so a
 * save retried after a dropped connection can't create the subscription twice.
 *
 * Not built yet: the service picker (no catalog endpoint), the duplicate-name
 * warning, and queueing a save made offline.
 */
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';

import { newIdempotencyKey } from '@/api/client';
import { ApiError, messageFor } from '@/api/errors';
import { subscriptionWriteInvalidations } from '@/api/queryKeys';
import { Button, Header, Screen } from '@/components';
import type { AppStackParamList } from '@/navigation/types';
import { useDiscardGuard } from '@/navigation/useDiscardGuard';
import { makeStyles, radius, spacing } from '@/theme';

import { AddSuccess } from './AddSuccess';
import {
  createSubscription,
  type SubscriptionDetail,
  type SubscriptionInput,
} from './api';
import { SubscriptionForm } from './SubscriptionForm';
import {
  EMPTY_FORM,
  formErrorsFromServer,
  isFormDirty,
  saveHint,
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

// One save attempt: the body sent, and the key that makes retries safe.
interface Attempt {
  body: string;
  key: string;
}

export function AddSubscriptionScreen() {
  const styles = useStyles();
  const navigation = useNavigation<Navigation>();
  const queryClient = useQueryClient();

  const [values, setValues] = useState<FormValues>(EMPTY_FORM);
  // Fields the user has left; their errors are shown from then on.
  const [touched, setTouched] = useState<Set<FormField>>(new Set());
  // After a failed save, every error shows, touched or not.
  const [submitted, setSubmitted] = useState(false);
  // Errors the server sent back for particular fields.
  const [serverErrors, setServerErrors] = useState<FormErrors>({});
  // A problem not tied to one field (offline, server down, unknown field).
  const [formError, setFormError] = useState<string>();
  // The saved subscription, once Save works: shows the success state.
  const [created, setCreated] = useState<SubscriptionDetail | null>(null);
  // The last attempt, so retrying the same form reuses its Idempotency-Key.
  const lastAttempt = useRef<Attempt | null>(null);
  // True from pressing Save until the server answers.
  const saving = useRef(false);

  const errors = validateForm(values, localToday());
  const valid = Object.keys(errors).length === 0;
  const hint = saveHint(errors);

  // While saving, block every way of closing (X, swipe, Android back).
  useEffect(
    () =>
      navigation.addListener('beforeRemove', (event) => {
        if (saving.current) event.preventDefault();
      }),
    [navigation],
  );

  // Back to a fresh form: values, every kind of error, and the retry key.
  const resetForm = () => {
    setValues(EMPTY_FORM);
    setTouched(new Set());
    setSubmitted(false);
    setServerErrors({});
    setFormError(undefined);
    lastAttempt.current = null;
  };

  const create = useMutation({
    mutationFn: ({ input, key }: { input: SubscriptionInput; key: string }) =>
      createSubscription(input, key),
    onSuccess: (saved) => {
      saving.current = false;
      // Refresh totals in the background; the success state doesn't wait for it.
      for (const queryKey of subscriptionWriteInvalidations) {
        void queryClient.invalidateQueries({ queryKey });
      }
      // Clear the form now, so leaving doesn't ask to discard and "Add another"
      // starts fresh, with no errors left over from an earlier failed try.
      resetForm();
      setCreated(saved);
    },
    onError: (error) => {
      saving.current = false;
      if (error instanceof ApiError && error.isOffline) {
        setFormError(ADD_COPY.offline);
        return;
      }
      const fieldErrors =
        error instanceof ApiError ? formErrorsFromServer(error.fields) : {};
      if (Object.keys(fieldErrors).length > 0) {
        setServerErrors(fieldErrors);
        setSubmitted(true);
      } else {
        // No field to show it on (e.g. billing_cycle, non_field_errors): use the banner.
        setFormError(messageFor(error));
      }
    },
  });

  // "Discard changes?" for a typed-in form, but not mid-save (closing is blocked then).
  const { sheet } = useDiscardGuard(isFormDirty(values, EMPTY_FORM) && !create.isPending);

  // Errors to show: the server's first, then our own for fields the user
  // has left (or all of them after a failed save).
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
    if (!valid || create.isPending) return;
    const input = toSubscriptionInput(values);
    const body = JSON.stringify(input);
    // Same form as the last try: reuse its key. Anything changed: a new key.
    const key =
      lastAttempt.current?.body === body ? lastAttempt.current.key : newIdempotencyKey();
    lastAttempt.current = { body, key };
    saving.current = true;
    create.mutate({ input, key });
  };

  // Saved: show "Subscription added" in place of the form (07 §3).
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
        <View style={styles.footer}>
          <Button
            label={ADD_COPY.save}
            onPress={save}
            disabled={!valid}
            loading={create.isPending}
            loadingLabel={ADD_COPY.saving}
            accessibilityHint={hint ?? undefined}
            fullWidth
            testID="add-save"
          />
          {/* Why Save is grey (07 §3 keeps it disabled until valid). */}
          {hint ? (
            <Text style={styles.hint} testID="add-save-hint">
              {hint}
            </Text>
          ) : null}
        </View>
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
  footer: {
    gap: spacing.sm,
  },
  hint: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
  },
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
