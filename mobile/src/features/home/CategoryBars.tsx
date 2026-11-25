/**
 * Spending by category on Home, as a vertical bar graph you can tap (replaces
 * the donut from 06 §2.3, and the horizontal rows that took most of the screen).
 *
 * One column per category, in the server's order (largest first). Each column
 * shows the amount above its bar and the share below it, so the figures are
 * beside the chart (06 §8); a two-column legend under the chart names the
 * colours. Tapping a column opens that category's screen, which lists its
 * subscriptions. Each column is its own bordered box, like a Settings row, so it
 * reads as tappable, and dims while pressed.
 *
 * Bar heights are the server's whole-number percentages, scaled so the largest
 * category fills the plot. That scaling is geometry only: nothing here adds or
 * divides an amount. Drawn with react-native-svg, like every chart in the app.
 */
import { Pressable, Text, View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';

import type { CategorySpend } from '@/api/analyticsTypes';
import { formatMoney } from '@/api/format';
import { CHART_HEIGHT } from '@/features/subscriptions/PriceHistoryChart';
import {
  makeStyles,
  opacity,
  radius,
  sizes,
  spacing,
  UNCATEGORIZED_LABEL,
  useTheme,
  type CategoryKey,
} from '@/theme';

/** The route param for a subscription with no category. */
export const UNCATEGORIZED_SLUG = 'uncategorized';

/** Bar width. The column around it is wider, so the tap target stays large. */
const BAR_WIDTH = spacing.xxl;
/** A tiny share still gets a visible stub. */
const MIN_BAR = spacing.xs;

export function colorKeyFor(row: CategorySpend): CategoryKey {
  return (row.category?.color_token_key ?? 'other') as CategoryKey;
}

/** The row's slug, or UNCATEGORIZED_SLUG: the key the category screen takes. */
export function slugFor(row: CategorySpend): string {
  return row.category?.slug ?? UNCATEGORIZED_SLUG;
}

export function nameFor(row: CategorySpend): string {
  return row.category?.display_name ?? UNCATEGORIZED_LABEL;
}

/** Pixel height of a bar: the share relative to the largest share. */
export function barHeight(percent: number, maxPercent: number): number {
  if (maxPercent <= 0) return MIN_BAR;
  return Math.max(MIN_BAR, Math.round((CHART_HEIGHT * percent) / maxPercent));
}

export function CategoryBars({
  rows,
  onOpen,
}: {
  rows: readonly CategorySpend[];
  onOpen: (row: CategorySpend) => void;
}) {
  const styles = useStyles();
  const { categoryColors } = useTheme();
  const maxPercent = rows.reduce((max, row) => Math.max(max, row.percent), 0);
  return (
    <View testID="category-bars">
      <View style={styles.plot}>
        {rows.map((row) => {
          const slug = slugFor(row);
          const amount = formatMoney(row.amount.amount, row.amount.currency).display;
          const height = barHeight(row.percent, maxPercent);
          return (
            <Pressable
              key={slug}
              onPress={() => onOpen(row)}
              accessibilityRole="button"
              accessibilityLabel={`${nameFor(row)}, ${amount}, ${row.percent} percent.`}
              accessibilityHint="Opens the category"
              style={({ pressed }) => [styles.column, pressed && styles.highlight]}
              testID={`category-bar-${slug}`}
            >
              <Text
                style={styles.amount}
                numberOfLines={1}
                adjustsFontSizeToFit
                importantForAccessibility="no"
              >
                {amount}
              </Text>
              <View style={styles.barBox}>
                <Svg width={BAR_WIDTH} height={height}>
                  <Rect
                    x={0}
                    y={0}
                    width={BAR_WIDTH}
                    height={height}
                    rx={radius.card}
                    fill={categoryColors[colorKeyFor(row)]}
                  />
                </Svg>
              </View>
              <Text style={styles.percent} importantForAccessibility="no">
                {row.percent}%
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* The colour key. The bars above are the buttons; this only names them. */}
      <View
        style={styles.legend}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        testID="category-legend"
      >
        {rows.map((row) => (
          <View key={slugFor(row)} style={styles.legendItem}>
            <View
              style={[styles.dot, { backgroundColor: categoryColors[colorKeyFor(row)] }]}
            />
            <Text style={styles.legendLabel} numberOfLines={1}>
              {nameFor(row)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const useStyles = makeStyles(({ colors, typography }) => ({
  plot: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.xs,
    paddingTop: spacing.sm,
  },
  // Each category sits in its own bordered box, like a Settings row, so it
  // reads as something to tap.
  column: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: sizes.hairline,
    borderColor: colors.border,
    borderRadius: radius.card,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: sizes.minTouch,
  },
  barBox: {
    height: CHART_HEIGHT,
    justifyContent: 'flex-end',
  },
  amount: {
    ...typography.captionStrong,
    color: colors.text,
  },
  percent: {
    ...typography.caption,
    color: colors.textMuted,
  },
  highlight: {
    opacity: opacity.pressed,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: spacing.xs,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: sizes.hairline,
    borderTopColor: colors.border,
  },
  legendItem: {
    width: '50%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingRight: spacing.sm,
  },
  dot: {
    width: sizes.dot,
    height: sizes.dot,
    borderRadius: radius.pill,
  },
  legendLabel: {
    ...typography.caption,
    color: colors.text,
    flex: 1,
  },
}));
