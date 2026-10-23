/**
 * The sections of Home, in order (handoff 06 §2): greeting, monthly spend,
 * spending by category, urgent attention, upcoming renewals.
 *
 * Each takes server data and renders it; none of them computes a figure.
 * Loading and failure are handled per section (06 §5): a skeleton while the
 * section's request runs, an inline retry if it fails, so one slow or broken
 * endpoint never blanks the screen.
 */
import { TrendingDown, TrendingUp } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import type {
  AnalyticsSummary,
  PriceChangeItem,
  SpendOverTime,
  Upcoming,
  UpcomingBill,
} from '@/api/analyticsTypes';
import { formatDateSpoken, formatMoney } from '@/api/format';
import {
  AlertCard,
  Amount,
  Badge,
  Button,
  Card,
  ErrorState,
  ServiceMark,
  Skeleton,
  SkeletonGroup,
} from '@/components';
import { makeStyles, opacity, radius, sizes, spacing, useTheme } from '@/theme';

import { CategoryDonut, colorKeyFor } from './CategoryDonut';
import { alertFor, deltaFor, greetingFor, initialsFor } from './homeCopy';

/** 06 §2.4 and §2.5: how many cards and rows Home shows. */
export const MAX_URGENT = 3;
export const MAX_UPCOMING = 4;

// Greeting -------------------------------------------------------------------

export function Greeting({
  name,
  hour,
  onProfile,
}: {
  name: string | null;
  hour: number;
  onProfile: () => void;
}) {
  const styles = useStyles();
  return (
    <View style={styles.greetingRow}>
      <View style={styles.greetingText}>
        <Text style={styles.greetingLine}>{greetingFor(hour)},</Text>
        {name ? (
          <Text style={styles.name} accessibilityRole="header" numberOfLines={1}>
            {name}
          </Text>
        ) : null}
      </View>
      <Pressable
        onPress={onProfile}
        accessibilityRole="button"
        accessibilityLabel="Profile"
        style={({ pressed }) => [styles.avatar, pressed && styles.pressed]}
        testID="home-avatar"
      >
        <Text style={styles.initials}>{name ? initialsFor(name) : ''}</Text>
      </Pressable>
    </View>
  );
}

// Section frame ----------------------------------------------------------------

export function Section({
  title,
  action,
  children,
  testID,
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  testID?: string;
}) {
  const styles = useStyles();
  return (
    <View style={styles.section} testID={testID}>
      {title ? (
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle} accessibilityRole="header">
            {title}
          </Text>
          {action}
        </View>
      ) : null}
      {children}
    </View>
  );
}

export function SectionLoading({ label, rows = 2 }: { label: string; rows?: number }) {
  return (
    <SkeletonGroup label={label}>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} height={sizes.field} />
      ))}
    </SkeletonGroup>
  );
}

export function SectionError({
  error,
  onRetry,
  testID,
}: {
  error: unknown;
  onRetry: () => void;
  testID?: string;
}) {
  return <ErrorState error={error} onRetry={onRetry} testID={testID} />;
}

// Monthly recurring spend (06 §2.2) ------------------------------------------------

