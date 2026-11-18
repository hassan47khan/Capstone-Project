/**
 * Calendar (handoff 11 §1): a month of bills.
 *
 *   header       month + year, ‹ › and Today; Trial Shield (11 §2.5) at the right
 *   grid         seven columns, category dots per day, today ringed, tap to filter
 *   month total  the server's total: "$135.69 due in October"
 *   charges      grouped by day, each day with the server's day total
 *
 * Data: GET /analytics/upcoming?start&end for the visible month. Past months
 * show what was charged, future ones what will be. Every total is the
 * server's (rule 1): the client only groups bills by date for display.
 */
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { CalendarX, ChevronLeft, ChevronRight, ShieldCheck } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, PanResponder, Pressable, Text, View } from 'react-native';

import type { Upcoming, UpcomingBill } from '@/api/analyticsTypes';
import { formatDateLong, formatDateShort, formatMoney } from '@/api/format';
import type { DateOnly } from '@/api/types';
import {
  Amount,
  Button,
  EmptyState,
  ErrorState,
  ServiceMark,
  SkeletonGroup,
  SkeletonRow,
} from '@/components';
import { Screen } from '@/components/Screen';
import { describeCycle } from '@/features/subscriptions/formRules';
import { localToday } from '@/features/subscriptions/today';
import type { AppStackParamList, CalendarStackParamList } from '@/navigation/types';
import { makeStyles, opacity, radius, sizes, spacing, useTheme } from '@/theme';

import { calendarMonthKey, getMonth } from './calendarApi';
import { MonthGrid, spokenBill } from './MonthGrid';
import {
  addMonths,
  beforeTracking,
  monthName,
  monthOf,
  monthTitle,
  type MonthKey,
  tense,
} from './month';

/** How far a horizontal swipe must travel to change month. */
const SWIPE_DISTANCE = sizes.iconLarge;

export const CALENDAR_COPY = {
  due: (amount: string, month: string) => `${amount} due in ${month}`,
  charged: (amount: string, month: string) => `${amount} charged in ${month}`,
  noTotal: (month: string) =>
    `No total for ${month}: a charge is in a currency with no exchange rate.`,
  projected: (month: string) =>
    `Figures for ${month} are projected from each billing cycle.`,
  emptyMonth: (month: string) => `No charges in ${month}`,
  emptyMonthMessage: 'Nothing bills this month.',
  emptyDay: (day: string) => `No charges on ${day}`,
  emptyDayMessage: 'Tap the day again to see the whole month.',
  notYet: "You weren't tracking anything yet",
  notYetMessage: (date: string) => `Your first subscription starts ${date}.`,
};

type Navigation = NativeStackNavigationProp<
  CalendarStackParamList & Pick<AppStackParamList, 'SubscriptionDetail'>
>;

/** Bills by date, in the server's order. Grouping only: nothing is added up. */
function byDate(upcoming: Upcoming): Map<DateOnly, UpcomingBill[]> {
  const map = new Map<DateOnly, UpcomingBill[]>();
  for (const bill of upcoming.items) {
    const list = map.get(bill.bill_date) ?? [];
    list.push(bill);
    map.set(bill.bill_date, list);
  }
  return map;
}

