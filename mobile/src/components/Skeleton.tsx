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
 * Motion (02 §14, §15)
 *   An opacity pulse between 0.4 and 1.0 over 1.5s, ease-in-out, on the native
 *   driver. Under reduced motion it does not pulse: it renders static at 0.6.
 *   One shared animated value per block; a group of blocks pulses together
 *   because they start together.
 *
 * Accessibility
 *   One "Loading" announcement per skeleton GROUP, not per block — six blocks
 *   each saying "loading" is a worse experience than silence. Callers use
 *   `SkeletonGroup` to wrap a set.
 *
 * Design tokens
 *   fill     colors.surface2
 *   radius   radius.card for blocks, radius.avatar for squares
 *
 * Used by: Home hero and renewals list, Subscriptions list, Insights.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { Animated, View, type DimensionValue } from 'react-native';

import { makeStyles, opacity, radius, sizes, spacing, useMotion } from '@/theme';

export interface SkeletonProps {
  /** Pass a percentage string to vary line lengths so a block looks like text. */
  width?: DimensionValue;
  height?: number;
  /** `mark` gives the round radius of a ServiceMark placeholder. */
  shape?: 'block' | 'mark';
  testID?: string;
}

export function Skeleton({
  width = '100%',
  height = 16,
  shape = 'block',
  testID,
}: SkeletonProps) {
  const styles = useStyles();
  const m = useMotion();
  const pulse = useState(() => new Animated.Value(opacity.pulseHigh))[0];

  useEffect(() => {
    if (!m.moves) {
      pulse.setValue(opacity.skeletonStatic);
      return;
    }
    const half = m.pulse / 2;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: opacity.pulseLow,
          duration: half,
          easing: m.easeInOut,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: opacity.pulseHigh,
          duration: half,
          easing: m.easeInOut,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [m, pulse]);

  return (
    <Animated.View
      style={[
        styles.skeleton,
        {
          width,
          height,
          borderRadius: shape === 'mark' ? radius.avatar : radius.card,
          opacity: pulse,
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
 * The placeholder for one subscription row: mark, two lines of text, a price.
 * Matching the real row's 64pt height is what stops the list jumping when the
 * data arrives.
 */
export function SkeletonRow({ testID }: { testID?: string }) {
  const styles = useStyles();
  return (
    <View style={styles.row} testID={testID}>
      <Skeleton width={sizes.mark} height={sizes.mark} shape="mark" />
      <View style={styles.rowText}>
        <Skeleton width="60%" height={16} />
        <Skeleton width="40%" height={12} />
      </View>
      <Skeleton width={64} height={16} />
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  skeleton: {
    backgroundColor: colors.surface2,
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
}));
