/**
 * Review extraction (handoff 11 §2.4; US-9 to US-11). Figma `110:125`, low
 * confidence `110:432`.
 *
 * A modal with an X, opened from Connect email's results with the pending
 * extraction's id. It reads that extraction from GET /extractions/pending.
 *
 * The rule this screen exists for: nothing is saved until "Confirm and
 * track", and a field the AI wasn't sure about can't be waved through. Each
 * flagged row (under 60%, or not found in the email) must be edited or
 * confirmed with "Looks right" before the primary enables, with the hint
 * "Check the highlighted field" (11 §2.4, the human-in-the-loop guarantee).
 *
 * Build-differently list from 11 §2.4, all done here
 *   1. One primary label, "Confirm and track".
 *   2. Flagged rows must be resolved first; tapping one offers "Looks right".
 *   3. Warning tokens (not the frame's failing amber), `text` helper copy,
 *      12px minimum chip text.
 *   4. Every row is tappable; "Edit details" opens the full form, prefilled.
 *   5. Reminder date = trial end − the user's alert days; already past →
 *      "Reminder due now" (the server sends it on confirm).
 *   6. Only "Confirm and track" writes. Discard deletes the review.
 *
 * States
 *   loading     skeletons
 *   gone        it expired (24 h), was confirmed elsewhere, or isn't yours
 *   failed      error + Try again
 *   review      the rows, the reminder (trials), and the actions
 *   editing     the Add form (07 §2) prefilled, plus the trial end date
 *   duplicate   a note above the rows offering "Update the existing one"
 */
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleHelp } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ApiError, messageFor } from '@/api/errors';
import { formatDateLong, formatDateShort, formatMoney } from '@/api/format';
import type { PendingExtraction } from '@/api/contract';
import { subscriptionWriteInvalidations } from '@/api/queryKeys';
import {
  BottomSheet,
  Button,
  Card,
  DateField,
  EmptyState,
  ErrorState,
  Header,
  Screen,
  SettingsRow,
  Skeleton,
  SkeletonGroup,
  useToast,
} from '@/components';
import type { AppStackParamList } from '@/navigation/types';
import {
  CATEGORY_LABELS,
  makeStyles,
  opacity,
  radius,
  sizes,
  spacing,
  useTheme,
} from '@/theme';

import { trialKeys } from '../calendar/trialsApi';
import {
  describeCycle,
  formErrorsFromServer,
  saveHint,
} from '../subscriptions/formRules';
import { SubscriptionForm } from '../subscriptions/SubscriptionForm';
import { localToday } from '../subscriptions/today';
import {
  confirmExtraction,
  discardExtraction,
  extractionKeys,
  getNotificationRules,
  listPending,
} from './api';
import {
  canConfirmAsIs,
  percent,
  reminderFor,
  rowsFor,
  toConfirmInput,
  unresolvedRows,
  validateReview,
  valuesFromExtraction,
  type ReviewErrors,
  type ReviewRow,
  type ReviewValues,
  type RowKey,
} from './reviewModel';

export const REVIEW_SCREEN_COPY = {
  title: 'Review extraction',
  loading: 'Loading the review',
  eyebrow: 'Review before saving',
  provenance: 'AI detected from your email',
  details: 'Extracted details',
  notFound: 'Nothing found in the email',
  banner: 'Nothing is saved until you confirm.',
  confirm: 'Confirm and track',
  confirming: 'Saving subscription',
  edit: 'Edit details',
  done: 'Done',
  discard: 'Discard',
  checkHighlighted: 'Check the highlighted field',
  checked: 'Checked',
  looksRight: 'Looks right',
  changeIt: 'Change it',
  goneTitle: 'This review has expired',
  goneMessage:
    'Results from a scan are kept for 24 hours. Scan your inbox again to find it.',
  goBack: 'Go back',
  duplicateTitle: 'You already track this',
  duplicateMessage: 'Update the one you have instead of adding it twice.',
  updateExisting: 'Update the existing one',
  reminderDueNow: 'Reminder due now',
  trialEnds: 'Trial ends',
} as const;

const DEFAULT_ALERT_DAYS = 3;

type Navigation = NativeStackNavigationProp<AppStackParamList>;
type Route = RouteProp<AppStackParamList, 'ReviewExtraction'>;

