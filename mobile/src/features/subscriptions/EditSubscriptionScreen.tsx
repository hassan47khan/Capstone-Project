/**
 * Edit subscription (handoff 07 §5; US-7). Figma `4:4189`.
 *
 * The Add form, prefilled from GET /subscriptions/{id}. Saving sends PATCH;
 * the server writes a history event for any price, category or cycle change.
 *
 * States (07 §9)
 *   loading     skeleton rows while the subscription loads
 *   not found   "Not found" + Go back (404 means missing OR not yours)
 *   idle        Save changes disabled until something changed AND the form is valid
 *   saving      Save shows a spinner; fields locked; can't close until answered
 *   failed      a field message, or a banner when the error has no field
 *   saved       back to the detail screen, which refetches
 *
 * Cancel (secondary, never looks disabled) and the X both ask "Discard changes?"
 * when something changed. A "History" link above the name opens EditHistory.
 */
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';

import { ApiError, messageFor } from '@/api/errors';
import { queryKeys, subscriptionWriteInvalidations } from '@/api/queryKeys';
import {
  Button,
  ErrorState,
  Header,
  Screen,
  Skeleton,
  SkeletonGroup,
} from '@/components';
import type { AppStackParamList } from '@/navigation/types';
import { useDiscardGuard } from '@/navigation/useDiscardGuard';
import { makeStyles, radius, sizes, spacing } from '@/theme';

import {
  getSubscription,
  updateSubscription,
  type SubscriptionDetail,
  type SubscriptionInput,
} from './api';
import { SubscriptionForm } from './SubscriptionForm';
import {
  changedInput,
  formErrorsFromServer,
  formFromDetail,
  saveHint,
  validateForm,
  visibleErrors,
  type FormErrors,
  type FormField,
  type FormValues,
} from './formRules';
import { localToday } from './today';
import { useDuplicateNameWarning } from './useDuplicateNameWarning';

export const EDIT_COPY = {
  title: 'Edit subscription',
  save: 'Save changes',
  saving: 'Saving changes',
  cancel: 'Cancel',
  loading: 'Loading subscription',
  offline: "You're offline, so your changes weren't saved. Connect and try again.",
} as const;

type Navigation = NativeStackNavigationProp<AppStackParamList>;
type Route = RouteProp<AppStackParamList, 'EditSubscription'>;

export function EditSubscriptionScreen() {
  const navigation = useNavigation<Navigation>();
  const { id } = useRoute<Route>().params;
  const close = () => navigation.goBack();
  const header = <Header title={EDIT_COPY.title} onClose={close} />;

  const detail = useQuery({
    queryKey: queryKeys.subscriptions.detail(id),
    queryFn: () => getSubscription(id),
  });

  // Couldn't load it: one full-screen error (a 404 can only go back).
  if (detail.isError && !detail.data) {
    const notFound = detail.error instanceof ApiError && detail.error.status === 404;
    return (
      <Screen edges={['top', 'bottom']} testID="edit-screen">
        {header}
        <ErrorState
          error={detail.error}
          onRetry={notFound ? close : () => detail.refetch()}
          testID="edit-error"
        />
      </Screen>
    );
  }

  // Still loading the first time.
  if (!detail.data) {
    return (
      <Screen edges={['top', 'bottom']} testID="edit-screen">
        {header}
        <SkeletonGroup label={EDIT_COPY.loading} testID="edit-loading">
          {[0, 1, 2, 3].map((row) => (
            <Skeleton key={row} height={sizes.field} />
          ))}
        </SkeletonGroup>
      </Screen>
    );
  }

  // Keyed by id: a different subscription starts a fresh form.
  return <EditForm key={detail.data.id} saved={detail.data} />;
}

