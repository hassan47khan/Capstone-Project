/**
 * Chip — a selectable filter pill.
 *
 * What it is for
 *   The horizontal category filter row on the Subscriptions screen: "All",
 *   "Entertainment", "Productivity" and so on. Exactly one is selected at a time.
 *
 * Why the role is "radio" and not "button"
 *   The row behaves as a single-choice group: picking one deselects the others.
 *   A screen reader announcing "button, Entertainment" tells the user nothing about
 *   that relationship, whereas "radio button, Entertainment, selected" does — and
 *   `accessibilityState.selected` is what makes the current choice audible.
 *
 * Design tokens
 *   height       sizes.chip (44) — also the minimum touch target
 *   radius       radius.pill
 *   unselected   colors.surface background, colors.border border, colors.text text
 *   selected     colors.accent background, colors.onAccent text
 *   text         typography.labelSemibold
 *
 * Used by: Subscriptions (category filter row).
 */
import { Pressable, Text } from 'react-native';

import { makeStyles, opacity, radius, sizes, spacing } from '@/theme';

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
  const styles = useStyles();
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

const useStyles = makeStyles(({ colors, typography }) => ({
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
    borderColor: colors.border,
  },
  selected: {
    // Accent fill, as the Figma filter row's active pill (node 16:21).
    backgroundColor: colors.accent,
  },
  pressed: {
    opacity: opacity.pressed,
  },
  label: {
    ...typography.labelSemibold,
  },
  unselectedLabel: { color: colors.text },
  selectedLabel: { color: colors.onAccent },
}));
