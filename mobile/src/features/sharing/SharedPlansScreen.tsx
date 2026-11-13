/**
 * Shared plans (handoff 11 §2.6; US-14, US-15). Figma `110:266`.
 *
 * Pushed inside the Settings tab, so it goes back rather than closing. Not
 * Family (handoff 10); the two share no tables.
 *
 * One request: GET /shared-plans. The server splits each bill (largest
 * remainder, owner first, so shares always add up to the price) and totals
 * what the others still owe. The client never divides a price.
 *
 * States
 *   loading      skeleton cards
 *   empty        "No shared plans yet" + New shared plan
 *   failed       full-screen error + Try again
 *   loaded       the Outstanding card (only when someone still owes), then a
 *                card per plan with each person's share and status
 *
 * Remind: by email when the person has an address (the server sends it), or
 * the OS share sheet with the server's message when they don't. One a day;
 * a second try says when it's allowed again.
 *
 * Mark paid: the owner records that someone paid them back this month (not
 * designed; 11 §2.6 only shows Remind). The server redoes the counts and the
 * Outstanding figure; the toast offers Undo.
 *
 * Fixes from the frame: the eyebrow that repeated the title is dropped, the
 * "Contract alert" card is cut, and avatar initials are `text`, not the
 * frame's 2.92:1 gold. Totals elsewhere still count the full bill.
 */
import { useNavigation } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Share, Text, View } from 'react-native';

import { ApiError, messageFor } from '@/api/errors';
import { formatMoney } from '@/api/format';
import type { Participant, SharedPlan, SharedPlanList } from '@/api/contract';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Header,
  Screen,
  ServiceMark,
  Skeleton,
  SkeletonGroup,
  useToast,
} from '@/components';
import { makeStyles, radius, serviceTint, sizes, spacing, useTheme } from '@/theme';

import { notCountedFor } from '../home/homeCopy';
import { describeCycle } from '../subscriptions/formRules';
import { listSharedPlans, markPaid, remindParticipant, sharedPlanKeys } from './api';
import { NewSharedPlanSheet } from './NewSharedPlanSheet';

export const SHARED_COPY = {
  title: 'Shared Plans',
  back: 'Settings',
  loading: 'Loading shared plans',
  outstanding: 'Outstanding',
  newPlan: '+ New shared plan',
  emptyTitle: 'No shared plans yet',
  emptyMessage:
    'Split a subscription with friends or family and keep track of who has paid you back.',
  paid: 'Paid',
  pending: 'Pending',
  remind: 'Remind',
  markPaid: 'Mark paid',
  undo: 'Undo',
} as const;

/** "AK" from "Alex Kim", "S" from "Sam". */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? [parts[0]!, parts[parts.length - 1]!] : parts;
  return letters.map((part) => Array.from(part)[0]!.toUpperCase()).join('') || '?';
}

/** The Outstanding card's caption: one name when one person owes. */
export function outstandingCaption(plans: SharedPlan[]): string {
  const owing = plans.flatMap((plan) =>
    plan.participants
      .filter((p) => !p.is_owner && p.status === 'pending')
      .map((p) => ({ name: p.display_name.split(' ')[0], plan: plan.name })),
  );
  if (owing.length === 0) return 'Nobody owes you anything';
  if (owing.length === 1) return `${owing[0]!.name} still owes you for ${owing[0]!.plan}`;
  return `${owing.length} people still owe you`;
}