export function SpendCard({
  summary,
  spend,
  converted,
}: {
  summary: AnalyticsSummary;
  spend: SpendOverTime | undefined;
  /**
   * Whether figures here were converted from another billing currency, from
   * the server's own currencies (see convertedFrom in HomeScreen). Not
   * "display currency isn't USD": a EUR user billed only in EUR sees no note.
   */
  converted: boolean;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const total = summary.monthly_total;
  const delta = spend ? deltaFor(spend) : null;
  const figure = formatMoney(total.amount, total.currency).display;
  const deltaSpoken = delta
    ? delta.percent
      ? `${delta.direction} ${delta.percent} ${delta.rest}`
      : delta.rest
    : null;

  return (
    <Card style={styles.spendCard}>
      <View
        accessible
        accessibilityLabel={[
          `Monthly recurring spend, ${figure}`,
          deltaSpoken,
          `${summary.active_count} active subscriptions`,
        ]
          .filter(Boolean)
          .join(', ')}
        testID="spend-card"
        style={styles.spendInner}
      >
        <View style={styles.spaceBetween}>
          <Text style={styles.eyebrow}>MONTHLY RECURRING SPEND</Text>
          <Badge label={`${summary.active_count} active`} tone="success" />
        </View>

        <View style={styles.figureRow}>
          <Amount value={total.amount} currency={total.currency} size="hero" />
          <Text style={styles.suffix}>/mo</Text>
          {converted ? (
            <View style={styles.chip}>
              <Text style={styles.chipText}>{summary.display_currency}</Text>
            </View>
          ) : null}
        </View>

        {delta ? (
          <View style={styles.deltaRow} testID="spend-delta">
            {delta.direction === 'down' ? (
              <TrendingDown size={sizes.iconSmall} color={colors.success} />
            ) : delta.direction === 'up' ? (
              <TrendingUp size={sizes.iconSmall} color={colors.text} />
            ) : null}
            <Text style={styles.deltaRest}>
              {delta.percent ? (
                // A decrease is good news in green; an increase is information,
                // in text colour, never danger (06 §2.2).
                <Text
                  style={delta.direction === 'down' ? styles.deltaDown : styles.deltaUp}
                >
                  {delta.percent}{' '}
                </Text>
              ) : null}
              {delta.rest}
            </Text>
          </View>
        ) : null}

        {converted ? (
          <Text style={styles.caption}>Converted at today&apos;s rate</Text>
        ) : null}
      </View>
    </Card>
  );
}

// Spending by category (06 §2.3) ---------------------------------------------------

export function CategoryCard({ summary }: { summary: AnalyticsSummary }) {
  const styles = useStyles();
  const { categoryColors } = useTheme();
  return (
    <Card style={styles.categoryCard} testID="category-card">
      <CategoryDonut rows={summary.categories} />
      <View style={styles.legend}>
        {summary.categories.map((row, index) => {
          const name = row.category?.display_name ?? 'Uncategorized';
          return (
            <View
              key={row.category?.slug ?? `uncategorized-${index}`}
              style={styles.spaceBetween}
              accessible
              accessibilityLabel={`${name}, ${row.percent} percent.`}
              testID={`legend-${row.category?.slug ?? 'uncategorized'}`}
            >
              <View style={styles.legendName}>
                <View
                  style={[
                    styles.dot,
                    { backgroundColor: categoryColors[colorKeyFor(row)] },
                  ]}
                />
                <Text style={styles.legendLabel} numberOfLines={1} ellipsizeMode="tail">
                  {name}
                </Text>
              </View>
              <Text style={styles.legendPercent}>{row.percent}%</Text>
            </View>
          );
        })}
      </View>
    </Card>
  );
}

// Urgent attention (06 §2.4) ------------------------------------------------------

export function UrgentList({
  items,
  onOpen,
}: {
  items: PriceChangeItem[];
  onOpen: (item: PriceChangeItem) => void;
}) {
  const styles = useStyles();
  return (
    <View style={styles.list}>
      {items.slice(0, MAX_URGENT).map((item) => {
        const words = alertFor(item);
        return (
          <AlertCard
            key={`${item.kind}-${item.subscription_id}-${item.effective_on}`}
            tone="warning"
            title={words.title}
            message={words.message}
            onPress={() => onOpen(item)}
            accessibilityLabel={words.label}
            accessibilityHint={
              item.kind === 'trial_ending'
                ? 'Opens Trial Shield'
                : 'Opens the subscription'
            }
            testID={`urgent-${item.kind}-${item.subscription_id}`}
          />
        );
      })}
    </View>
  );
}

// Upcoming renewals (06 §2.5) ------------------------------------------------------

function relativeDays(days: number): string {
  if (days <= 0) return 'today';
  if (days === 1) return 'tomorrow';
  return `in ${days} days`;
}

function RenewalRow({ bill, onPress }: { bill: UpcomingBill; onPress: () => void }) {
  const styles = useStyles();
  // What is charged, converted; the billing amount, marked, when there is no rate.
  const money = bill.amount ?? bill.billing_amount;
  const spoken = formatMoney(money.amount, money.currency).display;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={
        // Says so when the amount could not be converted, as the marker shows.
        `${bill.name}, ${spoken}${bill.amount === null ? ', not converted' : ''}, ` +
        `due ${formatDateSpoken(bill.bill_date)}.`
      }
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      testID={`renewal-${bill.subscription_id}`}
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
        <Text style={styles.rowWhen}>{relativeDays(bill.days_until)}</Text>
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

export function RenewalList({
  upcoming,
  onOpen,
  onCalendar,
}: {
  upcoming: Upcoming;
  onOpen: (bill: UpcomingBill) => void;
  onCalendar: () => void;
}) {
  const styles = useStyles();
  if (upcoming.items.length === 0) {
    return (
      <View style={styles.emptyRenewals} testID="renewals-empty">
        <Text style={styles.caption}>No renewals in the next 30 days</Text>
        <Button label="Open Calendar" variant="ghost" onPress={onCalendar} />
      </View>
    );
  }
  return (
    <View style={styles.list}>
      {/* Already soonest first from the server; Home shows the first four. */}
      {upcoming.items.slice(0, MAX_UPCOMING).map((bill) => (
        <RenewalRow
          key={`${bill.subscription_id}-${bill.bill_date}`}
          bill={bill}
          onPress={() => onOpen(bill)}
        />
      ))}
    </View>
  );
}

const useStyles = makeStyles(({ colors, typography }) => ({
  greetingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  greetingText: {
    flex: 1,
    gap: spacing.xs,
  },
  greetingLine: {
    ...typography.captionStrong,
    color: colors.textMuted,
  },
  name: {
    ...typography.displayMd,
    color: colors.text,
  },
  avatar: {
    width: sizes.mark,
    height: sizes.mark,
    borderRadius: radius.avatar,
    borderWidth: sizes.hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  initials: {
    ...typography.labelSemibold,
    color: colors.text,
  },
  pressed: {
    opacity: opacity.pressed,
  },
  section: {
    gap: spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  // TODO(tokens): 06 asks for DM Serif 18/24; displaySm (20/28) is the nearest.
  sectionTitle: {
    ...typography.displaySm,
    color: colors.text,
  },
  spendCard: {
    padding: spacing.xl,
  },
  spendInner: {
    gap: spacing.lg,
  },
  spaceBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  eyebrow: {
    ...typography.sectionLabel,
    color: colors.textMuted,
  },
  figureRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  suffix: {
    ...typography.price,
    color: colors.textMuted,
  },
  chip: {
    backgroundColor: colors.accentSurface,
    borderRadius: radius.badge,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  chipText: {
    ...typography.captionStrong,
    color: colors.text,
  },
  deltaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  deltaRest: {
    ...typography.caption,
    color: colors.textMuted,
  },
  deltaUp: {
    ...typography.captionStrong,
    color: colors.text,
  },
  deltaDown: {
    ...typography.captionStrong,
    color: colors.success,
  },
  caption: {
    ...typography.caption,
    color: colors.textMuted,
  },
  categoryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    gap: spacing.lg,
  },
  legend: {
    flex: 1,
    gap: spacing.sm,
  },
  legendName: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexShrink: 1,
  },
  dot: {
    width: sizes.dot,
    height: sizes.dot,
    borderRadius: radius.badge,
  },
  legendLabel: {
    ...typography.captionStrong,
    color: colors.textMuted,
    flexShrink: 1,
  },
  legendPercent: {
    ...typography.captionStrong,
    color: colors.text,
  },
  list: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: sizes.hairline,
    borderColor: colors.border,
    borderRadius: radius.card,
    minHeight: sizes.minTouch,
  },
  rowText: {
    flex: 1,
    gap: spacing.xs,
  },
  rowName: {
    ...typography.labelSemibold,
    color: colors.text,
  },
  rowWhen: {
    ...typography.captionStrong,
    color: colors.textMuted,
  },
  emptyRenewals: {
    alignItems: 'flex-start',
    gap: spacing.xs,
  },
}));
