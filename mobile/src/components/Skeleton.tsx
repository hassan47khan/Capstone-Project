/**
 * Skeleton — a placeholder block shown while content loads.
 *
 * What it is for
 *   Holding the shape of a list row or a hero figure until the real data
 *   arrives. Prompt section 9 asks for skeletons rather than spinners on lists
 *   and the hero.
 *
 * Why skeletons rather than a spinner
 *   A spinner says "something is happening" and nothing else. A skeleton in the
 *   shape of the eventual content says what is coming and keeps the layout
 *   still, so the screen does not jump when data lands. On a list that is the
 *   difference between a calm load and a flicker.
 *
 * Why there is no shimmer animation
 *   A looping animation is a distraction, costs a frame budget on low-end
 *   Android, and `prefers-reduced-motion` is not reliably available in React
 *   Native. A static tint is calmer and never has to be turned off.
 *
 * Accessibility
 *   One "Loading" announcement per skeleton GROUP, not per block — six blocks
 *   each saying "loading" is a worse experience than silence. Callers use
 *   `SkeletonGroup` to wrap a set.
 *
 * Design tokens
 *   fill     colors.sunken
 *   radius   radius.control for blocks, radius.tile for squares
 *
 * Used by: Home hero and renewals list, Subscriptions list, Insights.
 */
import type { ReactNode } from 'react';
import { StyleSheet, View, type DimensionValue } from 'react-native';

import { colors, radius, sizes, spacing } from '@/theme';

export interface SkeletonProps {
  /** Pass a percentage string to vary line lengths so a block looks like text. */
  width?: DimensionValue;
  height?: number;
  /** `tile` gives the squarer radius used for monogram placeholders. */
  shape?: 'block' | 'tile';
  testID?: string;
}

export function Skeleton({
  width = '100%',
  height = 16,
  shape = 'block',
  testID,
}: SkeletonProps) {
  return (
    <View
      style={[
        styles.skeleton,
        {
          width,
          height,
          borderRadius: shape === 'tile' ? radius.tile : radius.control,
        },
      ]}
      // Silent individually; the surrounding group does the announcing.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID={testID}
    />
  );
}

export interface SkeletonGroupProps {
  children: ReactNode;
  /** What is loading, e.g. "Loading subscriptions". */
  label?: string;
  testID?: string;
}

/** Wraps a set of skeletons so screen readers hear one "loading", not six. */
export function SkeletonGroup({
  children,
  label = 'Loading',
  testID,
}: SkeletonGroupProps) {
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityState={{ busy: true }}
      testID={testID}
    >
      {children}
    </View>
  );
}

/**
 * The placeholder for one subscription row: tile, two lines of text, a price.
 * Matching the real row's 64pt height is what stops the list jumping when the
 * data arrives.
 */
export function SkeletonRow({ testID }: { testID?: string }) {
  return (
    <View style={styles.row} testID={testID}>
      <Skeleton width={sizes.tile} height={sizes.tile} shape="tile" />
      <View style={styles.rowText}>
        <Skeleton width="60%" height={16} />
        <Skeleton width="40%" height={12} />
      </View>
      <Skeleton width={64} height={16} />
    </View>
  );
}

const styles = StyleSheet.create({
  skeleton: {
    backgroundColor: colors.sunken,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: sizes.rowSubscription,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  rowText: {
    flex: 1,
    gap: spacing.sm,
  },
});
