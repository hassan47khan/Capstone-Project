/**
 * Trial Shield (handoff 11 §2.5; US-12, US-13). Figma `110:186`.
 *
 * Pushed inside the Calendar tab (from Home's trial alert and the Calendar
 * header), so it goes back rather than closing.
 *
 * One request: GET /trials. The server sorts by days left, works out each
 * trial's progress (elapsed ÷ length), its urgency and whether it's at risk,
 * and totals what the at-risk trials will charge. This screen only draws them.
 *
 * States
 *   loading   skeleton cards
 *   empty     "No trials right now"
 *   failed    full-screen error + Try again (saved copy kept on a refresh error)
 *   loaded    the at-risk card (hidden when nothing is inside the window), then
 *             one card per trial with its actions
 *
 * Actions by urgency (11 §2.5)
 *   soon   Cancel guide (primary) + Keep it
 *   later  Remind me + Cancel guide
 *   far    Remind me
 *
 * Fixes from the frame: one window (the user's alert days) in both the label
 * and the caption, and no danger red on a days-left chip: ≤ 3 days is the
 * warning tint with a clock, 4–14 neutral, > 14 the success tint.
 *
 * Cancel guide is guidance only, never an automated cancellation. There is
 * no per-service catalog of cancel steps yet, so every service gets the
 * generic "check your account settings" guide the spec allows as a fallback.
 */
