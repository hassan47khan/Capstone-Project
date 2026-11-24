/**
 * Spending by category on Home, as a bar graph you can tap (replaces the
 * donut from 06 §2.3).
 *
 * One BarRow per category, in the server's order (largest first). Each row
 * shows the name, amount and share as text with its bar beneath, so the
 * figures are beside the chart (06 §8). Tapping a row opens that category's
 * screen, which lists its subscriptions.
 *
 * The bar widths are the server's whole-number percentages. Nothing here adds
 * or divides an amount.
 */
import { ChevronRight } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import type { CategorySpend } from '@/api/analyticsTypes';
import { formatMoney } from '@/api/format';
import { BarRow } from '@/components';
import {
  CATEGORY_SLUGS,
  makeStyles,
  opacity,
  sizes,
  spacing,
  UNCATEGORIZED_LABEL,
  useTheme,
  type Category,
  type CategoryKey,
} from '@/theme';

/** The route param for a subscription with no category. */
export const UNCATEGORIZED_SLUG = 'uncategorized';

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

function themeCategory(slug: string | undefined): Category | null {
  return slug && (CATEGORY_SLUGS as readonly string[]).includes(slug)
    ? (slug as Category)
    : null;
}

export function CategoryBars({
  rows,
  onOpen,
}: {
  rows: readonly CategorySpend[];
  onOpen: (row: CategorySpend) => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.list} testID="category-bars">
      {rows.map((row) => {
        const slug = slugFor(row);
        const amount = formatMoney(row.amount.amount, row.amount.currency).display;
        return (
          <Pressable
            key={slug}
            onPress={() => onOpen(row)}
            accessibilityRole="button"
            accessibilityLabel={`${nameFor(row)}, ${amount}, ${row.percent} percent.`}
            accessibilityHint="Opens the category"
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            testID={`category-bar-${slug}`}
          >
            <View style={styles.bar}>
              <BarRow
                category={themeCategory(row.category?.slug)}
                amount={row.amount.amount}
                currency={row.amount.currency}
                percent={row.percent}
              />
            </View>
            <ChevronRight
              size={sizes.iconSmall}
              color={colors.textMuted}
              strokeWidth={2}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles(() => ({
  list: {
    gap: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: sizes.minTouch,
  },
  bar: {
    flex: 1,
  },
  pressed: {
    opacity: opacity.pressed,
  },
}));
