/**
 * Button — every tappable action in the app (handoff 02 §1).
 *
 * What it is for
 *   The five treatments the design uses, behind one component:
 *     primary             accent fill       the single main action on a screen
 *     secondary           outlined surface  an alternative action ("Cancel")
 *     destructiveOutline  danger outline    the TRIGGER of a destructive flow
 *     destructive         danger fill       the CONFIRM inside the sheet
 *     ghost               accent label only an inline action ("Forgot password?")
 *
 * Why destructive comes in two forms
 *   02 §1 splits them by position in the flow. `destructiveOutline` is what the
 *   user taps first — Detail "Delete Subscription", Family "Remove {name} from
 *   Family" — and solid `destructive` is reserved for the final button inside
 *   the confirm sheet, so a filled red button always means "this happens now".
 *
 *   The outline variant stays transparent rather than taking a `danger` tint.
 *   The prototype's Remove button tinted it and its label measured 4.29:1, an
 *   AA failure at 14px; on `surface` the same label is 5.39:1 (CONTRAST.md).
 *
 * Why secondary and disabled look nothing alike
 *   In the prototype the Edit screen's "Cancel" read as disabled because both
 *   were flat grey. Here secondary keeps a visible `borderControl` outline and
 *   full-strength text; disabled loses the border, fills `surface2` and mutes
 *   the label. A test asserts the two never share a fill, border or label colour.
 *
 *   Disabled `textMuted` on `surface2` is 4.28:1 — below AA, and allowed only
 *   because WCAG exempts inactive controls (CONTRAST.md).
 *
 * Why `loading` disables the button
 *   A form that stays tappable while submitting gets double-submitted, which on
 *   a create endpoint means two subscriptions. The Idempotency-Key in client.ts
 *   is the second line of defence; this is the first.
 *
 * Motion (02 §15)
 *   Press: scale 0.98 and the fill darkens, 100ms ease-out. Under reduced motion
 *   the fill still changes but nothing scales (`useMotion`).
 *
 * Design tokens
 *   height         sizes.button (48), floor sizes.minTouch (44)
 *   radius         radius.button (6)
 *   padding        spacing.lg (16)
 *   label          typography.bodyLg — SemiBold on secondary and ghost, Bold on
 *                  the rest (02 §1)
 *   secondary edge colors.borderControl, not `border` (1.51:1 fails 1.4.11)
 *   outline edge   colors.danger
 *
 * Used by: every screen with an action.
 */
import { useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  Text,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import {
  fontFamily,
  makeStyles,
  radius,
  sizes,
  spacing,
  useMotion,
  useTheme,
} from '@/theme';

export type ButtonVariant =
  'primary' | 'secondary' | 'destructiveOutline' | 'destructive' | 'ghost';

export interface ButtonProps {
  /** The visible label. Also the accessible name unless `accessibilityLabel` is set. */
  label: string;

  onPress: () => void;

  variant?: ButtonVariant;

  /** Mutes the button and blocks presses. */
  disabled?: boolean;

  /** Shows a spinner in place of the label and blocks presses. */
  loading?: boolean;

  /**
   * What a screen reader hears while `loading` — the action in progress, such
   * as "Saving". Defaults to the label, never just "Loading".
   */
  loadingLabel?: string;

  /** Stretches to fill its container. Filled buttons usually want this. */
  fullWidth?: boolean;

  /**
   * Overrides the accessible name. Use when the visible label is too terse to
   * stand alone out of context — "Delete" becoming "Delete Netflix subscription".
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
  loadingLabel,
  fullWidth = false,
  accessibilityLabel,
  accessibilityHint,
  style,
  testID,
}: ButtonProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const m = useMotion();
  const scale = useState(() => new Animated.Value(1))[0];

  // One flag for both reasons a button cannot be pressed, so the visual state
  // and the accessibility state can never disagree with the press handler.
  const isInactive = disabled || loading;

  const animateTo = (toValue: number) => {
    if (!m.moves) return;
    Animated.timing(scale, {
      toValue,
      duration: m.press,
      easing: m.easeOut,
      useNativeDriver: true,
    }).start();
  };

  const labelColor = disabled
    ? colors.textMuted
    : variant === 'primary' || variant === 'destructive'
      ? colors.onAccent
      : variant === 'destructiveOutline'
        ? colors.danger
        : variant === 'ghost'
          ? colors.accent
          : colors.text;

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => animateTo(m.pressScale)}
      onPressOut={() => animateTo(1)}
      disabled={isInactive}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      // Screen readers announce "dimmed"/"disabled" from this, which is why it
      // tracks `isInactive` rather than only `disabled`.
      accessibilityState={{ disabled: isInactive, busy: loading }}
      style={[styles.hitArea, fullWidth && styles.fullWidth, style]}
      testID={testID}
    >
      {({ pressed }) => (
        <Animated.View
          testID={testID ? `${testID}-surface` : undefined}
          style={[
            styles.surface,
            disabled ? styles.disabled : styles[variant],
            pressed && !isInactive && styles[`${variant}Pressed`],
            { transform: [{ scale }] },
          ]}
        >
          {loading ? (
            // The spinner replaces the label rather than sitting beside it, so
            // the button does not change width mid-submission.
            <ActivityIndicator
              color={labelColor}
              accessibilityLabel={loadingLabel ?? label}
              testID={testID ? `${testID}-spinner` : undefined}
            />
          ) : (
            <Text
              style={[
                styles.label,
                variant === 'secondary' || variant === 'ghost'
                  ? styles.labelSemiBold
                  : styles.labelBold,
                { color: labelColor },
              ]}
              numberOfLines={1}
              // Grows with the OS font setting, capped so a very large setting
              // does not burst a fixed-height button.
              maxFontSizeMultiplier={1.3}
            >
              {label}
            </Text>
          )}
        </Animated.View>
      )}
    </Pressable>
  );
}

const useStyles = makeStyles(({ colors, typography }) => ({
  hitArea: {
    minHeight: sizes.minTouch,
    height: sizes.button,
  },
  fullWidth: {
    alignSelf: 'stretch',
  },
  surface: {
    flex: 1,
    borderRadius: radius.button,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  primary: { backgroundColor: colors.accent },
  primaryPressed: { backgroundColor: colors.accentPressed },
  destructive: { backgroundColor: colors.danger },
  destructivePressed: { backgroundColor: colors.dangerPressed },
  secondary: {
    backgroundColor: colors.surface,
    borderWidth: sizes.hairline,
    borderColor: colors.borderControl,
  },
  secondaryPressed: { backgroundColor: colors.surface2 },
  destructiveOutline: {
    backgroundColor: 'transparent',
    borderWidth: sizes.hairline,
    borderColor: colors.danger,
  },
  // No `danger` tint on press either: the fill the prototype used is what made
  // the label fail AA. The pressed state borrows the neutral `surface2`.
  destructiveOutlinePressed: { backgroundColor: colors.surface2 },
  ghost: { backgroundColor: 'transparent' },
  ghostPressed: { backgroundColor: colors.surface2 },
  disabled: { backgroundColor: colors.surface2 },
  label: {
    ...typography.bodyLg,
    textAlign: 'center',
  },
  labelBold: { fontFamily: fontFamily.bodyBold },
  labelSemiBold: { fontFamily: fontFamily.bodySemiBold },
}));
