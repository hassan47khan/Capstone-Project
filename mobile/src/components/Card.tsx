/**
 * Card — the bordered container (handoff 02 §8).
 *
 * What it is for
 *   Summary panels, the analytics breakdown, any grouped block of content.
 *
 * No shadow
 *   There are no drop shadows anywhere in the design; the 1px border carries
 *   the separation from the cream page.
 *
 * Design tokens
 *   fill     colors.surface
 *   border   1px colors.border
 *   radius   radius.card (6)
 *   padding  spacing.xxl (24); sections inside are spaced spacing.xl (20)
 */
import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { makeStyles, radius, sizes, spacing } from '@/theme';

export interface CardProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Accessible name when the card is announced as one group. */
  accessibilityLabel?: string;
  testID?: string;
}

export function Card({ children, style, accessibilityLabel, testID }: CardProps) {
  const styles = useStyles();
  return (
    <View
      style={[styles.card, style]}
      accessible={Boolean(accessibilityLabel)}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
    >
      {children}
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  card: {
    backgroundColor: colors.surface,
    borderWidth: sizes.hairline,
    borderColor: colors.border,
    borderRadius: radius.card,
    padding: spacing.xxl,
    gap: spacing.xl,
  },
}));
