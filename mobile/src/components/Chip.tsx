/**
 * Chip — a selectable filter pill.
 *
 * What it is for
 *   The horizontal category filter row on the Subscriptions screen: "All",
 *   "Streaming", "Software" and so on. Exactly one is selected at a time.
 *
 * Why the role is "radio" and not "button"
 *   The row behaves as a single-choice group: picking one deselects the others.
 *   A screen reader announcing "button, Streaming" tells the user nothing about
 *   that relationship, whereas "radio button, Streaming, selected" does — and
 *   `accessibilityState.selected` is what makes the current choice audible.
 *
 * Design tokens
 *   height       sizes.chip (44) — also the minimum touch target
 *   radius       radius.pill
 *   unselected   colors.surface background, colors.line border, colors.ink text
 *   selected     colors.ink background, colors.surface text
 *   text         typography.badge
 *
 * Used by: Subscriptions (category filter row).
 */
import { Pressable, StyleSheet, Text } from 'react-native';

import { colors, opacity, radius, sizes, spacing, typography } from '@/theme';

export interface ChipProps {
  label: string;
  selected: boolean;
  onPress: () => void;

  /**
   * Overrides the accessible name. Useful for "All", which on its own does not
   * say what it is filtering.
   */
  accessibilityLabel?: string;

  testID?: string;
}

export function Chip({
  label,
  selected,
  onPress,
  accessibilityLabel,
  testID,
}: ChipProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityLabel={accessibilityLabel ?? label}
      // `selected` is what a screen reader reads out as "selected". Without it
      // the current filter is invisible to anyone not looking at the screen.
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.chip,
        selected ? styles.selected : styles.unselected,
        pressed && styles.pressed,
      ]}
      testID={testID}
    >
      <Text
        style={[styles.label, selected ? styles.selectedLabel : styles.unselectedLabel]}
        numberOfLines={1}
        maxFontSizeMultiplier={1.3}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    height: sizes.chip,
    minHeight: sizes.minTouch,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unselected: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  selected: {
    // Near-black rather than the accent, matching the prototype's filter row,
    // where the selected chip is the strongest thing in the band.
    backgroundColor: colors.ink,
  },
  pressed: {
    opacity: opacity.pressed,
  },
  label: {
    ...typography.badge,
  },
  unselectedLabel: { color: colors.ink },
  selectedLabel: { color: colors.surface },
});
