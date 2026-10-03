/**
 * BarRow — one category's row in the "By category" breakdown.
 *
 * What it is for
 *   A labelled row on the Insights screen: the category name, its amount and
 *   percentage as text, and a proportional bar beneath them.
 *
 * Why the numbers are text and the bar is decoration
 *   Prompt section 10 is explicit: every chart has the same figures beside it in
 *   words, and colour never carries meaning alone. So the text is the content
 *   and the bar is an aid for scanning — which is also why the bar is hidden
 *   from screen readers while the row as a whole is announced in full.
 *
 * It takes a server-computed percentage and never derives one. See StackedBar
 * for why that matters.
 *
 * Design tokens
 *   bar height  sizes.barRow (8)
 *   track       colors.sunken
 *   fill        categoryColors[category].bar
 *   label       typography.rowTitle
 *   value       typography.caption, amounts in ink2
 *
 * Used by: Insights "By category", Home legend.
 */
import { StyleSheet, Text, View } from 'react-native';

import { formatMoney } from '@/api/format';
import type { CurrencyCode, MoneyString } from '@/api/types';
import {
  CATEGORY_LABELS,
  categoryColors,
  colors,
  numericVariant,
  radius,
  sizes,
  spacing,
  typography,
  type Category,
} from '@/theme';

export interface BarRowProps {
  /** Null renders as "Uncategorized" and uses the `other` colour. */
  category: Category | null;

  /** Decimal string from the API. Formatted, never computed with. */
  amount: MoneyString;

  currency: CurrencyCode;

  /** Server-computed share, 0–100. */
  percent: number;

  testID?: string;
}

export function BarRow({ category, amount, currency, percent, testID }: BarRowProps) {
  const label = CATEGORY_LABELS[category ?? 'other'];
  const palette = categoryColors[category ?? 'other'];
  const { display } = formatMoney(amount, currency);

  return (
    <View
      style={styles.row}
      // One stop per category, reading name, amount and share together.
      accessible
      accessibilityLabel={`${label}, ${display}, ${percent} percent`}
      testID={testID}
    >
      <View style={styles.header}>
        <Text style={styles.label} numberOfLines={1}>
          {label}
        </Text>
        <Text style={styles.value}>
          {display} · {percent}%
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
              // Clamped so a bad value cannot render a bar wider than its track.
              width: `${Math.max(0, Math.min(100, percent))}%`,
              backgroundColor: palette.bar,
            },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  label: {
    ...typography.rowTitle,
    flexShrink: 1,
  },
  value: {
    ...typography.caption,
    ...numericVariant,
    color: colors.ink2,
  },
  track: {
    height: sizes.barRow,
    borderRadius: radius.pill,
    backgroundColor: colors.sunken,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: radius.pill,
  },
});
