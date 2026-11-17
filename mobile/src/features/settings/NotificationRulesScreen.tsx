/**
 * Notification Rules (handoff 09 §5; US-12, US-13, US-18). Figma `3:2210`.
 * Reached only from the Settings Notifications row, as a modal (03 §1).
 *
 * Groups (09 §5)
 *   Billing reminders  days before (1–30), reminder time, push, email
 *   Price changes      alert on any change
 *   Summaries          weekly, monthly, delivery day (hidden while monthly is off)
 *   Trials             days before a trial ends (1–14)
 *
 * Every row saves on its own: GET and PATCH /me/notification-rules, one field
 * at a time. Saving is optimistic (09 §8): the control moves at once, and if
 * the save fails it moves back with "Couldn't save. Try again."
 *
 * Not yet
 *   - Alert threshold: it must show dimmed, with why, while "Alert on any
 *     change" is on, and SettingsRow's chevron row can't be disabled yet.
 *     Asked Hassan; it follows in its own PR.
 *   - "Trial ending alerts" on/off: the server has no field for it, so a toggle
 *     wouldn't save. Only the days-before stepper is shown.
 *   - Offline queueing (09 §8): the app has no offline write queue yet, so an
 *     offline change fails and moves back like any other failed save.
 *
 * The title is Header's 20pt, like every Settings screen (03 §4).
 */
import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { useNavigation } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';

import { queryKeys } from '@/api/queryKeys';
import {
  BottomSheet,
  ErrorState,
  GroupedList,
  Header,
  Screen,
  SettingsRow,
  Skeleton,
  SkeletonGroup,
  useToast,
} from '@/components';
import { makeStyles, sizes, spacing, useTheme } from '@/theme';

import {
  getNotificationRules,
  updateNotificationRules,
  type NotificationRules,
  type NotificationRulesPatch,
} from './api';

export const RULES_COPY = {
  title: 'Notification rules',
  loading: 'Loading notification rules',
  billing: 'Billing reminders',
  daysBefore: 'Days before reminder',
  reminderTime: 'Reminder time',
  push: 'Send via push',
  email: 'Send via email',
  priceChanges: 'Price changes',
  anyChange: 'Alert on any change',
  summaries: 'Summaries',
  weekly: 'Weekly spending summary',
  monthly: 'Monthly report',
  deliveryDay: 'Report delivery day',
  trials: 'Trials',
  trialDays: 'Days before trial ends',
  saveFailed: "Couldn't save. Try again.",
} as const;

// The server's ranges (backend/notifications/serializers.py).
export const RULE_LIMITS = {
  daysBefore: { min: 1, max: 30 },
  deliveryDay: { min: 1, max: 28 },
  trialDays: { min: 1, max: 14 },
} as const;

// "1 day", "3 days".
export function formatDays(days: number): string {
  return days === 1 ? '1 day' : `${days} days`;
}

// "09:00:00" -> "9:00 AM", "18:30:00" -> "6:30 PM".
export function formatReminderTime(time: string): string {
  const [hours = 0, minutes = 0] = time.split(':').map((part) => parseInt(part, 10));
  const suffix = hours < 12 ? 'AM' : 'PM';
  return `${hours % 12 || 12}:${String(minutes).padStart(2, '0')} ${suffix}`;
}

// "18:30:00" -> a local Date at 18:30, for the picker only.
export function timeToDate(time: string): Date {
  const [hours = 0, minutes = 0] = time.split(':').map((part) => parseInt(part, 10));
  return new Date(2000, 0, 1, hours, minutes);
}

