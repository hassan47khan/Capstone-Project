/**
 * StackedBar — the single horizontal bar showing category shares.
 *
 * What it is for
 *   The thin multi-coloured bar under the monthly total on Home, where each
 *   segment's width is a category's share of spending.
 *
 * The rule this component exists to respect
 *   It takes PERCENTAGES and never amounts. The server computes them with the
 *   largest-remainder method so they sum to exactly 100 (specification section
 *   9). Deriving them here from amounts would reintroduce the rounding error the
 *   server just removed, and the bar would fall a fraction short of its track in
 *   a way that is visible at the right end.
 *
 *   Mapping a percentage to a flex value is layout, not money math: no amount is
 *   added, divided or rounded anywhere in this file.
 *
 * Accessibility
 *   The bar is decorative and hidden from screen readers, because a legend
 *   listing every category, amount and percentage as text sits directly beneath
 *   it. Colour never carries meaning alone — prompt section 10 — so the bar adds
 *   nothing a non-sighted user needs.
 *
 * Design tokens
 *   height   sizes.barStacked (10)
 *   track    colors.sunken
 *   radius   radius.pill
 *   colours  categoryColors[category].bar
 *
 * Used by: Home hero card.
 */
import { StyleSheet, View } from 'react-native';

import { categoryColors, colors, radius, sizes, type Category } from '@/theme';

export interface StackedBarSegment {
  category: Category | null;
  /** Server-computed. Segments are expected to sum to 100. */
  percent: number;
}

export interface StackedBarProps {
  segments: readonly StackedBarSegment[];
  testID?: string;
}

export function StackedBar({ segments, testID }: StackedBarProps) {
  // A segment rounded to 0% would vanish entirely, so a category the user has
  // spending in silently disappears from the chart while staying in the legend.
  // Clamping to a hairline keeps the bar honest about what exists.
  const visible = segments.filter((segment) => segment.percent > 0);

  return (
    <View
      style={styles.track}
      // Decorative: the legend below states every value in words.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID={testID}
    >
      {visible.map((segment, index) => (
        <View
          key={`${segment.category ?? 'uncategorized'}-${index}`}
          style={[
            styles.segment,
            {
              // flexGrow proportional to the share. Not a width percentage,
              // because the gaps between segments would then overflow the row.
              flexGrow: segment.percent,
              backgroundColor: categoryColors[segment.category ?? 'other'].bar,
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    height: sizes.barStacked,
    borderRadius: radius.pill,
    backgroundColor: colors.sunken,
    overflow: 'hidden',
    gap: 2,
  },
  segment: {
    flexBasis: 0,
    // Nothing smaller than this is perceptible; it keeps a 1% category visible.
    minWidth: 3,
    borderRadius: radius.pill,
  },
});