export function CalendarScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const navigation = useNavigation<Navigation>();
  const today = localToday();
  const [month, setMonth] = useState<MonthKey>(monthOf(today));
  const [selected, setSelected] = useState<DateOnly | null>(null);

  const query = useQuery({
    queryKey: calendarMonthKey(month),
    queryFn: () => getMonth(month),
  });
  const bills = useMemo(
    () => (query.data ? byDate(query.data) : undefined),
    [query.data],
  );

  const changeMonth = (next: MonthKey) => {
    setSelected(null);
    setMonth(next);
  };
  const go = (step: number) => {
    setSelected(null);
    setMonth((m) => addMonths(m, step));
  };

  // Month navigation announces the new month (11 §1), but not on first render.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    AccessibilityInfo.announceForAccessibility(monthTitle(month));
  }, [month]);

  // Swipe between months; the grid's accessibility actions do the same.
  const [swipe] = useState(() =>
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) =>
        Math.abs(g.dx) > spacing.lg && Math.abs(g.dx) > Math.abs(g.dy) * 2,
      onPanResponderRelease: (_e, g) => {
        if (Math.abs(g.dx) < SWIPE_DISTANCE) return;
        setSelected(null);
        setMonth((m) => addMonths(m, g.dx < 0 ? 1 : -1));
      },
    }),
  );

  const name = monthName(month);
  const when = tense(month, today);
  const data = query.data;
  const days = data
    ? data.days.filter((d) => selected === null || d.date === selected)
    : [];

  return (
    <Screen
      edges={['top']}
      onRefresh={() => query.refetch()}
      refreshing={query.isRefetching}
      testID="calendar-screen"
    >
      <View style={styles.header}>
        <Text style={styles.title} accessibilityRole="header" testID="calendar-title">
          {monthTitle(month)}
        </Text>
        <Pressable
          onPress={() => navigation.navigate('TrialShield')}
          accessibilityRole="button"
          accessibilityLabel="Trial Shield"
          hitSlop={(sizes.minTouch - sizes.headerButton) / 2}
          style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
          testID="calendar-trial-shield"
        >
          <ShieldCheck size={sizes.icon} color={colors.text} />
        </Pressable>
      </View>

      <View style={styles.nav}>
        <Pressable
          onPress={() => go(-1)}
          accessibilityRole="button"
          accessibilityLabel={`Previous month, ${monthTitle(addMonths(month, -1))}`}
          style={({ pressed }) => [styles.navButton, pressed && styles.pressed]}
          testID="calendar-prev"
        >
          <ChevronLeft size={sizes.icon} color={colors.text} />
        </Pressable>
        <Button
          label="Today"
          variant="ghost"
          onPress={() => {
            changeMonth(monthOf(today));
          }}
          disabled={month === monthOf(today) && selected === null}
          accessibilityHint="Shows this month"
          testID="calendar-today"
        />
        <Pressable
          onPress={() => go(1)}
          accessibilityRole="button"
          accessibilityLabel={`Next month, ${monthTitle(addMonths(month, 1))}`}
          style={({ pressed }) => [styles.navButton, pressed && styles.pressed]}
          testID="calendar-next"
        >
          <ChevronRight size={sizes.icon} color={colors.text} />
        </Pressable>
      </View>

      <View
        {...swipe.panHandlers}
        accessibilityActions={[
          { name: 'increment', label: 'Next month' },
          { name: 'decrement', label: 'Previous month' },
        ]}
        onAccessibilityAction={(e) =>
          go(e.nativeEvent.actionName === 'increment' ? 1 : -1)
        }
        testID="calendar-swipe"
      >
        <MonthGrid
          month={month}
          today={today}
          // A failed load still draws the month, just without dots.
          billsByDate={bills}
          loading={!bills && !query.isError}
          selected={selected}
          onSelect={(date) => setSelected((s) => (s === date ? null : date))}
        />
      </View>

      {query.isError && !data ? (
        <ErrorState
          error={query.error}
          onRetry={() => query.refetch()}
          testID="calendar-error"
        />
      ) : !data ? (
        <SkeletonGroup label="Loading charges" testID="calendar-loading">
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </SkeletonGroup>
      ) : (
        <>
          <MonthTotal data={data} month={name} past={when === 'past'} />
          {when === 'future' ? (
            <Text style={styles.caption} testID="calendar-projected">
              {CALENDAR_COPY.projected(name)}
            </Text>
          ) : null}

          {data.items.length === 0 ? (
            beforeTracking(month, data.tracking_since) && data.tracking_since ? (
              <EmptyState
                icon={CalendarX}
                title={CALENDAR_COPY.notYet}
                message={CALENDAR_COPY.notYetMessage(formatDateLong(data.tracking_since))}
                testID="calendar-not-yet"
              />
            ) : (
              <EmptyState
                icon={CalendarX}
                title={CALENDAR_COPY.emptyMonth(name)}
                message={CALENDAR_COPY.emptyMonthMessage}
                testID="calendar-empty"
              />
            )
          ) : selected !== null && days.length === 0 ? (
            <EmptyState
              title={CALENDAR_COPY.emptyDay(formatDateShort(selected))}
              message={CALENDAR_COPY.emptyDayMessage}
              testID="calendar-empty-day"
            />
          ) : (
            <View style={styles.list} testID="calendar-charges">
              {days.map((day) => {
                const dayBills = bills?.get(day.date) ?? [];
                return (
                  <View key={day.date} style={styles.day} testID={`charges-${day.date}`}>
                    <View
                      style={styles.dayHeader}
                      accessible
                      accessibilityRole="header"
                      accessibilityLabel={
                        day.total
                          ? `${formatDateLong(day.date)}, ${formatMoney(day.total.amount, day.total.currency).display}`
                          : `${formatDateLong(day.date)}, no total`
                      }
                    >
                      <Text style={styles.dayTitle}>{formatDateShort(day.date)}</Text>
                      {day.total ? (
                        <Amount
                          value={day.total.amount}
                          currency={day.total.currency}
                          size="compact"
                        />
                      ) : null}
                    </View>
                    {dayBills.map((bill) => (
                      <ChargeRow
                        key={`${bill.subscription_id}-${bill.bill_date}`}
                        bill={bill}
                        onPress={() =>
                          navigation.navigate('SubscriptionDetail', {
                            id: bill.subscription_id,
                          })
                        }
                      />
                    ))}
                  </View>
                );
              })}
            </View>
          )}
        </>
      )}
    </Screen>
  );
}

