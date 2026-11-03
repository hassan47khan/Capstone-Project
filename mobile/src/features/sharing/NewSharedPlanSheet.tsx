/**
 * "New shared plan" (handoff 11 §2.8; not designed). A sheet: pick a
 * subscription, add the people sharing it, save.
 *
 * The split is equal and worked out by the server when it saves (you're added
 * first and cover any extra cent), so this sheet shows no shares of its own:
 * the client never divides a price. The plan appears on the screen behind,
 * with every share, as soon as it's saved.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ScrollView, Text, useWindowDimensions, View } from 'react-native';

import { ApiError, messageFor } from '@/api/errors';
import { BottomSheet, Button, Select, TextField, useToast } from '@/components';
import { makeStyles, radius, sizes, spacing } from '@/theme';

import { listSubscriptions } from '../subscriptions/api';
import { createSharedPlan, sharedPlanKeys } from './api';

export const NEW_PLAN_COPY = {
  title: 'New shared plan',
  subscription: 'Subscription',
  pick: 'Choose a subscription',
  person: 'Name',
  email: 'Email (optional)',
  addPerson: 'Add another person',
  split: "Everyone pays an equal share. You're added first and cover any extra cent.",
  save: 'Save shared plan',
  cancel: 'Cancel',
  alreadyShared: 'That subscription is already shared.',
  needSomeone: 'Add at least one person.',
} as const;

/** Up to five others, so a plan is at most six ways. */
export const MAX_PEOPLE = 5;

interface Person {
  name: string;
  email: string;
}

const BLANK: Person = { name: '', email: '' };

export function NewSharedPlanSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const styles = useStyles();
  const queryClient = useQueryClient();
  const toast = useToast();
  // The sheet doesn't scroll on its own; five people would push Save off screen.
  const { height } = useWindowDimensions();
  const [subscriptionId, setSubscriptionId] = useState<string | null>(null);
  const [people, setPeople] = useState<Person[]>([BLANK]);
  const [error, setError] = useState<string>();

  const subscriptions = useQuery({
    queryKey: ['subscriptions', 'list', 'shared-plan-picker'],
    queryFn: listSubscriptions,
    enabled: visible,
  });
  const options = (subscriptions.data ?? [])
    .filter((sub) => sub.status === 'active')
    .map((sub) => ({ value: sub.id, label: sub.name }));

  const named = people.filter((p) => p.name.trim() !== '');
  const canSave = subscriptionId !== null && named.length > 0;

  const reset = () => {
    setSubscriptionId(null);
    setPeople([BLANK]);
    setError(undefined);
  };
  const close = () => {
    reset();
    onClose();
  };

  const save = useMutation({
    mutationFn: () =>
      createSharedPlan(
        subscriptionId!,
        named.map((p) => ({
          display_name: p.name.trim(),
          email: p.email.trim() || null,
        })),
      ),
    onSuccess: (plan) => {
      void queryClient.invalidateQueries({ queryKey: sharedPlanKeys.all });
      toast.show(`${plan.name} is now shared ${plan.participant_count} ways.`);
      close();
    },
    onError: (failure) => {
      if (failure instanceof ApiError && failure.code === 'already_shared') {
        setError(NEW_PLAN_COPY.alreadyShared);
      } else setError(messageFor(failure));
    },
  });

  const update = (index: number, patch: Partial<Person>) => {
    setError(undefined);
    setPeople((list) => list.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={close}
      title={NEW_PLAN_COPY.title}
      dismissible={!save.isPending}
      testID="new-plan-sheet"
    >
      <ScrollView
        style={{ maxHeight: height * 0.7 }}
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
      >
        <Select
          label={NEW_PLAN_COPY.subscription}
          options={options}
          value={subscriptionId}
          onChange={(id) => {
            setError(undefined);
            setSubscriptionId(id);
          }}
          placeholder={NEW_PLAN_COPY.pick}
          disabled={save.isPending}
          testID="new-plan-subscription"
        />

        {people.map((person, index) => (
          <View key={index} style={styles.person}>
            <TextField
              label={`${NEW_PLAN_COPY.person} ${index + 1}`}
              value={person.name}
              onChangeText={(name) => update(index, { name: name.slice(0, 60) })}
              autoCapitalize="words"
              editable={!save.isPending}
              testID={`new-plan-name-${index}`}
            />
            <TextField
              label={NEW_PLAN_COPY.email}
              value={person.email}
              onChangeText={(email) => update(index, { email })}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              editable={!save.isPending}
              testID={`new-plan-email-${index}`}
            />
          </View>
        ))}

        {people.length < MAX_PEOPLE ? (
          <Button
            label={NEW_PLAN_COPY.addPerson}
            variant="ghost"
            onPress={() => setPeople((list) => [...list, BLANK])}
            disabled={save.isPending}
            testID="new-plan-add-person"
          />
        ) : null}

        <Text style={styles.note}>{NEW_PLAN_COPY.split}</Text>

        {error ? (
          <Text
            style={styles.error}
            accessibilityLiveRegion="polite"
            testID="new-plan-error"
          >
            {error}
          </Text>
        ) : null}

        <Button
          label={NEW_PLAN_COPY.save}
          onPress={() => save.mutate()}
          disabled={!canSave}
          loading={save.isPending}
          accessibilityHint={canSave ? undefined : NEW_PLAN_COPY.needSomeone}
          fullWidth
          testID="new-plan-save"
        />
        <Button
          label={NEW_PLAN_COPY.cancel}
          variant="secondary"
          onPress={close}
          disabled={save.isPending}
          fullWidth
          testID="new-plan-cancel"
        />
      </ScrollView>
    </BottomSheet>
  );
}

const useStyles = makeStyles(({ colors, typography }) => ({
  body: {
    gap: spacing.md,
  },
  person: {
    gap: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: sizes.hairline,
    borderTopColor: colors.border,
  },
  note: {
    ...typography.caption,
    color: colors.textMuted,
  },
  // A form-level failure (11 §3.3): a banner above the primary button. Warning,
  // not danger: no red on the AI epic screens except Gmail's connect error.
  error: {
    ...typography.labelMd,
    color: colors.text,
    backgroundColor: colors.warningSurface,
    borderRadius: radius.card,
    padding: spacing.md,
  },
}));