// The form itself, once the subscription has loaded.
function EditForm({ saved }: { saved: SubscriptionDetail }) {
  const styles = useStyles();
  const navigation = useNavigation<Navigation>();
  const queryClient = useQueryClient();

  // Where the form started: fixed when the screen opens, so a background
  // refetch can't make unsaved edits look "unchanged".
  const [initial] = useState<FormValues>(() => formFromDetail(saved));
  const [values, setValues] = useState<FormValues>(initial);
  const [touched, setTouched] = useState<Set<FormField>>(new Set());
  const [submitted, setSubmitted] = useState(false);
  const [serverErrors, setServerErrors] = useState<FormErrors>({});
  const [formError, setFormError] = useState<string>();
  // True from pressing Save until the server answers. The state drives the UI;
  // the ref is read by the close-blocking listener, which can't see new state.
  const [isSaving, setIsSaving] = useState(false);
  const saving = useRef(false);
  const setSaving = (on: boolean) => {
    saving.current = on;
    setIsSaving(on);
  };

  const errors = validateForm(values, localToday());
  // What Save would send; empty means nothing really changed.
  const changes = changedInput(values, initial);
  const changed = Object.keys(changes).length > 0;
  const canSave = changed && Object.keys(errors).length === 0;
  // Only explain a grey Save once there's something to save.
  const hint = changed ? saveHint(errors) : null;

  // "Discard changes?" when something changed, but not mid-save.
  const { sheet, allowLeave } = useDiscardGuard(changed && !isSaving);
  const shown = visibleErrors(errors, serverErrors, touched, submitted);
  // Its own name never counts as a duplicate.
  const nameWarning = useDuplicateNameWarning(values.name, saved.id);

  // While saving, block every way of closing (X, swipe, Android back).
  useEffect(
    () =>
      navigation.addListener('beforeRemove', (event) => {
        if (saving.current) event.preventDefault();
      }),
    [navigation],
  );

  const update = useMutation({
    mutationFn: (input: Partial<SubscriptionInput>) =>
      updateSubscription(saved.id, input),
    onSuccess: () => {
      setSaving(false);
      // Detail, Home and Analytics refetch in the background.
      for (const queryKey of subscriptionWriteInvalidations) {
        void queryClient.invalidateQueries({ queryKey });
      }
      if (!navigation.isFocused()) return;
      allowLeave();
      navigation.goBack();
    },
    onError: (error) => {
      setSaving(false);
      if (error instanceof ApiError && error.isOffline) {
        setFormError(EDIT_COPY.offline);
        return;
      }
      const fieldErrors =
        error instanceof ApiError ? formErrorsFromServer(error.fields) : {};
      if (Object.keys(fieldErrors).length > 0) {
        setServerErrors(fieldErrors);
        setSubmitted(true);
      } else {
        setFormError(messageFor(error)); // no field to show it on
      }
    },
  });

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
    if (!canSave || isSaving) return;
    setSaving(true);
    update.mutate(changes);
  };

  return (
    <Screen
      edges={['top', 'bottom']}
      testID="edit-screen"
      footer={
        <View style={styles.footer}>
          <Button
            label={EDIT_COPY.save}
            onPress={save}
            disabled={!canSave}
            loading={isSaving}
            loadingLabel={EDIT_COPY.saving}
            accessibilityHint={hint ?? undefined}
            fullWidth
            testID="edit-save"
          />
          {/* Secondary, so it never reads as disabled (07 §5, 02 §1);
              only actually disabled while a save is in flight. */}
          <Button
            label={EDIT_COPY.cancel}
            onPress={() => navigation.goBack()}
            disabled={isSaving}
            variant="secondary"
            fullWidth
            testID="edit-cancel"
          />
          {hint ? (
            <Text style={styles.hint} testID="edit-save-hint">
              {hint}
            </Text>
          ) : null}
        </View>
      }
    >
      <Header title={EDIT_COPY.title} onClose={() => navigation.goBack()} />

      {formError ? (
        <View
          style={styles.formError}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
        >
          <Text style={styles.formErrorText} testID="edit-form-error">
            {formError}
          </Text>
        </View>
      ) : null}

      <SubscriptionForm
        values={values}
        errors={shown}
        onChange={change}
        onBlur={blur}
        disabled={isSaving}
        onHistory={() => navigation.navigate('EditHistory', { id: saved.id })}
        nameWarning={nameWarning}
      />

      {sheet}
    </Screen>
  );
}

const useStyles = makeStyles(({ colors, typography }) => ({
  // 07 §5: Save changes, then Cancel, stacked.
  footer: {
    gap: spacing.sm,
  },
  hint: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
  },
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