function MonthTotal({
  data,
  month,
  past,
}: {
  data: Upcoming;
  month: string;
  past: boolean;
}) {
  const styles = useStyles();
  if (!data.total) {
    return (
      <Text style={styles.total} testID="calendar-total">
        {CALENDAR_COPY.noTotal(month)}
      </Text>
    );
  }
  const amount = formatMoney(data.total.amount, data.total.currency).display;
  return (
    <Text style={styles.total} testID="calendar-total">
      {past ? CALENDAR_COPY.charged(amount, month) : CALENDAR_COPY.due(amount, month)}
    </Text>
  );
}

/** One charge: the logo, the name, its cycle (or "Trial ends"), and the amount. */
function ChargeRow({ bill, onPress }: { bill: UpcomingBill; onPress: () => void }) {
  const styles = useStyles();
  const money = bill.amount ?? bill.billing_amount;
  const cycle = bill.is_trial
    ? 'Trial ends, not in the total'
    : describeCycle({
        billing_cycle: bill.billing_cycle ?? 'monthly',
        custom_cycle_count: bill.custom_cycle_count ?? null,
        custom_cycle_unit: bill.custom_cycle_unit ?? null,
      });
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${spokenBill(bill)}, ${cycle}.`}
      accessibilityHint="Opens the subscription"
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      testID={`charge-${bill.subscription_id}-${bill.bill_date}`}
    >
      <ServiceMark
        name={bill.name}
        mark={bill.service_mark?.mark}
        brand={
          bill.service_mark
            ? { tint: bill.service_mark.tint_hex, ink: bill.service_mark.brand_hex }
            : undefined
        }
        size="compact"
      />
      <View style={styles.rowText}>
        <Text style={styles.rowName} numberOfLines={1} ellipsizeMode="tail">
          {bill.name}
        </Text>
        <Text style={styles.rowCycle} numberOfLines={1}>
          {cycle}
        </Text>
      </View>
      <Amount
        value={money.amount}
        currency={money.currency}
        size="compact"
        unconverted={bill.amount === null}
      />
    </Pressable>
  );
}

const useStyles = makeStyles(({ colors, typography }) => ({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: sizes.header,
  },
  title: {
    ...typography.displayMd,
    color: colors.text,
    flexShrink: 1,
  },
  iconButton: {
    width: sizes.headerButton,
    height: sizes.headerButton,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  navButton: {
    width: sizes.minTouch,
    height: sizes.minTouch,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: opacity.pressed,
  },
  total: {
    ...typography.labelSemibold,
    color: colors.text,
    marginTop: spacing.lg,
  },
  caption: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  list: {
    marginTop: spacing.lg,
    gap: spacing.lg,
  },
  day: {
    gap: spacing.sm,
  },
  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dayTitle: {
    ...typography.sectionLabel,
    color: colors.textMuted,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: sizes.minTouch,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: sizes.hairline,
    borderColor: colors.border,
    borderRadius: radius.card,
  },
  rowText: {
    flex: 1,
    gap: spacing.xs / 2,
  },
  rowName: {
    ...typography.labelSemibold,
    color: colors.text,
  },
  rowCycle: {
    ...typography.caption,
    color: colors.textMuted,
  },
}));
