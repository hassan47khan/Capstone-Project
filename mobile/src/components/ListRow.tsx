/**
 * ListRow — one row inside a GroupedList.
 *
 * What it is for
 *   Three shapes of row that share one implementation:
 *     - a subscription: tile, name, "Streaming · Renews Oct 3", price
 *     - a settings row: label on the left, current value and a chevron
 *     - a plain key-value row: label and value, not tappable
 *
 * Why one component for all three
 *   They differ in what they put in the leading and trailing slots, not in
 *   behaviour. The parts that must not vary — row height, padding, press
 *   feedback, how the whole row is announced — are the parts worth sharing.
 *
 * Why the whole row is one accessible element
 *   Left to itself a screen reader reads the name, the subtitle and the price as
 *   three separate stops, so the user has to assemble them. Grouping them into
 *   one element with a composed label ("Streamly Plus, Streaming, renews Oct 3,
 *   $15.49") makes a list usable by swipe.
 *
 * Design tokens
 *   height      sizes.rowSubscription (64) or sizes.rowSettings (56)
 *   padding     spacing.lg horizontal
 *   title       typography.rowTitle
 *   subtitle    typography.caption
 *
 * Used by: Subscriptions, Home upcoming renewals, Settings, Currency picker,
 *          Subscription detail key-value card.
 */
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, opacity, sizes, spacing, typography } from '@/theme';

export interface ListRowProps {
  /** The main line. */
  title: string;

  /** The quieter second line, such as "Streaming · Renews Oct 3". */
  subtitle?: string;

  /** Rendered at the start of the row — usually a `Tile`. */
  leading?: ReactNode;

  /** Rendered at the end — a price, a current value, a chevron, a check. */
  trailing?: ReactNode;

  /** Omit to render a non-interactive row, such as a key-value pair. */
  onPress?: () => void;

  /** `subscription` is the taller 64pt row; `settings` is 56pt. */
  variant?: 'subscription' | 'settings';

  /**
   * Overrides the composed accessible name. Pass one whenever the trailing slot
   * holds information a screen reader would otherwise miss — a price lives in a
   * child component, so it is not part of the title or subtitle.
   */
  accessibilityLabel?: string;

  /** Marks this row as the chosen one, e.g. the selected currency. */
  selected?: boolean;

  testID?: string;
}

export function ListRow({
  title,
  subtitle,
  leading,
  trailing,
  onPress,
  variant = 'settings',
  accessibilityLabel,
  selected = false,
  testID,
}: ListRowProps) {
  const height = variant === 'subscription' ? sizes.rowSubscription : sizes.rowSettings;

  // Falls back to the two visible lines. A caller with a trailing value should
  // pass an explicit label so the value is announced too.
  const composedLabel =
    accessibilityLabel ?? [title, subtitle].filter(Boolean).join(', ');

  const content = (
    <View style={[styles.row, { minHeight: height }, selected && styles.selected]}>
      {leading ? <View style={styles.leading}>{leading}</View> : null}

      <View style={styles.text}>
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
    </View>
  );

  // A row with no handler is content, not a control. Giving it a button role
  // would have a screen reader offer an action that does nothing.
  if (!onPress) {
    return (
      <View accessible accessibilityLabel={composedLabel} testID={testID}>
        {content}
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      accessible
      accessibilityRole="button"
      accessibilityLabel={composedLabel}
      accessibilityState={{ selected }}
      style={({ pressed }) => [pressed && styles.pressed]}
      testID={testID}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
    backgroundColor: colors.surface,
  },
  selected: {
    backgroundColor: colors.accentTint,
  },
  leading: {
    // Fixed, so names line up down the list even when a tile is missing.
    justifyContent: 'center',
  },
  text: {
    // Takes the slack, so a long name wraps rather than squeezing the price.
    flex: 1,
    gap: spacing.xs / 2,
  },
  trailing: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  title: {
    ...typography.rowTitle,
  },
  subtitle: {
    ...typography.caption,
  },
  pressed: {
    opacity: opacity.pressed,
  },
});