// A local Date -> "18:30:00", from its local parts (seconds dropped).
export function dateToTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:00`;
}

const ORDINAL_SUFFIXES: Record<number, string> = { 1: 'st', 2: 'nd', 3: 'rd' };

// 1 -> "1st of month", 22 -> "22nd of month", 11 -> "11th of month".
export function formatDeliveryDay(day: number): string {
  const teen = day % 100 >= 11 && day % 100 <= 13;
  const suffix = teen ? 'th' : (ORDINAL_SUFFIXES[day % 10] ?? 'th');
  return `${day}${suffix} of month`;
}

const DELIVERY_DAYS = Array.from(
  { length: RULE_LIMITS.deliveryDay.max },
  (_, index) => index + 1,
);

const RULES_KEY = queryKeys.settings.notificationPreferences();
const SAVE_KEY = [...RULES_KEY, 'save'] as const;

export function NotificationRulesScreen() {
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [timeOpen, setTimeOpen] = useState(false);
  const [dayOpen, setDayOpen] = useState(false);
  // What the server last confirmed, so a failed save moves back to that and
  // not to another unconfirmed value from a quick run of taps.
  const confirmed = useRef<NotificationRules | undefined>(undefined);

  const rules = useQuery({
    queryKey: RULES_KEY,
    queryFn: async () => {
      const fetched = await getNotificationRules();
      confirmed.current = fetched;
      return fetched;
    },
  });

  const save = useMutation({
    mutationKey: SAVE_KEY,
    // One at a time and in order, so the server ends on the last tap.
    scope: { id: 'notification-rules' },
    mutationFn: updateNotificationRules,
    onMutate: async (patch) => {
      // A load still in flight would land on top of the change; stop it first.
      // Only then: awaiting when nothing is loading would delay the control.
      if (queryClient.isFetching({ queryKey: RULES_KEY }) > 0) {
        await queryClient.cancelQueries({ queryKey: RULES_KEY });
      }
      const previous = queryClient.getQueryData<NotificationRules>(RULES_KEY);
      queryClient.setQueryData<NotificationRules>(RULES_KEY, (old) =>
        old ? { ...old, ...patch } : old,
      );
      return { previous };
    },
    onError: (_error, patch, context) => {
      const known = confirmed.current ?? context?.previous;
      if (known) {
        const back = Object.fromEntries(
          Object.keys(patch).map((field) => [
            field,
            known[field as keyof NotificationRules],
          ]),
        );
        queryClient.setQueryData<NotificationRules>(RULES_KEY, (old) =>
          old ? { ...old, ...back } : old,
        );
      }
      toast.show(RULES_COPY.saveFailed, 'neutral');
    },
    onSuccess: (saved, patch) => {
      confirmed.current = saved;
      // Only the last save in flight shows the server's copy, so a run of
      // stepper taps doesn't flick back through the in-between values.
      if (queryClient.isMutating({ mutationKey: SAVE_KEY }) <= 1) {
        queryClient.setQueryData(RULES_KEY, saved);
      }
      // The trial window decides which trials Home lists as urgent.
      if ('trial_alert_days_before' in patch) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.analytics.all });
      }
    },
  });

  const set = (patch: NotificationRulesPatch) => save.mutate(patch);

  return (
    <Screen edges={['top', 'bottom']} testID="notification-rules-screen">
      <Header title={RULES_COPY.title} onClose={() => navigation.goBack()} />

      {rules.data ? (
        <RulesForm
          rules={rules.data}
          set={set}
          timeOpen={timeOpen}
          onToggleTime={() => setTimeOpen((open) => !open)}
          onCloseTime={() => setTimeOpen(false)}
          onOpenDay={() => setDayOpen(true)}
        />
      ) : rules.isError ? (
        <ErrorState
          error={rules.error}
          onRetry={() => rules.refetch()}
          testID="rules-error"
        />
      ) : (
        <RulesSkeleton />
      )}

      {rules.data ? (
        <DeliveryDaySheet
          visible={dayOpen}
          value={rules.data.report_delivery_day}
          onChoose={(day) => {
            setDayOpen(false);
            if (day !== rules.data.report_delivery_day) set({ report_delivery_day: day });
          }}
          onClose={() => setDayOpen(false)}
        />
      ) : null}
    </Screen>
  );
}

interface RulesFormProps {
  rules: NotificationRules;
  set: (patch: NotificationRulesPatch) => void;
  timeOpen: boolean;
  onToggleTime: () => void;
  onCloseTime: () => void;
  onOpenDay: () => void;
}

function RulesForm({
  rules,
  set,
  timeOpen,
  onToggleTime,
  onCloseTime,
  onOpenDay,
}: RulesFormProps) {
  const { colors, scheme } = useTheme();

  const onTime = (event: DateTimePickerEvent, date?: Date) => {
    // Android's picker is a dialog that closes itself; iOS's spinner stays.
    if (Platform.OS === 'android') onCloseTime();
    if (event.type !== 'set' || !date) return;
    const time = dateToTime(date);
    if (time !== rules.reminder_time) set({ reminder_time: time });
  };

  return (
    <>
      <GroupedList title={RULES_COPY.billing}>
        <SettingsRow
          variant="stepper"
          label={RULES_COPY.daysBefore}
          value={rules.days_before_reminder}
          min={RULE_LIMITS.daysBefore.min}
          max={RULE_LIMITS.daysBefore.max}
          format={formatDays}
          onValueChange={(days) => set({ days_before_reminder: days })}
          testID="rules-days"
        />
        <SettingsRow
          label={RULES_COPY.reminderTime}
          value={formatReminderTime(rules.reminder_time)}
          onPress={onToggleTime}
          testID="rules-time"
        />
        <SettingsRow
          variant="toggle"
          label={RULES_COPY.push}
          value={rules.send_push}
          onValueChange={(on) => set({ send_push: on })}
          testID="rules-push"
        />
        <SettingsRow
          variant="toggle"
          label={RULES_COPY.email}
          value={rules.send_email}
          onValueChange={(on) => set({ send_email: on })}
          testID="rules-email"
        />
      </GroupedList>

      {timeOpen ? (
        <DateTimePicker
          value={timeToDate(rules.reminder_time)}
          mode="time"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          themeVariant={scheme}
          accentColor={colors.accent}
          onChange={onTime}
          testID="rules-time-picker"
        />
      ) : null}

      <GroupedList title={RULES_COPY.priceChanges}>
        <SettingsRow
          variant="toggle"
          label={RULES_COPY.anyChange}
          value={rules.alert_on_any_price_change}
          onValueChange={(on) => set({ alert_on_any_price_change: on })}
          testID="rules-any-change"
        />
      </GroupedList>

      <GroupedList title={RULES_COPY.summaries}>
        <SettingsRow
          variant="toggle"
          label={RULES_COPY.weekly}
          value={rules.weekly_summary_enabled}
          onValueChange={(on) => set({ weekly_summary_enabled: on })}
          testID="rules-weekly"
        />
        <SettingsRow
          variant="toggle"
          label={RULES_COPY.monthly}
          value={rules.monthly_report_enabled}
          onValueChange={(on) => set({ monthly_report_enabled: on })}
          testID="rules-monthly"
        />
        {/* 09 §5: hidden, not dimmed, while there is no monthly report. */}
        {rules.monthly_report_enabled ? (
          <SettingsRow
            label={RULES_COPY.deliveryDay}
            value={formatDeliveryDay(rules.report_delivery_day)}
            onPress={onOpenDay}
            testID="rules-delivery-day"
          />
        ) : null}
      </GroupedList>

      <GroupedList title={RULES_COPY.trials}>
        <SettingsRow
          variant="stepper"
          label={RULES_COPY.trialDays}
          value={rules.trial_alert_days_before}
          min={RULE_LIMITS.trialDays.min}
          max={RULE_LIMITS.trialDays.max}
          format={formatDays}
          onValueChange={(days) => set({ trial_alert_days_before: days })}
          testID="rules-trial-days"
        />
      </GroupedList>
    </>
  );
}

// Group headers straight away, rows as placeholders (09 §8).
const SKELETON_GROUPS = [
  [RULES_COPY.billing, 4],
  [RULES_COPY.priceChanges, 1],
  [RULES_COPY.summaries, 2],
  [RULES_COPY.trials, 1],
] as const;

function RulesSkeleton() {
  const styles = useStyles();
  return (
    <SkeletonGroup label={RULES_COPY.loading} testID="rules-loading">
      <View>
        {SKELETON_GROUPS.map(([title, rows]) => (
          <GroupedList key={title} title={title}>
            {Array.from({ length: rows }, (_, index) => (
              <View key={index} style={styles.skeletonRow}>
                <Skeleton width="55%" height={14} />
              </View>
            ))}
          </GroupedList>
        ))}
      </View>
    </SkeletonGroup>
  );
}

interface DeliveryDaySheetProps {
  visible: boolean;
  value: number;
  onChoose: (day: number) => void;
  onClose: () => void;
}

// "1st of month" to "28th of month": 28 so every month has the day.
function DeliveryDaySheet({ visible, value, onChoose, onClose }: DeliveryDaySheetProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={RULES_COPY.deliveryDay}
      testID="rules-day-sheet"
    >
      <ScrollView style={styles.dayList}>
        {DELIVERY_DAYS.map((day) => {
          const selected = day === value;
          const label = formatDeliveryDay(day);
          return (
            <Pressable
              key={day}
              onPress={() => onChoose(day)}
              accessibilityRole="button"
              accessibilityLabel={label}
              accessibilityState={{ selected }}
              style={({ pressed }) => [styles.dayOption, pressed && styles.dayPressed]}
              testID={`rules-day-option-${day}`}
            >
              <Text style={styles.dayLabel}>{label}</Text>
              {selected ? (
                <Check
                  size={sizes.iconCheck}
                  color={colors.accent}
                  strokeWidth={2}
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                />
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </BottomSheet>
  );
}

const useStyles = makeStyles(({ colors, typography }) => ({
  skeletonRow: {
    minHeight: sizes.rowSettingsToggle,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  dayList: {
    maxHeight: sizes.minTouch * 7,
  },
  dayOption: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: sizes.minTouch,
    paddingVertical: spacing.sm,
    gap: spacing.md,
    borderBottomWidth: sizes.hairline,
    borderBottomColor: colors.border,
  },
  dayPressed: {
    backgroundColor: colors.surface2,
  },
  dayLabel: {
    ...typography.bodyLg,
    flex: 1,
  },
}));