/** What a row shows. "—" for a blank the email didn't have. */
function displayValue(values: ReviewValues, key: RowKey): string {
  switch (key) {
    case 'name':
      return values.name || '—';
    case 'plan':
      return values.planName ?? '—';
    case 'price': {
      if (!values.price) return '—';
      const price = formatMoney(values.price, values.currency).display;
      return `${price} · ${describeCycle({
        billing_cycle: values.cycle,
        custom_cycle_count: values.customCount,
        custom_cycle_unit: values.customUnit,
      })}`;
    }
    case 'category':
      return values.category ? CATEGORY_LABELS[values.category] : '—';
    case 'trial':
      return values.trialEndsOn ? formatDateLong(values.trialEndsOn) : '—';
    case 'start':
      return values.startDate ? formatDateLong(values.startDate) : '—';
  }
}

/** "We're not sure about this date. Tap to edit." (11 §2.4) */
function helperFor(row: ReviewRow, values: ReviewValues): string {
  const thing =
    row.key === 'trial' || row.key === 'start'
      ? 'date'
      : row.key === 'price'
        ? 'price'
        : row.key === 'name'
          ? 'name'
          : row.key;
  if (!canConfirmAsIs(values, row.key))
    return `We couldn't find the ${thing}. Tap to add it.`;
  return `We're not sure about this ${thing}. Tap to edit.`;
}

export function ReviewExtractionScreen() {
  const navigation = useNavigation<Navigation>();
  const { id } = useRoute<Route>().params;
  const pending = useQuery({ queryKey: extractionKeys.pending(), queryFn: listPending });
  const close = () => navigation.goBack();
  const header = <Header title={REVIEW_SCREEN_COPY.title} onClose={close} />;

  if (pending.isError && !pending.data) {
    return (
      <Screen edges={['top', 'bottom']} testID="review-screen">
        {header}
        <ErrorState
          error={pending.error}
          onRetry={() => pending.refetch()}
          testID="review-error"
        />
      </Screen>
    );
  }

  if (!pending.data) {
    return (
      <Screen edges={['top', 'bottom']} testID="review-screen">
        {header}
        <SkeletonGroup label={REVIEW_SCREEN_COPY.loading} testID="review-loading">
          <Skeleton height={sizes.field * 2} />
          <Skeleton height={sizes.field * 5} />
        </SkeletonGroup>
      </Screen>
    );
  }

  const extraction = pending.data.results.find((row) => row.id === id);
  if (!extraction) {
    return (
      <Screen edges={['top', 'bottom']} testID="review-screen">
        {header}
        <EmptyState
          title={REVIEW_SCREEN_COPY.goneTitle}
          message={REVIEW_SCREEN_COPY.goneMessage}
          actionLabel={REVIEW_SCREEN_COPY.goBack}
          onAction={close}
          testID="review-gone"
        />
      </Screen>
    );
  }

  // Keyed so a different extraction starts from its own values.
  return <Review key={extraction.id} extraction={extraction} onClose={close} />;
}

