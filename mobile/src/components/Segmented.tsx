/**
 * Segmented — a horizontal single-choice control.
 *
 * What it is for
 *   The billing-cycle picker on the subscription form: Weekly / Monthly /
 *   Quarterly / Yearly, with the selected option raised on a white thumb.
 *
 * Why it carries the one shadow in the system
 *   The design is flat everywhere else. The thumb is the deliberate exception,
 *   because a white tile on a near-white track needs some lift to read as
 *   "raised" rather than as a gap. Nothing else in the app may use a shadow.
 *
 * Why "radiogroup" and "radio"
 *   It is single-choice, so a screen reader should announce the group and then
 *   each option's selected state. Using buttons would lose that relationship
 *   entirely.
 *
 * Design tokens
 *   track      colors.surface2, radius.card, 4pt padding
 *   thumb      colors.surface, radius.card - 4
 *   height     sizes.segmented (48) inside the padded track
 *   text       typography.labelSemibold; selected colors.text, unselected colors.textMuted
 *
 * Used by: Add/Edit subscription (billing cycle).
 */
import { Pressable, Text, View } from 'react-native';

import { makeStyles, radius, sizes, spacing } from '@/theme';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

export interface SegmentedProps<T extends string> {
  /** Accessible name for the group, e.g. "Billing cycle". */
  label: string;

  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (next: T) => void;

  testID?: string;
}

export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  testID,
}: SegmentedProps<T>) {
  const styles = useStyles();
  return (
    <View
      style={styles.track}
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      testID={testID}
    >
      {options.map((option) => {
        const selected = option.value === value;

        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="radio"
            accessibilityLabel={option.label}
            accessibilityState={{ selected }}
            style={[styles.segment, selected && styles.segmentSelected]}
            testID={testID ? `${testID}-${option.value}` : undefined}
          >
            <Text
              style={[
                styles.label,
                selected ? styles.labelSelected : styles.labelUnselected,
              ]}
              numberOfLines={1}
              // Capped: four segments share one row, so an unbounded multiplier
              // truncates every label at large font sizes.
              maxFontSizeMultiplier={1.2}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles(({ colors, typography }) => ({
  track: {
    flexDirection: 'row',
    backgroundColor: colors.surface2,
    borderRadius: radius.card,
    padding: spacing.xs,
    gap: spacing.xs,
  },
  segment: {
    flex: 1,
    height: sizes.segmented,
    minHeight: sizes.minTouch,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.card - spacing.xs,
  },
  segmentSelected: {
    backgroundColor: colors.surface,
    // The one permitted shadow in the design system. See the header comment.
    shadowColor: colors.text,
    shadowOpacity: 0.08,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  label: {
    ...typography.labelSemibold,
  },
  labelSelected: { color: colors.text },
  labelUnselected: { color: colors.textMuted },
}));
