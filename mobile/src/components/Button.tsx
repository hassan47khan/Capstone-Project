/**
 * Button — every tappable action in the app.
 *
 * What it is for
 *   The four button treatments the design uses, behind one component:
 *     primary      filled petrol    the single main action on a screen
 *     secondary    outlined         an alternative action ("Log in" on Welcome)
 *     text         petrol label     an inline link ("Forgot password?")
 *     dangerText   red label        a destructive action ("Remove subscription")
 *
 * Why one component instead of four
 *   The variants differ only in colour. Everything else — the 52pt height, the
 *   44pt minimum target, the disabled and loading behaviour, the accessibility
 *   props — is identical and must stay identical. Four components would drift.
 *
 * Why `loading` disables the button
 *   A form that stays tappable while submitting gets double-submitted, which on
 *   a create endpoint means two subscriptions. The Idempotency-Key in client.ts
 *   is the second line of defence; this is the first.
 *
 * Design tokens
 *   height         sizes.control (52), floor sizes.minTouch (44)
 *   radius         radius.control (12)
 *   primary        colors.accent background, colors.surface label
 *   secondary      colors.control border, colors.ink label
 *   text           colors.accent label
 *   dangerText     colors.danger label
 *
 * Used by: every screen with an action.
 */
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { colors, opacity, radius, sizes, spacing, typography } from '@/theme';

export type ButtonVariant = 'primary' | 'secondary' | 'text' | 'dangerText';

export interface ButtonProps {
  /** The visible label. Also the accessible name unless `accessibilityLabel` is set. */
  label: string;

  onPress: () => void;

  variant?: ButtonVariant;

  /** Greys the button out and blocks presses. */
  disabled?: boolean;

  /** Shows a spinner in place of the label and blocks presses. */
  loading?: boolean;

  /** Stretches to fill its container. Filled buttons usually want this. */
  fullWidth?: boolean;

  /**
   * Overrides the accessible name. Use when the visible label is too terse to
   * stand alone out of context — "Remove" becoming "Remove Netflix subscription".
   */
  accessibilityLabel?: string;

  /** Explains the consequence of the action when it is not obvious from the label. */
  accessibilityHint?: string;

  style?: StyleProp<ViewStyle>;

  testID?: string;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  fullWidth = false,
  accessibilityLabel,
  accessibilityHint,
  style,
  testID,
}: ButtonProps) {
  // One flag for both reasons a button cannot be pressed, so the visual state
  // and the accessibility state can never disagree with the press handler.
  const isInactive = disabled || loading;

  const isFilled = variant === 'primary';
  const isOutlined = variant === 'secondary';
  const isTextOnly = variant === 'text' || variant === 'dangerText';

  const labelColor =
    variant === 'primary'
      ? colors.surface
      : variant === 'secondary'
        ? colors.ink
        : variant === 'dangerText'
          ? colors.danger
          : colors.accent;

  return (
    <Pressable
      onPress={onPress}
      disabled={isInactive}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      // Screen readers announce "dimmed"/"disabled" from this, which is why it
      // tracks `isInactive` rather than only `disabled`.
      accessibilityState={{ disabled: isInactive, busy: loading }}
      style={({ pressed }) => [
        styles.base,
        isFilled && styles.filled,
        isOutlined && styles.outlined,
        isTextOnly && styles.textOnly,
        fullWidth && styles.fullWidth,
        pressed && !isInactive && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
      testID={testID}
    >
      {loading ? (
        // The spinner replaces the label rather than sitting beside it, so the
        // button does not change width mid-submission.
        <ActivityIndicator
          color={labelColor}
          accessibilityLabel="Loading"
          testID={testID ? `${testID}-spinner` : undefined}
        />
      ) : (
        <View style={styles.labelRow}>
          <Text
            style={[styles.label, { color: labelColor }]}
            numberOfLines={1}
            // Lets the label grow with the OS font setting, capped so a very
            // large setting does not burst a fixed-height button.
            maxFontSizeMultiplier={1.3}
          >
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: sizes.minTouch,
    height: sizes.control,
    borderRadius: radius.control,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  filled: {
    backgroundColor: colors.accent,
  },
  outlined: {
    borderWidth: 1,
    borderColor: colors.control,
    backgroundColor: 'transparent',
  },
  textOnly: {
    // A text button is a link: no background, no border, and no fixed height
    // padding that would make it look like a box.
    height: sizes.minTouch,
    paddingHorizontal: spacing.sm,
  },
  fullWidth: {
    alignSelf: 'stretch',
  },
  pressed: {
    opacity: opacity.pressed,
  },
  disabled: {
    opacity: opacity.disabled,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  label: {
    ...typography.button,
    textAlign: 'center',
  },
});