export function SharedPlansScreen() {
  const styles = useStyles();
  const navigation = useNavigation();
  const [creating, setCreating] = useState(false);

  const plans = useQuery({ queryKey: sharedPlanKeys.list(), queryFn: listSharedPlans });
  const header = (
    <Header
      title={SHARED_COPY.title}
      backLabel={SHARED_COPY.back}
      onBack={() => navigation.goBack()}
    />
  );

  if (plans.isError && !plans.data) {
    return (
      <Screen edges={['top']} testID="shared-screen">
        {header}
        <ErrorState
          error={plans.error}
          onRetry={() => plans.refetch()}
          testID="shared-error"
        />
      </Screen>
    );
  }

  if (!plans.data) {
    return (
      <Screen edges={['top']} testID="shared-screen">
        {header}
        <SkeletonGroup label={SHARED_COPY.loading} testID="shared-loading">
          <Skeleton height={sizes.field * 2} />
          <Skeleton height={sizes.field * 5} />
        </SkeletonGroup>
      </Screen>
    );
  }

  const { results, outstanding, unconverted_count } = plans.data;
  // Shares in a currency with no rate are left out of Outstanding, never guessed.
  const notCounted = notCountedFor(unconverted_count);
  const someoneOwes = results.some((plan) =>
    plan.participants.some((p) => !p.is_owner && p.status === 'pending'),
  );
  const owed = formatMoney(outstanding.amount, outstanding.currency).display;

  return (
    <Screen
      edges={['top']}
      testID="shared-screen"
      onRefresh={() => plans.refetch()}
      refreshing={plans.isRefetching}
      contentStyle={styles.content}
    >
      {header}

      {results.length === 0 ? (
        <EmptyState
          title={SHARED_COPY.emptyTitle}
          message={SHARED_COPY.emptyMessage}
          testID="shared-empty"
        />
      ) : null}

      {someoneOwes ? (
        <View
          style={styles.owed}
          accessible
          accessibilityLabel={`${SHARED_COPY.outstanding}: ${owed}. ${outstandingCaption(results)}.${notCounted ? ` ${notCounted}.` : ''}`}
          testID="shared-outstanding"
        >
          <Text style={styles.owedLabel}>{SHARED_COPY.outstanding}</Text>
          <Text style={styles.owedFigure}>{owed}</Text>
          <Text style={styles.owedCaption}>{outstandingCaption(results)}</Text>
          {notCounted ? (
            <Text style={styles.owedCaption} testID="shared-not-counted">
              {notCounted}
            </Text>
          ) : null}
        </View>
      ) : null}

      {results.map((plan) => (
        <PlanCard key={plan.id} plan={plan} />
      ))}

      <Button
        label={SHARED_COPY.newPlan}
        variant="secondary"
        onPress={() => setCreating(true)}
        fullWidth
        testID="shared-new"
      />

      <NewSharedPlanSheet visible={creating} onClose={() => setCreating(false)} />
    </Screen>
  );
}

// --- One plan -------------------------------------------------------------------

function PlanCard({ plan }: { plan: SharedPlan }) {
  const styles = useStyles();
  const price = formatMoney(plan.price.amount, plan.price.currency).display;
  const cycle = describeCycle(plan);
  const per = cycle === 'Monthly' ? `${price} / month` : `${price} · ${cycle}`;
  const share = formatMoney(plan.your_share.amount, plan.your_share.currency).display;
  // Counts from the server, not money: a width for the bar.
  const fill =
    plan.participant_count > 0
      ? (`${Math.round((plan.paid_count / plan.participant_count) * 100)}%` as const)
      : ('0%' as const);

  return (
    <Card style={styles.card} testID={`plan-${plan.id}`}>
      <View
        style={styles.planHeader}
        accessible
        accessibilityLabel={`${plan.name}, ${per}, split ${plan.participant_count} ways. Your share ${share}.`}
      >
        <ServiceMark
          name={plan.name}
          mark={plan.service_mark?.mark}
          brand={
            plan.service_mark
              ? { tint: plan.service_mark.tint_hex, ink: plan.service_mark.brand_hex }
              : undefined
          }
        />
        <View style={styles.titles}>
          <Text style={styles.planName}>{plan.name}</Text>
          <Text style={styles.caption}>
            {`${per}  |  split ${plan.participant_count} ways`}
          </Text>
        </View>
        <Text style={styles.share} testID={`plan-share-${plan.id}`}>
          {share}
        </Text>
      </View>

      {plan.participants.map((person) => (
        <MemberRow key={person.id} plan={plan} person={person} />
      ))}

      <View style={styles.progress}>
        <Text style={styles.progressText}>
          {`${plan.paid_count} of ${plan.participant_count} paid`}
        </Text>
        <View
          style={styles.track}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <View style={[styles.fill, { width: fill }]} />
        </View>
      </View>
    </Card>
  );
}