function Review({
  extraction,
  onClose,
}: {
  extraction: PendingExtraction;
  onClose: () => void;
}) {
  const styles = useStyles();
  const navigation = useNavigation<Navigation>();
  const queryClient = useQueryClient();
  const toast = useToast();

  const [initial] = useState(() => valuesFromExtraction(extraction));
  const [values, setValues] = useState<ReviewValues>(initial);
  const [confirmed, setConfirmed] = useState<Set<RowKey>>(new Set());
  const [editing, setEditing] = useState(false);
  const [sheetRow, setSheetRow] = useState<ReviewRow | null>(null);
  const [serverErrors, setServerErrors] = useState<ReviewErrors>({});
  const [formError, setFormError] = useState<string>();

  const rules = useQuery({
    queryKey: extractionKeys.rules(),
    queryFn: getNotificationRules,
    enabled: values.isTrial,
  });
  const alertDays = rules.data?.trial_alert_days_before ?? DEFAULT_ALERT_DAYS;

  const today = localToday();
  const rows = rowsFor(extraction, values);
  const unresolved = unresolvedRows(rows, values, initial, confirmed);
  const errors: ReviewErrors = { ...validateReview(values, today), ...serverErrors };
  const valid = Object.keys(errors).length === 0;

  const confirm = useMutation({
    mutationFn: () => confirmExtraction(extraction.id, toConfirmInput(values)),
    onSuccess: (saved) => {
      for (const queryKey of [...subscriptionWriteInvalidations, trialKeys.all]) {
        void queryClient.invalidateQueries({ queryKey });
      }
      void queryClient.invalidateQueries({ queryKey: extractionKeys.pending() });
      toast.show(`Now tracking ${saved.name}.`);
      onClose();
    },
    onError: (error) => {
      const fields = error instanceof ApiError ? formErrorsFromServer(error.fields) : {};
      if (Object.keys(fields).length > 0) setServerErrors(fields);
      else if (error instanceof ApiError && error.status === 404) {
        // Expired or already handled elsewhere.
        void queryClient.invalidateQueries({ queryKey: extractionKeys.pending() });
      } else setFormError(messageFor(error));
    },
  });

  const discard = useMutation({
    mutationFn: () => discardExtraction(extraction.id),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: extractionKeys.pending() });
      onClose();
    },
  });

  const change = (patch: Partial<ReviewValues>) => {
    setValues((previous) => ({ ...previous, ...patch }));
    setServerErrors({});
    setFormError(undefined);
  };

  const openRow = (row: ReviewRow) => {
    const isUnresolved = unresolved.includes(row.key);
    if (isUnresolved && canConfirmAsIs(values, row.key)) setSheetRow(row);
    else setEditing(true);
  };

  const hint =
    unresolved.length > 0
      ? REVIEW_SCREEN_COPY.checkHighlighted
      : (errors.trialEndsOn ?? saveHint(errors));
  const busy = confirm.isPending || discard.isPending;
  const name = values.name || extraction.source.subject;

  if (editing) {
    return (
      <Screen
        edges={['top', 'bottom']}
        testID="review-screen"
        contentStyle={styles.content}
        footer={
          <Button
            label={REVIEW_SCREEN_COPY.done}
            onPress={() => setEditing(false)}
            fullWidth
            testID="review-done"
          />
        }
      >
        <Header
          title={REVIEW_SCREEN_COPY.edit}
          backLabel="Review"
          onBack={() => setEditing(false)}
        />
        <SubscriptionForm
          values={values}
          errors={errors}
          onChange={change}
          onBlur={() => {}}
        />
        {values.isTrial ? (
          <DateField
            label={REVIEW_SCREEN_COPY.trialEnds}
            value={values.trialEndsOn}
            onChange={(trialEndsOn) => change({ trialEndsOn })}
            placeholder="Select date"
            error={errors.trialEndsOn}
            testID="review-trial-ends"
          />
        ) : null}
      </Screen>
    );
  }

  const reminder =
    values.isTrial && values.trialEndsOn
      ? reminderFor(values.trialEndsOn, alertDays, today)
      : null;

  return (
    <Screen
      edges={['top', 'bottom']}
      testID="review-screen"
      contentStyle={styles.content}
    >
      <Header title={REVIEW_SCREEN_COPY.title} onClose={onClose} />

      <View style={styles.heading}>
        <Text style={styles.eyebrow}>{REVIEW_SCREEN_COPY.eyebrow}</Text>
        <Text style={styles.title} accessibilityRole="header">
          {name}
        </Text>
        <View style={styles.provenance}>
          <Text style={styles.provenanceText}>{REVIEW_SCREEN_COPY.provenance}</Text>
        </View>
      </View>

      {/* The email it came from, as quoted (≤ 300 characters, deleted after). */}
      <Card style={styles.snippet} testID="review-snippet">
        <Text style={styles.muted}>{`From: ${extraction.source.sender}`}</Text>
        <Text style={styles.subject}>{`Subject: ${extraction.source.subject}`}</Text>
        <Text style={styles.body}>{extraction.source.snippet}</Text>
      </Card>

      {extraction.duplicate_of ? (
        <View style={styles.notice} testID="review-duplicate">
          <Text style={styles.noticeTitle}>{REVIEW_SCREEN_COPY.duplicateTitle}</Text>
          <Text style={styles.body}>{REVIEW_SCREEN_COPY.duplicateMessage}</Text>
          <Button
            label={REVIEW_SCREEN_COPY.updateExisting}
            variant="secondary"
            onPress={() =>
              navigation.navigate('EditSubscription', { id: extraction.duplicate_of! })
            }
            testID="review-update-existing"
          />
        </View>
      ) : null}

      <Card style={styles.details}>
        <Text style={styles.detailsTitle}>{REVIEW_SCREEN_COPY.details}</Text>
        {rows.map((row) => (
          <DetailRow
            key={row.key}
            row={row}
            values={values}
            needsCheck={unresolved.includes(row.key)}
            checked={row.flagged && !unresolved.includes(row.key)}
            onPress={() => openRow(row)}
          />
        ))}
      </Card>

      {reminder ? (
        <Card style={styles.reminder}>
          <SettingsRow
            variant="toggle"
            label={`Remind me ${alertDays} ${alertDays === 1 ? 'day' : 'days'} before`}
            description={
              reminder.dueNow
                ? REVIEW_SCREEN_COPY.reminderDueNow
                : `Push notification on ${formatDateShort(reminder.on)}`
            }
            value={values.reminderEnabled}
            onValueChange={(reminderEnabled) => change({ reminderEnabled })}
            testID="review-reminder"
          />
        </Card>
      ) : null}

      <View style={styles.banner}>
        <Text style={styles.bannerText}>{REVIEW_SCREEN_COPY.banner}</Text>
      </View>

      {formError ? (
        <Text
          style={styles.formError}
          accessibilityLiveRegion="polite"
          testID="review-form-error"
        >
          {formError}
        </Text>
      ) : null}

      <View style={styles.actions}>
        <Button
          label={REVIEW_SCREEN_COPY.confirm}
          onPress={() => confirm.mutate()}
          disabled={unresolved.length > 0 || !valid || busy}
          loading={confirm.isPending}
          loadingLabel={REVIEW_SCREEN_COPY.confirming}
          accessibilityHint={hint ?? undefined}
          fullWidth
          testID="review-confirm"
        />
        {hint ? (
          <Text style={styles.hint} testID="review-hint">
            {hint}
          </Text>
        ) : null}
        <Button
          label={REVIEW_SCREEN_COPY.edit}
          variant="secondary"
          onPress={() => setEditing(true)}
          disabled={busy}
          fullWidth
          testID="review-edit"
        />
        <Button
          label={REVIEW_SCREEN_COPY.discard}
          variant="ghost"
          onPress={() => discard.mutate()}
          disabled={busy}
          loading={discard.isPending}
          fullWidth
          testID="review-discard"
        />
      </View>

      <BottomSheet
        visible={sheetRow !== null}
        onClose={() => setSheetRow(null)}
        title={sheetRow ? sheetRow.label : undefined}
        testID="review-check-sheet"
      >
        {sheetRow ? (
          <View style={styles.sheet}>
            <Text style={styles.sheetValue}>{displayValue(values, sheetRow.key)}</Text>
            <Text style={styles.body}>
              {sheetRow.confidence !== null
                ? `We're ${percent(sheetRow.confidence)} sure of this. Check it against the email above.`
                : "We couldn't match this to the email. Check it before you save."}
            </Text>
            <Button
              label={REVIEW_SCREEN_COPY.looksRight}
              onPress={() => {
                setConfirmed((previous) => new Set(previous).add(sheetRow.key));
                setSheetRow(null);
              }}
              fullWidth
              testID="review-looks-right"
            />
            <Button
              label={REVIEW_SCREEN_COPY.changeIt}
              variant="secondary"
              onPress={() => {
                setSheetRow(null);
                setEditing(true);
              }}
              fullWidth
              testID="review-change-it"
            />
          </View>
        ) : null}
      </BottomSheet>
    </Screen>
  );
}

