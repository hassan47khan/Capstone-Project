/**
 * TextField — a labelled text input (handoff 02 §2).
 *
 * What it is for
 *   Every text entry in the app: email, password, subscription name, search.
 *   Carries the label, the helper/error slot and the show/hide toggle for
 *   passwords. CurrencyField, DateField and Select are built on its field box so
 *   all inputs share one look.
 *
 * Why the label is always visible
 *   A placeholder is not a label. It disappears the moment the user types, so
 *   anyone who is interrupted loses the only clue about what the field wants,
 *   and most screen readers do not announce it reliably.
 *
 * States (02 §2)
 *   default   1px borderControl
 *   focused   2px accent — drawn inset: padding shrinks by the extra pixel so
 *             the text does not move
 *   error     2px danger, plus the message as text below
 *   disabled  surface2 fill, textMuted text
 *
 * Why the message slot is always there
 *   Helper and error share one slot, and the slot keeps its height even when
 *   empty, so a form does not jump when an error appears.
 *
 * Deviation from 02: the default border is `borderControl`, not `border` —
 * `border` is 1.51:1 on white and a field's edge must reach 3:1 (WCAG 1.4.11).
 *
 * Design tokens
 *   height         sizes.field (52)
 *   radius         radius.card (6)
 *   padding        spacing.lg (16)
 *   input text     typography.bodyLg (15)
 *   label          typography.labelSemibold, spacing.sm above the field
 *   helper/error   typography.caption; error in colors.danger
 *
 * Used by: every form.
 */
import { useState, type ReactNode } from 'react';
import {
  Pressable,
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

import { makeStyles, radius, sizes, spacing, useTheme } from '@/theme';

export interface TextFieldProps {
  /** The visible label above the field. Also the accessible name. */
  label: string;

  value: string;
  onChangeText: (next: string) => void;

  /** Hint text inside the empty field. Never the only description of the field. */
  placeholder?: string;

  /** Guidance under the field. Replaced by `error` while one is showing. */
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
  onBlur?: () => void;

  editable?: boolean;
  multiline?: boolean;

  /** Rendered inside the field on the left, such as a currency symbol. */
  prefix?: string;

  /** Rendered inside the field on the right, such as a chevron or an icon. */
  trailing?: ReactNode;

  /** Text alignment of the value. CurrencyField right-aligns. */
  textAlign?: 'left' | 'right';

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
  onBlur,
  editable = true,
  multiline = false,
  prefix,
  trailing,
  textAlign = 'left',
  style,
  testID,
}: TextFieldProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  // Local, because whether the password is visible is this field's business and
  // nothing above it needs to know.
  const [revealed, setRevealed] = useState(false);
  const [focused, setFocused] = useState(false);

  const hasError = Boolean(error);
  const isMasked = secureTextEntry && !revealed;
  const labelId = `${testID ?? label}-label`;

  return (
    <View style={[styles.container, style]}>
      <Text style={styles.label} nativeID={labelId}>
        {label}
      </Text>

      <FieldBox
        focused={focused}
        error={hasError}
        disabled={!editable}
        multiline={multiline}
        testID={testID ? `${testID}-box` : undefined}
      >
        {prefix ? <Text style={styles.prefix}>{prefix}</Text> : null}

        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          secureTextEntry={isMasked}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          autoComplete={autoComplete}
          textContentType={textContentType}
          returnKeyType={returnKeyType}
          onSubmitEditing={onSubmitEditing}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            onBlur?.();
          }}
          editable={editable}
          multiline={multiline}
          style={[styles.input, !editable && styles.inputDisabled, { textAlign }]}
          // The accessible name matches the visible label, so a screen-reader
          // user and a sighted user are told the same thing.
          accessibilityLabel={label}
          accessibilityLabelledBy={labelId}
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

        {trailing}
      </FieldBox>

      <FieldMessage error={error} helper={helper} testID={testID} />
    </View>
  );
}

export interface FieldBoxProps {
  children: ReactNode;
  focused?: boolean;
  error?: boolean;
  disabled?: boolean;
  multiline?: boolean;
  testID?: string;
}

/**
 * The bordered box every input draws. Exported so Select and DateField look
 * identical to a TextField without re-implementing the states.
 */
export function FieldBox({
  children,
  focused = false,
  error = false,
  disabled = false,
  multiline = false,
  testID,
}: FieldBoxProps) {
  const styles = useStyles();
  // Error outranks focus: while something is wrong, that is what to show.
  const thick = error || focused;
  return (
    <View
      testID={testID}
      style={[
        styles.field,
        thick && styles.fieldThick,
        focused && styles.fieldFocused,
        error && styles.fieldError,
        disabled && styles.fieldDisabled,
        multiline && styles.fieldMultiline,
      ]}
    >
      {children}
    </View>
  );
}

/**
 * The helper/error slot under a field. Always rendered, so its height is
 * reserved and the form never jumps when an error appears.
 */
export function FieldMessage({
  error,
  helper,
  testID,
}: {
  error?: string;
  helper?: string;
  testID?: string;
}) {
  const styles = useStyles();
  if (error) {
    return (
      <Text
        style={styles.error}
        // Makes Android announce a newly appeared error without a hunt for it.
        accessibilityLiveRegion="polite"
        testID={testID ? `${testID}-error` : undefined}
      >
        {error}
      </Text>
    );
  }
  return (
    <Text
      style={styles.helper}
      // An empty slot holds its height with a space, and is not announced.
      accessibilityElementsHidden={!helper}
      importantForAccessibility={helper ? 'auto' : 'no-hide-descendants'}
      testID={testID ? `${testID}-message` : undefined}
    >
      {helper ?? ' '}
    </Text>
  );
}

const useStyles = makeStyles(({ colors, typography }) => ({
  container: {
    gap: spacing.sm,
  },
  label: {
    ...typography.labelSemibold,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: sizes.minTouch,
    height: sizes.field,
    borderWidth: sizes.hairline,
    borderColor: colors.borderControl,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  // A 2px border drawn inside the same box: the padding gives back the extra
  // pixel, so the contents stay exactly where they were.
  fieldThick: {
    borderWidth: sizes.borderFocus,
    paddingHorizontal: spacing.lg - (sizes.borderFocus - sizes.hairline),
  },
  fieldFocused: {
    borderColor: colors.accent,
  },
  fieldError: {
    borderColor: colors.danger,
  },
  fieldDisabled: {
    backgroundColor: colors.surface2,
  },
  fieldMultiline: {
    height: undefined,
    minHeight: sizes.field * 2,
    alignItems: 'flex-start',
    paddingVertical: spacing.md,
  },
  prefix: {
    ...typography.bodyLg,
    color: colors.textMuted,
  },
  input: {
    flex: 1,
    ...typography.bodyLg,
    // Removes Android's default internal padding, which otherwise pushes text
    // off-centre inside a fixed-height field.
    paddingVertical: 0,
  },
  inputDisabled: {
    color: colors.textMuted,
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
}));