function MemberRow({ plan, person }: { plan: SharedPlan; person: Participant }) {
  const styles = useStyles();
  const { colors, servicePalette } = useTheme();
  const toast = useToast();
  const queryClient = useQueryClient();
  const first = person.display_name.split(' ')[0] ?? person.display_name;
  const amount = formatMoney(person.share.amount, person.share.currency).display;

  const remind = useMutation({
    mutationFn: () => remindParticipant(plan.id, person.payment_id),
    onSuccess: async (reminder) => {
      if (reminder.channel === 'share_sheet') {
        // No address on file: the user sends it themselves.
        await Share.share({ message: reminder.message });
        return;
      }
      toast.show(`Reminder sent to ${first}.`);
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 429) {
        toast.show(`You already reminded ${first} today. Try again tomorrow.`, 'neutral');
      } else if (error instanceof ApiError && error.code === 'already_paid') {
        toast.show(`${first} has already paid.`, 'neutral');
      } else {
        toast.show(messageFor(error), 'neutral');
      }
    },
  });

  const paid = useMutation({
    mutationFn: (value: boolean) => markPaid(plan.id, person.payment_id, value),
    onSuccess: (updated, value) => {
      queryClient.setQueryData(
        sharedPlanKeys.list(),
        (list: SharedPlanList | undefined) =>
          list
            ? {
                ...list,
                results: list.results.map((p) => (p.id === updated.id ? updated : p)),
              }
            : list,
      );
      // Outstanding is the server's figure across every plan, so ask again.
      void queryClient.invalidateQueries({ queryKey: sharedPlanKeys.all });
      if (value) {
        toast.show(`${first} marked as paid.`, 'success', {
          action: { label: SHARED_COPY.undo, onPress: () => paid.mutate(false) },
        });
      }
    },
    onError: (error) => toast.show(messageFor(error), 'neutral'),
  });

  const pending = person.status === 'pending';
  const status = pending ? SHARED_COPY.pending : SHARED_COPY.paid;

  return (
    <View style={styles.member} testID={`member-${person.id}`}>
      <View
        style={styles.memberInfo}
        accessible
        accessibilityLabel={`${person.display_name}${person.is_owner ? ' (you)' : ''}, ${amount}, ${status}`}
      >
        <ServiceMark
          name={person.display_name}
          mark={initials(person.display_name)}
          // Tint from the name; initials in `text` (11 §2.6: the frame's gold fails AA).
          brand={{
            tint: serviceTint(person.display_name, servicePalette).tint,
            ink: colors.text,
          }}
          size="compact"
        />
        <View style={styles.titles}>
          <Text style={styles.memberName}>
            {person.is_owner ? `${person.display_name} (you)` : person.display_name}
          </Text>
          <Text style={styles.caption}>{amount}</Text>
        </View>
        <Badge
          label={status}
          tone={pending ? 'warning' : 'success'}
          testID={`member-status-${person.id}`}
        />
      </View>
      {pending && !person.is_owner ? (
        <View style={styles.memberActions}>
          <Button
            label={SHARED_COPY.markPaid}
            variant="ghost"
            onPress={() => paid.mutate(true)}
            loading={paid.isPending}
            disabled={remind.isPending}
            accessibilityLabel={`Mark ${person.display_name} as paid`}
            testID={`member-paid-${person.id}`}
          />
          <Button
            label={SHARED_COPY.remind}
            variant="secondary"
            onPress={() => remind.mutate()}
            loading={remind.isPending}
            disabled={paid.isPending}
            accessibilityLabel={`Remind ${person.display_name}`}
            testID={`member-remind-${person.id}`}
          />
        </View>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles(({ colors, typography }) => ({
  content: {
    gap: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  // 11 §2.6: successSurface, padding 16; label in `success`.
  owed: {
    backgroundColor: colors.successSurface,
    borderRadius: radius.card,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  owedLabel: {
    ...typography.sectionLabel,
    color: colors.success,
  },
  // Measured DM Serif 30; nearest token is 32 (01 §3).
  owedFigure: {
    ...typography.displayLg,
  },
  owedCaption: {
    ...typography.labelMd,
    color: colors.textMuted,
  },
  card: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  planHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  titles: {
    flex: 1,
    gap: spacing.xs / 2,
  },
  planName: {
    ...typography.labelSemibold,
    color: colors.text,
  },
  caption: {
    ...typography.caption,
    color: colors.textMuted,
  },
  share: {
    ...typography.labelBold,
    color: colors.accent,
  },
  // Two buttons don't fit beside a name on a small phone, so they sit below.
  member: {
    gap: spacing.sm,
  },
  memberActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
  },
  memberInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  memberName: {
    ...typography.labelMd,
    color: colors.text,
  },
  progress: {
    gap: spacing.xs,
  },
  progressText: {
    ...typography.captionStrong,
    color: colors.text,
  },
  // 8 tall, like Trial Shield's track.
  track: {
    height: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surface2,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
}));