function DetailRow({
  row,
  values,
  needsCheck,
  checked,
  onPress,
}: {
  row: ReviewRow;
  values: ReviewValues;
  needsCheck: boolean;
  checked: boolean;
  onPress: () => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const value = displayValue(values, row.key);
  // Checked rows say so; others show their score (≥ 90% green, else amber).
  const chip: { text: string; tone: 'high' | 'medium' } | null = checked
    ? { text: REVIEW_SCREEN_COPY.checked, tone: 'high' }
    : !needsCheck && row.confidence !== null
      ? { text: percent(row.confidence), tone: row.band === 'high' ? 'high' : 'medium' }
      : null;
  const helper = needsCheck ? helperFor(row, values) : null;
  const spoken = [
    row.label,
    value === '—' ? REVIEW_SCREEN_COPY.notFound : value,
    chip ? `${chip.text}${chip.text.endsWith('%') ? ' confidence' : ''}` : null,
    helper,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={spoken}
      accessibilityHint="Opens the editor"
      style={({ pressed }) => [
        styles.row,
        needsCheck && styles.rowFlagged,
        pressed && styles.pressed,
      ]}
      testID={`review-row-${row.key}`}
    >
      <View style={styles.rowLine}>
        <Text style={styles.rowLabel}>{row.label}</Text>
        <View style={styles.rowRight}>
          <Text style={styles.rowValue}>
            {needsCheck && value !== '—' ? `${value}?` : value}
          </Text>
          {needsCheck ? (
            <CircleHelp size={sizes.iconSmall} color={colors.warning} strokeWidth={2} />
          ) : chip ? (
            <View
              style={[
                styles.chip,
                chip.tone === 'high' ? styles.chipHigh : styles.chipMedium,
              ]}
              testID={`review-chip-${row.key}`}
            >
              <Text
                style={[styles.chipText, chip.tone === 'high' && styles.chipTextHigh]}
              >
                {chip.text}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
      {helper ? (
        <Text style={styles.helper} testID={`review-helper-${row.key}`}>
          {helper}
        </Text>
      ) : null}
    </Pressable>
  );
}

const useStyles = makeStyles(({ colors, typography }) => ({
  content: {
    gap: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  heading: {
    gap: spacing.xs,
  },
  eyebrow: {
    ...typography.bodyMd,
    color: colors.textMuted,
  },
  // Measured DM Serif 26; nearest token is displayMd (24).
  title: {
    ...typography.displayMd,
  },
  provenance: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm + spacing.xs / 2,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: sizes.hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface2,
  },
  // 12px minimum, not the frame's 11 (11 §2.4 fix 3).
  provenanceText: {
    ...typography.sectionLabel,
    color: colors.accent,
  },
  snippet: {
    padding: spacing.md,
    gap: spacing.xs,
  },
  muted: {
    ...typography.caption,
    color: colors.textMuted,
  },
  subject: {
    ...typography.labelSemibold,
    color: colors.text,
  },
  body: {
    ...typography.labelMd,
    color: colors.text,
  },
  details: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  detailsTitle: {
    ...typography.labelSemibold,
    color: colors.text,
  },
  row: {
    minHeight: sizes.minTouch,
    justifyContent: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.card,
    borderWidth: sizes.hairline,
    borderColor: 'transparent',
  },
  // 11 §2.4 fix 3: warning tokens, not the frame's failing amber.
  rowFlagged: {
    backgroundColor: colors.warningSurface,
    borderColor: colors.warning,
  },
  rowLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  rowLabel: {
    ...typography.labelMd,
    color: colors.textMuted,
  },
  rowRight: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  rowValue: {
    ...typography.labelSemibold,
    color: colors.text,
    flexShrink: 1,
    textAlign: 'right',
  },
  helper: {
    ...typography.caption,
    color: colors.text,
  },
  chip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs / 2,
    borderRadius: radius.pill,
  },
  chipHigh: {
    backgroundColor: colors.successSurface,
  },
  chipMedium: {
    backgroundColor: colors.warningSurface,
  },
  chipText: {
    ...typography.captionStrong,
    color: colors.text,
  },
  chipTextHigh: {
    color: colors.success,
  },
  pressed: {
    opacity: opacity.pressed,
  },
  reminder: {
    padding: 0,
  },
  banner: {
    backgroundColor: colors.warningSurface,
    borderRadius: radius.card,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + spacing.xs / 2,
  },
  bannerText: {
    ...typography.captionStrong,
    color: colors.text,
  },
  notice: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.card,
    borderWidth: sizes.hairline,
    borderColor: colors.warning,
    backgroundColor: colors.warningSurface,
  },
  noticeTitle: {
    ...typography.labelSemibold,
    color: colors.text,
  },
  formError: {
    ...typography.labelMd,
    color: colors.text,
    backgroundColor: colors.warningSurface,
    borderRadius: radius.card,
    padding: spacing.md,
  },
  actions: {
    gap: spacing.sm,
  },
  hint: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
  },
  sheet: {
    gap: spacing.md,
  },
  sheetValue: {
    ...typography.displayTitle,
  },
}));
