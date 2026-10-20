/**
 * FilterChip — a selectable filter pill (handoff 02 §17).
 *
 * What it is for
 *   The horizontal category filter row on the Subscriptions screen and the
 *   Analytics range row: "All", "Entertainment", "Productivity". Exactly one is
 *   selected at a time.
 *
 * Why 28 tall but 44 to the finger
 *   02 §17 measures the chip at 28 (padding 12h / 6v, radius 4, 12px label),
 *   which is below the 44pt floor. Growing the box to 44 would make a row of
 *   chips look like a row of buttons, so the drawn height stays 28 and
 *   `hitSlop` extends the target to 44. The slop is vertical only: horizontal
 *   slop on chips 8 apart would make neighbouring targets overlap.
 *
 * Why the row scrolls rather than wraps
 *   The prototype wrapped chips onto several lines, which moved the list down
 *   by a different amount per category count. The row is a single
 *   horizontally-scrolling line (gap 8, 16 gutters); the caller owns the
 *   ScrollView, this component owns one chip.
 *
 * Deviation from 02 §17: the role is "radio", not "button"
 *   The row behaves as a single-choice group: picking one deselects the others.
 *   A screen reader announcing "button, Entertainment" tells the user nothing
 *   about that relationship, whereas "radio button, Entertainment, selected"
 *   does. `accessibilityState.selected` is what 02 asks for and is set either
 *   way; the stronger role is kept deliberately.
 *
 * Design tokens
 *   height       sizes.chipVisual (28) drawn, sizes.minTouch (44) to the finger
 *   radius       radius.badge (4, measured — 01 §5)
 *   padding      spacing.md (12) horizontal
 *   label        typography.captionStrong (Medium 12); Bold when selected
 *   selected     colors.accent fill, colors.onAccent label
 *   unselected   colors.surface fill, colors.border edge, colors.textMuted label
 *
 * Used by: Subscriptions (category filter row), Insights (range row).
 */
import { Pressable, Text } from 'react-native';

import { fontFamily, makeStyles, opacity, radius, sizes, spacing } from '@/theme';

export interface FilterChipProps {
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

/** Vertical slop that lifts the drawn 28 to the 44pt floor. */
const SLOP = (sizes.minTouch - sizes.chipVisual) / 2;

export function FilterChip({
  label,
  selected,
  onPress,
  accessibilityLabel,
  testID,
}: FilterChipProps) {
  const styles = useStyles();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityLabel={accessibilityLabel ?? label}
      // `selected` is what a screen reader reads out as "selected". Without it
      // the current filter is invisible to anyone not looking at the screen.
      accessibilityState={{ selected }}
      // Vertical only: 8px apart, horizontal slop would overlap the neighbour.
      hitSlop={{ top: SLOP, bottom: SLOP }}
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
    height: sizes.chipVisual,
    borderRadius: radius.badge,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unselected: {
    backgroundColor: colors.surface,
    borderWidth: sizes.hairline,
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
    ...typography.captionStrong,
  },
  selectedLabel: {
    fontFamily: fontFamily.bodyBold,
    color: colors.onAccent,
  },
  unselectedLabel: { color: colors.textMuted },
}));
