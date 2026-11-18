/**
 * The Calendar's month grid (11 §1): seven columns, Sunday first; each day
 * shows its date and up to three category-colored dots, then "+N".
 *
 * Today is ringed in `accent`; the selected day is filled `accent` with
 * `onAccent` text. The dots are decorative: each cell's label carries the
 * information ("October 12, 1 charge, Netflix $15.49.").
 */
import { Pressable, Text, View } from 'react-native';

import type { UpcomingBill } from '@/api/analyticsTypes';
import { formatDateSpoken, formatMoney } from '@/api/format';
import type { DateOnly } from '@/api/types';
import { Skeleton } from '@/components';
import { type CategoryKey, makeStyles, sizes, spacing, useTheme } from '@/theme';

import { dayNumber, type MonthKey, WEEKDAYS, weeksOf } from './month';

export const MAX_DOTS = 3;

/** One bill, said aloud: "Netflix $15.49", or "… not converted" without a rate. */
export function spokenBill(bill: UpcomingBill): string {
  const money = bill.amount ?? bill.billing_amount;
  const amount = formatMoney(money.amount, money.currency).display;
  const trial = bill.is_trial ? ', trial ends' : '';
  return `${bill.name} ${amount}${bill.amount === null ? ' not converted' : ''}${trial}`;
}

/** "October 12". */
function spokenDate(date: DateOnly): string {
  return formatDateSpoken(date).replace(/, \d{4}$/, '');
}

/** "October 12, 1 charge, Netflix $15.49." / "October 13, no charges." */
export function dayLabel(date: DateOnly, bills: UpcomingBill[]): string {
  const spoken = spokenDate(date);
  if (bills.length === 0) return `${spoken}, no charges.`;
  const count = `${bills.length} ${bills.length === 1 ? 'charge' : 'charges'}`;
  return `${spoken}, ${count}, ${bills.map(spokenBill).join(', ')}.`;
}

function dotKey(bill: UpcomingBill): CategoryKey {
  return (bill.category?.color_token_key ?? 'other') as CategoryKey;
}

export interface MonthGridProps {
  month: MonthKey;
  today: DateOnly;
  /**
   * Bills by date. Undefined while the month loads (skeleton dots) or when it
   * failed to (plain days, labelled with the date alone: "no charges" would
   * be a claim the app can't make).
   */
  billsByDate?: Map<DateOnly, UpcomingBill[]>;
  loading: boolean;
  selected: DateOnly | null;
  onSelect: (date: DateOnly) => void;
}

export function MonthGrid({
  month,
  today,
  billsByDate,
  loading,
  selected,
  onSelect,
}: MonthGridProps) {
  const styles = useStyles();
  const { categoryColors } = useTheme();

  return (
    <View role="grid" accessibilityLabel="Month" testID="calendar-grid">
      <View style={styles.week} role="row">
        {WEEKDAYS.map((w) => (
          <Text
            key={w.long}
            style={styles.weekday}
            role="columnheader"
            accessibilityLabel={w.long}
          >
            {w.short}
          </Text>
        ))}
      </View>
      {weeksOf(month).map((week) => (
        <View key={week.find(Boolean) ?? 'blank'} style={styles.week} role="row">
          {week.map((date, i) => {
            if (date === null) {
              return (
                <View
                  key={`blank-${i}`}
                  style={styles.cell}
                  importantForAccessibility="no-hide-descendants"
                  accessibilityElementsHidden
                />
              );
            }
            const bills = billsByDate?.get(date) ?? [];
            const isToday = date === today;
            const isSelected = date === selected;
            const extra = bills.length - MAX_DOTS;
            return (
              <Pressable
                key={date}
                role="cell"
                accessibilityLabel={
                  billsByDate ? dayLabel(date, bills) : spokenDate(date)
                }
                accessibilityState={{ selected: isSelected }}
                accessibilityHint={
                  isSelected ? 'Shows every day again' : 'Shows only this day'
                }
                onPress={() => onSelect(date)}
                style={styles.cell}
                testID={`day-${date}`}
              >
                <View
                  style={[
                    styles.dayCircle,
                    isToday && styles.today,
                    isSelected && styles.selected,
                  ]}
                >
                  <Text style={[styles.dayText, isSelected && styles.selectedText]}>
                    {dayNumber(date)}
                  </Text>
                </View>
                <View style={styles.dots} importantForAccessibility="no-hide-descendants">
                  {loading ? (
                    <Skeleton width={sizes.dot * 2} height={sizes.dot / 2} />
                  ) : (
                    <>
                      {bills.slice(0, MAX_DOTS).map((bill) => (
                        <View
                          key={`${bill.subscription_id}-${bill.bill_date}`}
                          style={[
                            styles.dot,
                            { backgroundColor: categoryColors[dotKey(bill)] },
                          ]}
                        />
                      ))}
                      {extra > 0 ? <Text style={styles.more}>+{extra}</Text> : null}
                    </>
                  )}
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const useStyles = makeStyles(({ colors, typography }) => ({
  week: {
    flexDirection: 'row',
  },
  weekday: {
    ...typography.caption,
    flex: 1,
    textAlign: 'center',
    color: colors.textMuted,
    paddingVertical: spacing.xs,
  },
  cell: {
    flex: 1,
    alignItems: 'center',
    minHeight: sizes.button,
    paddingVertical: spacing.xs,
    gap: spacing.xs / 2,
  },
  dayCircle: {
    width: sizes.headerButton,
    height: sizes.headerButton,
    borderRadius: sizes.headerButton / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: sizes.borderFocus,
    borderColor: 'transparent',
  },
  today: {
    borderColor: colors.accent,
  },
  selected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  dayText: {
    ...typography.labelMd,
    color: colors.text,
  },
  selectedText: {
    color: colors.onAccent,
  },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs / 2,
    minHeight: sizes.dot,
  },
  dot: {
    width: sizes.dot,
    height: sizes.dot,
    borderRadius: sizes.dot / 2,
  },
  more: {
    ...typography.caption,
    color: colors.textMuted,
  },
}));