import { useNavigation } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock } from 'lucide-react-native';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { messageFor } from '@/api/errors';
import { formatDateLong, formatMoney } from '@/api/format';
import type { Trial, TrialDecisionEnum } from '@/api/contract';
import { queryKeys } from '@/api/queryKeys';
import {
  BottomSheet,
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
import { makeStyles, radius, sizes, spacing, useTheme } from '@/theme';

import { describeCycle } from '../subscriptions/formRules';
import { decideTrial, listTrials, trialKeys } from './trialsApi';

export const TRIAL_COPY = {
  title: 'Trial Shield',
  back: 'Calendar',
  eyebrow: 'Cancel before you are charged',
  atRiskLabel: 'At risk soon',
  loading: 'Loading trials',
  emptyTitle: 'No trials right now',
  emptyMessage: 'Free trials you track show up here, with how long is left on each.',
  cancelGuide: 'Cancel guide',
  keep: 'Keep it',
  remind: 'Remind me',
  reminderSet: 'Reminder set',
  kept: "You're keeping this one. It turns into a paid plan on its end date.",
  close: 'Close',
  guideNote:
    "SubTrak never cancels anything for you. Once it's cancelled, mark it cancelled here too.",
} as const;

/** "1 trial converts…" / "2 trials convert…" (11 §2.5 fix: one window). */
export function atRiskCaption(count: number, days: number): string {
  const trials = count === 1 ? '1 trial converts' : `${count} trials convert`;
  return `${trials} to a paid plan within ${days} ${days === 1 ? 'day' : 'days'}`;
}

/** "2 days left", "1 day left", "Ends today". */
export function daysLeftLabel(days: number): string {
  if (days <= 0) return 'Ends today';
  return days === 1 ? '1 day left' : `${days} days left`;
}

/** The chip's tier (11 §2.5). Never danger: red is for errors only. */
export function chipTone(days: number): 'warning' | 'neutral' | 'success' {
  if (days <= 3) return 'warning';
  if (days <= 14) return 'neutral';
  return 'success';
}

/** Which buttons a trial gets, in order, by urgency. */
export function actionsFor(trial: Trial): ('guide' | 'keep' | 'remind')[] {
  if (trial.urgency === 'soon') return ['guide', 'keep'];
  if (trial.urgency === 'later') return ['remind', 'guide'];
  return ['remind'];
}

export function TrialShieldScreen() {
  const styles = useStyles();
  const navigation = useNavigation();
  const [guideFor, setGuideFor] = useState<Trial | null>(null);

  const trials = useQuery({ queryKey: trialKeys.list(), queryFn: listTrials });
  const header = (
    <Header
      title={TRIAL_COPY.title}
      backLabel={TRIAL_COPY.back}
      onBack={() => navigation.goBack()}
    />
  );

  if (trials.isError && !trials.data) {
    return (
      <Screen edges={['top']} testID="trials-screen">
        {header}
        <ErrorState
          error={trials.error}
          onRetry={() => trials.refetch()}
          testID="trials-error"
        />
      </Screen>
    );
  }

  if (!trials.data) {
    return (
      <Screen edges={['top']} testID="trials-screen">
        {header}
        <SkeletonGroup label={TRIAL_COPY.loading} testID="trials-loading">
          <Skeleton height={sizes.field * 2} />
          <Skeleton height={sizes.field * 3} />
          <Skeleton height={sizes.field * 3} />
        </SkeletonGroup>
      </Screen>
    );
  }

  const { results, at_risk: atRisk, alert_days_before: window } = trials.data;

  return (
    <Screen
      edges={['top']}
      testID="trials-screen"
      onRefresh={() => trials.refetch()}
      refreshing={trials.isRefetching}
      contentStyle={styles.content}
    >
      {header}
      <Text style={styles.eyebrow}>{TRIAL_COPY.eyebrow}</Text>

      {results.length === 0 ? (
        <EmptyState
          title={TRIAL_COPY.emptyTitle}
          message={TRIAL_COPY.emptyMessage}
          testID="trials-empty"
        />
      ) : (
        <>
          {/* Hidden when nothing is inside the window (11 §2.5). */}
          {atRisk.count > 0 ? (
            <View
              style={styles.atRisk}
              accessible
              accessibilityLabel={`${TRIAL_COPY.atRiskLabel}: ${
                formatMoney(atRisk.amount.amount, atRisk.amount.currency).display
              }. ${atRiskCaption(atRisk.count, window)}.`}
              testID="trials-at-risk"
            >
              <Text style={styles.atRiskLabel}>{TRIAL_COPY.atRiskLabel}</Text>
              <Text style={styles.atRiskFigure}>
                {formatMoney(atRisk.amount.amount, atRisk.amount.currency).display}
              </Text>
              <Text style={styles.atRiskCaption}>
                {atRiskCaption(atRisk.count, window)}
              </Text>
            </View>
          ) : null}

          {results.map((trial) => (
            <TrialCard
              key={trial.subscription_id}
              trial={trial}
              onGuide={() => setGuideFor(trial)}
            />
          ))}
        </>
      )}

      <CancelGuideSheet trial={guideFor} onClose={() => setGuideFor(null)} />
    </Screen>
  );
}

// --- One trial ----------------------------------------------------------------

function TrialCard({ trial, onGuide }: { trial: Trial; onGuide: () => void }) {
  const styles = useStyles();
  const queryClient = useQueryClient();
  const toast = useToast();
  const price = formatMoney(trial.price.amount, trial.price.currency).display;
  const cycle = describeCycle(trial).toLowerCase();
  const then =
    cycle === 'monthly' ? `Then ${price} per month` : `Then ${price}, ${cycle}`;
  // Server fraction (0–1) as a width; not money, nothing is summed.
  const fill = `${Math.round(Math.min(Math.max(trial.progress, 0), 1) * 100)}%` as const;

  const decide = useMutation({
    mutationFn: (decision: TrialDecisionEnum) =>
      decideTrial(trial.subscription_id, decision),
    onSuccess: (_saved, decision) => {
      void queryClient.invalidateQueries({ queryKey: trialKeys.all });
      // Home's Urgent attention lists trials too.
      void queryClient.invalidateQueries({ queryKey: queryKeys.analytics.all });
      toast.show(
        decision === 'keep'
          ? `Got it. We'll stop reminding you about ${trial.name}.`
          : `We'll remind you before ${trial.name} ends.`,
      );
    },
    onError: (error) => toast.show(messageFor(error), 'neutral'),
  });

  const kept = trial.decision === 'keep';
  const reminded = trial.decision === 'remind';
  const busy = decide.isPending;

  return (
    <Card style={styles.card} testID={`trial-${trial.subscription_id}`}>
      <View style={styles.top}>
        <ServiceMark
          name={trial.name}
          mark={trial.service_mark?.mark}
          brand={
            trial.service_mark
              ? { tint: trial.service_mark.tint_hex, ink: trial.service_mark.brand_hex }
              : undefined
          }
        />
        <View style={styles.titles}>
          <Text style={styles.name}>{trial.name}</Text>
          <Text style={styles.then}>{then}</Text>
        </View>
        <DaysLeftChip
          days={trial.days_left}
          testID={`trial-days-${trial.subscription_id}`}
        />
      </View>

      <View
        style={styles.track}
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={`${trial.elapsed_days} of ${trial.trial_length_days} trial days used. Ends ${formatDateLong(trial.trial_ends_on)}.`}
        accessibilityValue={{
          min: 0,
          max: trial.trial_length_days,
          now: trial.elapsed_days,
        }}
        testID={`trial-progress-${trial.subscription_id}`}
      >
        <View style={[styles.fill, { width: fill }]} />
      </View>

      {kept ? <Text style={styles.note}>{TRIAL_COPY.kept}</Text> : null}

      <View style={styles.actions}>
        {actionsFor(trial).map((action, index) => {
          // The first button is the primary one; the rest are secondary.
          const variant = index === 0 ? 'primary' : 'secondary';
          if (action === 'guide') {
            return (
              <Button
                key={action}
                label={TRIAL_COPY.cancelGuide}
                variant={variant}
                onPress={onGuide}
                style={styles.action}
                testID={`trial-guide-${trial.subscription_id}`}
              />
            );
          }
          if (action === 'keep') {
            return (
              <Button
                key={action}
                label={TRIAL_COPY.keep}
                variant={variant}
                onPress={() => decide.mutate('keep')}
                disabled={kept || busy}
                loading={busy && decide.variables === 'keep'}
                style={styles.action}
                testID={`trial-keep-${trial.subscription_id}`}
              />
            );
          }
          return (
            <Button
              key={action}
              label={reminded ? TRIAL_COPY.reminderSet : TRIAL_COPY.remind}
              variant={variant}
              onPress={() => decide.mutate('remind')}
              disabled={reminded || busy}
              loading={busy && decide.variables === 'remind'}
              style={styles.action}
              testID={`trial-remind-${trial.subscription_id}`}
            />
          );
        })}
      </View>
    </Card>
  );
}

function DaysLeftChip({ days, testID }: { days: number; testID?: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const tone = chipTone(days);
  return (
    <View
      style={[styles.chip, styles[`chip_${tone}`]]}
      accessible
      accessibilityLabel={daysLeftLabel(days)}
      testID={testID}
    >
      {tone === 'warning' ? (
        <Clock size={sizes.iconSmall} color={colors.text} strokeWidth={2} />
      ) : null}
      <Text style={[styles.chipText, tone === 'success' && styles.chipTextSuccess]}>
        {daysLeftLabel(days)}
      </Text>
    </View>
  );
}

// --- Cancel guide ---------------------------------------------------------------

function CancelGuideSheet({
  trial,
  onClose,
}: {
  trial: Trial | null;
  onClose: () => void;
}) {
  const styles = useStyles();
  return (
    <BottomSheet
      visible={trial !== null}
      onClose={onClose}
      title={trial ? `How to cancel ${trial.name}` : undefined}
      testID="trial-guide-sheet"
    >
      {trial ? (
        <View style={styles.guide}>
          <Text style={styles.guideText}>
            {`Check your account settings on ${trial.name}. Look for Subscription, Plan or Membership, then choose Cancel.`}
          </Text>
          <Text style={styles.guideText}>
            {`Do it before ${formatDateLong(trial.trial_ends_on)} so you aren't charged ${
              formatMoney(trial.price.amount, trial.price.currency).display
            }.`}
          </Text>
          <Text style={styles.note}>{TRIAL_COPY.guideNote}</Text>
          <Button
            label={TRIAL_COPY.close}
            onPress={onClose}
            fullWidth
            testID="trial-guide-close"
          />
        </View>
      ) : null}
    </BottomSheet>
  );
}

const useStyles = makeStyles(({ colors, typography }) => ({
  content: {
    gap: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  eyebrow: {
    ...typography.bodyMd,
    color: colors.textMuted,
  },
  // 11 §2.5: warning fill and border, padding 16. Text stays `text`/`textMuted`.
  atRisk: {
    backgroundColor: colors.warningSurface,
    borderWidth: sizes.hairline,
    borderColor: colors.warning,
    borderRadius: radius.card,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  atRiskLabel: {
    ...typography.sectionLabel,
    color: colors.text,
  },
  // 11 §2.5 measures DM Serif 30; nearest token is 32 (01 §3).
  atRiskFigure: {
    ...typography.displayLg,
  },
  atRiskCaption: {
    ...typography.labelMd,
    color: colors.text,
  },
  card: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  titles: {
    flex: 1,
    gap: spacing.xs / 2,
  },
  name: {
    ...typography.labelSemibold,
    color: colors.text,
  },
  then: {
    ...typography.caption,
    color: colors.textMuted,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.badge,
  },
  chip_warning: { backgroundColor: colors.warningSurface },
  chip_neutral: { backgroundColor: colors.surface2 },
  chip_success: { backgroundColor: colors.successSurface },
  chipText: {
    ...typography.captionStrong,
    color: colors.text,
  },
  chipTextSuccess: {
    color: colors.success,
  },
  // 11 §2.5: an 8-tall track (the 8 on the spacing scale), fully rounded.
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
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  action: {
    flex: 1,
  },
  note: {
    ...typography.caption,
    color: colors.textMuted,
  },
  guide: {
    gap: spacing.md,
  },
  guideText: {
    ...typography.bodyMd,
    color: colors.text,
  },
}));
