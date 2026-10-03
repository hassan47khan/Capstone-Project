/**
 * Switch — an on/off toggle with its label and description.
 *
 * What it is for
 *   The notification preference rows in Settings, and the "Remind me 3 days
 *   before" toggle on the subscription form.
 *
 * Why it wraps React Native's Switch rather than being one
 *   Every switch in the design sits in a row with a title and a line of
 *   explanation, and the whole row is tappable — a 44pt control on its own is a
 *   fiddly target. Bundling them guarantees the label, the description, the
 *   touch area and the accessibility state stay in agreement.
 *
 * Why the accessibility state is explicit
 *   `accessibilityRole="switch"` plus `accessibilityState={{ checked }}` is what
 *   makes a screen reader say "switch, on" instead of just reading the label.
 *   Prompt section 10 requires both.
 *
 * Design tokens
 *   on          colors.accent track
 *   off         colors.toggleOff track (3:1 on white, so "off" is visible)
 *   thumb       colors.surface
 *   title       typography.rowTitle
 *   description typography.caption
 *
 * Used by: Settings notification preferences, Add/Edit subscription.
 */
import {
  Platform,
  Pressable,
  StyleSheet,
  Switch as RNSwitch,
  Text,
  View,
} from 'react-native';

import { colors, sizes, spacing, typography } from '@/theme';

export interface SwitchProps {
  label: string;

  /** One line explaining what turning this on actually does. */
  description?: string;

  value: boolean;
  onValueChange: (next: boolean) => void;

  disabled?: boolean;
  testID?: string;
}

export function Switch({
  label,
  description,
  value,
  onValueChange,
  disabled = false,
  testID,
}: SwitchProps) {
  return (
    <Pressable
      // The whole row toggles, not just the 51pt control at its end.
      onPress={() => onValueChange(!value)}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityHint={description}
      accessibilityState={{ checked: value, disabled }}
      style={styles.row}
      testID={testID}
    >
      <View style={styles.text}>
        <Text style={styles.label}>{label}</Text>
        {description ? <Text style={styles.description}>{description}</Text> : null}
      </View>

      {/*
        The inner control is hidden from accessibility: the Pressable above
        already exposes the role, label and state, and leaving both visible
        makes a screen reader announce the same switch twice.
      */}
      <RNSwitch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ false: colors.toggleOff, true: colors.accent }}
        thumbColor={colors.surface}
        // iOS tints the track behind the thumb while animating; matching it to
        // the off colour stops a grey flash as it slides.
        ios_backgroundColor={colors.toggleOff}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={Platform.OS === 'android' ? styles.androidSwitch : undefined}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: sizes.rowSettings,
    paddingVertical: spacing.md,
    gap: spacing.lg,
  },
  text: {
    // Lets the label wrap instead of pushing the switch off the row at large
    // font sizes.
    flex: 1,
    gap: spacing.xs,
  },
  label: {
    ...typography.rowTitle,
  },
  description: {
    ...typography.caption,
  },
  androidSwitch: {
    // Android's switch renders noticeably smaller than iOS's; this brings the
    // two platforms to roughly the same visual weight.
    transform: [{ scaleX: 1.1 }, { scaleY: 1.1 }],
  },
});
