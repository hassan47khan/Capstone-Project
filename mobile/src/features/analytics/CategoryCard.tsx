/**
 * "Spending by category" and the monthly total (handoff 08 §2.2, §2.3).
 *
 * The chart contract with Home (08 §3): the same request (GET /analytics/summary),
 * the same rows in the server's order (largest first), and each colored by its
 * `color_token_key` through Home's own `colorKeyFor`, so a category is the same
 * color on both screens. Nothing here is computed: amounts, percents and the
 * total are the server's, only formatted.
 *
 * Why not the shared BarRow: it sizes a bar by share of the TOTAL and shows
 * "$54.99 · 43%" as a caption. 08 §2.2 sizes by share of the LARGEST category
 * (the largest fills the track) with the amount in bold beside the name, and
 * 08 §5 wants a 2px floor for tiny categories.
 *
 * TODO(tokens): 08 §2.2 measures an 18 row gap and §2.3 an 18 vertical padding,
 * and the total at 28px; the nearest tokens are spacing.lg (16) and displayLg (32).
 */
import { Text, View } from 'react-native';

import type { AnalyticsSummary, CategorySpend } from '@/api/analyticsTypes';
import { formatMoney } from '@/api/format';
import { Card } from '@/components';
import { colorKeyFor } from '@/features/home/CategoryDonut';
import { makeStyles, radius, sizes, spacing, useTheme } from '@/theme';

export const CATEGORY_COPY = {
  title: 'Spending by category',
  subtitle: 'Current month',
  total: 'Monthly total',
  // The same wording as Home's spend card.
  converted: "Converted at today's rate",
  leftOut: (count: number) =>
    count === 1
      ? '1 subscription left out: there is no exchange rate for its currency.'
      : `${count} subscriptions left out: there is no exchange rate for their currency.`,
} as const;

/**
 * Each bar's width as a fraction of the largest category's (08 §2.2), from the
 * server's `share` (an exact percentage). A ratio of two percentages, for
 * drawing only: no money is added or converted.
 */
export function barFractions(rows: readonly CategorySpend[]): number[] {
  const shares = rows.map((row) => Number(row.share));
  const largest = Math.max(0, ...shares);
  return shares.map((share) => (largest > 0 ? share / largest : 0));
}

export function CategoryCard({ summary }: { summary: AnalyticsSummary }) {
  const styles = useStyles();
  const fractions = barFractions(summary.categories);
  const total = formatMoney(summary.monthly_total.amount, summary.monthly_total.currency);

  return (
    <Card style={styles.card} testID="analytics-category-card">
      <View style={styles.heading}>
        <Text style={styles.title} accessibilityRole="header">
          {CATEGORY_COPY.title}
        </Text>
        <Text style={styles.subtitle}>{CATEGORY_COPY.subtitle}</Text>
      </View>

      {/* 08 §2.2: every category with a non-zero total; the server leaves out zeros. */}
      <View style={styles.rows}>
        {summary.categories.map((row, index) => (
          <CategoryBar
            key={row.category?.slug ?? `uncategorized-${index}`}
            row={row}
            fraction={fractions[index] ?? 0}
          />
        ))}
      </View>

      <View style={styles.divider} />

      <View
        style={styles.totalBox}
        accessible
        accessibilityLabel={`${CATEGORY_COPY.total}, ${total.display}`}
        testID="analytics-monthly-total"
      >
        <Text style={styles.totalLabel}>{CATEGORY_COPY.total}</Text>
        <Text style={styles.totalFigure}>{total.display}</Text>
      </View>

      {/* 08 §5: say when figures were converted, and what was left out. */}
      {summary.converted ? (
        <Text style={styles.note}>{CATEGORY_COPY.converted}</Text>
      ) : null}
      {summary.unconverted_count > 0 ? (
        <Text style={styles.note} testID="analytics-left-out">
          {CATEGORY_COPY.leftOut(summary.unconverted_count)}
        </Text>
      ) : null}
    </Card>
  );
}

function CategoryBar({ row, fraction }: { row: CategorySpend; fraction: number }) {
  const styles = useStyles();
  const { categoryColors } = useTheme();
  const name = row.category?.display_name ?? 'Uncategorized';
  const amount = formatMoney(row.amount.amount, row.amount.currency).display;

  return (
    <View
      style={styles.row}
      // One stop per category: name, amount and share together (08 §7).
      accessible
      accessibilityLabel={`${name}, ${amount}, ${row.percent} percent of monthly spending.`}
      testID={`analytics-category-${row.category?.slug ?? 'uncategorized'}`}
    >
      <View style={styles.rowText}>
        {/* 08 §5: a long name wraps to 2 lines; the amount never wraps. */}
        <Text style={styles.name} numberOfLines={2}>
          {name}
        </Text>
        <Text style={styles.amount} numberOfLines={1}>
          {amount}
        </Text>
      </View>
      <View
        style={styles.track}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <View
          style={[
            styles.fill,
            {
              width: `${Math.min(100, fraction * 100)}%`,
              backgroundColor: categoryColors[colorKeyFor(row)],
            },
          ]}
          testID={`analytics-bar-${row.category?.slug ?? 'uncategorized'}`}
        />
      </View>
    </View>
  );
}

const useStyles = makeStyles(({ colors, typography }) => ({
  card: {
    padding: spacing.xxl,
    gap: spacing.xl,
  },
  heading: {
    gap: spacing.xs,
  },
  title: {
    ...typography.displayMd,
  },
  subtitle: {
    ...typography.bodyMd,
    color: colors.textMuted,
  },
  rows: {
    gap: spacing.lg,
  },
  row: {
    gap: spacing.sm,
  },
  rowText: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  name: {
    ...typography.labelSemibold,
    flexShrink: 1,
  },
  amount: {
    ...typography.labelBold,
  },
  track: {
    height: sizes.barRow,
    borderRadius: radius.card,
    backgroundColor: colors.surface2,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: radius.pill,
    // 08 §5: a category under 1% still shows a sliver.
    minWidth: sizes.hairline * 2,
  },
  divider: {
    height: sizes.hairline,
    backgroundColor: colors.border,
  },
  totalBox: {
    backgroundColor: colors.successSurface,
    borderRadius: radius.card,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    gap: spacing.xs,
  },
  totalLabel: {
    ...typography.labelSemibold,
  },
  totalFigure: {
    ...typography.displayLg,
    color: colors.success,
  },
  note: {
    ...typography.caption,
    color: colors.textMuted,
  },
}));
