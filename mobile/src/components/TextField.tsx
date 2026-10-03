/**
 * TextField — a labelled text input.
 *
 * What it is for
 *   Every text entry in the app: email, password, subscription name, price,
 *   search. Carries the label, the helper text, the error state and the
 *   show/hide toggle for passwords.
 *
 * Why the label is always visible
 *   A placeholder is not a label. It disappears the moment the user types, so
 *   anyone who is interrupted loses the only clue about what the field wants,
 *   and most screen readers do not announce it reliably. Section 10 of the
 *   prompt requires a visible label AND an accessible one on every input, so
 *   this component makes it impossible to build a field without both.
 *
 * Why errors use words and an icon, never colour alone
 *   Red-only error states are invisible to a colour-blind user. An errored
 *   field here changes its border, adds a tinted background, and shows the
 *   message as text that screen readers announce.
 *
 * Design tokens
 *   height         sizes.control (52)
 *   radius         radius.control (12)
 *   border         colors.control, colors.danger when errored
 *   background     colors.surface, colors.dangerBg when errored
 *   label          typography.fieldLabel
 *   helper/error   typography.caption; error in colors.danger
 *
 * Used by: Sign up, Log in, Forgot/Reset password, Add/Edit subscription,
 *          Subscriptions search, Profile.
 */
import { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

import { colors, radius, sizes, spacing, typography } from '@/theme';

export interface TextFieldProps {
  /** The visible label above the field. Also the accessible name. */
  label: string;

  value: string;
  onChangeText: (next: string) => void;

  /** Hint text inside the empty field. Never the only description of the field. */
  placeholder?: string;

  /**
   * Guidance shown under the field, such as the password rules. Hidden while an
   * error is showing, because two lines of competing advice help nobody.
   */
  helper?: string;

  /**
   * Validation message. Its presence puts the field into the error state, so a
   * caller never has to set both `error` and some separate flag.
   */
  error?: string;

  /** Masks input and shows a Show/Hide toggle. */
  secureTextEntry?: boolean;

  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: TextInputProps['autoCapitalize'];
  autoComplete?: TextInputProps['autoComplete'];
  textContentType?: TextInputProps['textContentType'];
  returnKeyType?: TextInputProps['returnKeyType'];
  onSubmitEditing?: () => void;

  editable?: boolean;
  multiline?: boolean;

  /** Rendered inside the field on the left, such as a currency symbol or a search icon. */
  prefix?: string;

  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  helper,
  error,
  secureTextEntry = false,
  keyboardType,
  autoCapitalize = 'none',
  autoComplete,
  textContentType,
  returnKeyType,
  onSubmitEditing,
  editable = true,
  multiline = false,
  prefix,
  style,
  testID,
}: TextFieldProps) {
  // Local, because whether the password is visible is this field's business and
  // nothing above it needs to know.
  const [revealed, setRevealed] = useState(false);

  const hasError = Boolean(error);
  const isMasked = secureTextEntry && !revealed;

  return (
    <View style={[styles.container, style]}>
      <Text style={styles.label} nativeID={`${testID ?? label}-label`}>
        {label}
      </Text>

      <View
        style={[
          styles.field,
          hasError && styles.fieldError,
          !editable && styles.fieldDisabled,
          multiline && styles.fieldMultiline,
        ]}
      >
        {prefix ? <Text style={styles.prefix}>{prefix}</Text> : null}

        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.ink3}
          secureTextEntry={isMasked}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          autoComplete={autoComplete}
          textContentType={textContentType}
          returnKeyType={returnKeyType}
          onSubmitEditing={onSubmitEditing}
          editable={editable}
          multiline={multiline}
          style={styles.input}
          // The accessible name matches the visible label, so a screen-reader
          // user and a sighted user are told the same thing.
          accessibilityLabel={label}
          // Announces the helper OR the error, matching what is on screen.
          accessibilityHint={error ?? helper}
          accessibilityState={{ disabled: !editable }}
          testID={testID}
        />

        {secureTextEntry ? (
          <Pressable
            onPress={() => setRevealed((previous) => !previous)}
            style={styles.reveal}
            accessibilityRole="button"
            // Says what tapping will DO, not what the current state is —
            // the convention screen-reader users expect from a toggle button.
            accessibilityLabel={revealed ? 'Hide password' : 'Show password'}
            testID={testID ? `${testID}-reveal` : undefined}
          >
            <Text style={styles.revealLabel}>{revealed ? 'Hide' : 'Show'}</Text>
          </Pressable>
        ) : null}
      </View>

      {/*
        Error wins over helper: while something is wrong, the fix is the only
        thing worth saying. `accessibilityLiveRegion` makes Android announce a
        newly appeared error without the user having to hunt for it.
      */}
      {hasError ? (
        <Text
          style={styles.error}
          accessibilityLiveRegion="polite"
          testID={testID ? `${testID}-error` : undefined}
        >
          {error}
        </Text>
      ) : helper ? (
        <Text style={styles.helper}>{helper}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  label: {
    ...typography.fieldLabel,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: sizes.minTouch,
    height: sizes.control,
    borderWidth: 1,
    borderColor: colors.control,
    borderRadius: radius.control,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  fieldError: {
    borderColor: colors.danger,
    backgroundColor: colors.dangerBg,
  },
  fieldDisabled: {
    backgroundColor: colors.sunken,
  },
  fieldMultiline: {
    height: undefined,
    minHeight: sizes.control * 2,
    alignItems: 'flex-start',
    paddingVertical: spacing.md,
  },
  prefix: {
    ...typography.body,
    color: colors.ink2,
  },
  input: {
    flex: 1,
    ...typography.body,
    color: colors.ink,
    // Removes Android's default internal padding, which otherwise pushes text
    // off-centre inside a fixed-height field.
    paddingVertical: 0,
  },
  reveal: {
    minHeight: sizes.minTouch,
    minWidth: sizes.minTouch,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  revealLabel: {
    ...typography.caption,
    color: colors.accent,
  },
  helper: {
    ...typography.caption,
  },
  error: {
    ...typography.caption,
    color: colors.danger,
  },
});
