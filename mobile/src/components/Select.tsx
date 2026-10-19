/**
 * Select — a labelled field that opens a list of choices (handoff 02 §5).
 *
 * What it is for
 *   The category picker on the subscription form, the billing-cycle fallback,
 *   and any field whose value is chosen from a list rather than typed.
 *
 * Closed, it is a TextField
 *   It draws the same `FieldBox` as TextField, with a trailing 16px chevron, so
 *   every input on a form looks like one family.
 *
 * Open, it is a bottom sheet
 *   Not an inline dropdown: on a phone a dropdown fights the keyboard and the
 *   screen edge. The sheet lists the options; the chosen one carries an 18px
 *   accent check. `renderOption` lets a caller draw richer rows — the category
 *   field uses it to show a CategoryBadge.
 *
 * Why the trigger has role "combobox"
 *   It is a control whose value is picked from a set. A screen reader announces
 *   it with its current value, which a plain button would not.
 *
 * Design tokens
 *   trigger   FieldBox — sizes.field (52), radius.card, colors.borderControl
 *   chevron   sizes.iconSmall (16), colors.textMuted
 *   check     sizes.iconCheck (18), colors.accent
 *   rows      sizes.minTouch tall, typography.bodyLg
 */
import { Check, ChevronDown } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { makeStyles, sizes, spacing, useTheme } from '@/theme';

import { BottomSheet } from './BottomSheet';
import { FieldBox, FieldMessage } from './TextField';

export interface SelectOption<T extends string> {
  value: T;
  label: string;
}

export interface SelectProps<T extends string> {
  label: string;
  options: readonly SelectOption<T>[];

  /** Null shows the placeholder — used for an optional field such as category. */
  value: T | null;
  onChange: (next: T) => void;

  /** Shown when nothing is chosen. */
  placeholder?: string;

  /** Draws an option's content. Defaults to its label as text. */
  renderOption?: (option: SelectOption<T>) => ReactNode;

  helper?: string;
  error?: string;
  disabled?: boolean;
  testID?: string;
}

export function Select<T extends string>({
  label,
  options,
  value,
  onChange,
  placeholder = 'Select',
  renderOption,
  helper,
  error,
  disabled = false,
  testID,
}: SelectProps<T>) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);

  const selected = options.find((option) => option.value === value);

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>

      <Pressable
        onPress={() => setOpen(true)}
        disabled={disabled}
        accessibilityRole="combobox"
        accessibilityLabel={label}
        // Announces the current choice, which is the whole point of the control.
        accessibilityValue={{ text: selected?.label ?? 'None selected' }}
        accessibilityState={{ disabled, expanded: open }}
        accessibilityHint={error ?? helper}
        testID={testID}
      >
        <FieldBox
          focused={open}
          error={Boolean(error)}
          disabled={disabled}
          testID={testID ? `${testID}-box` : undefined}
        >
          <View style={styles.value}>
            {selected ? (
              renderOption ? (
                renderOption(selected)
              ) : (
                <Text style={styles.valueText} numberOfLines={1}>
                  {selected.label}
                </Text>
              )
            ) : (
              <Text style={[styles.valueText, styles.placeholder]} numberOfLines={1}>
                {placeholder}
              </Text>
            )}
          </View>
          <ChevronDown
            size={sizes.iconSmall}
            color={colors.textMuted}
            strokeWidth={2}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          />
        </FieldBox>
      </Pressable>

      <FieldMessage error={error} helper={helper} testID={testID} />

      <BottomSheet
        visible={open}
        onClose={() => setOpen(false)}
        title={label}
        testID={testID ? `${testID}-sheet` : undefined}
      >
        <ScrollView style={styles.list} accessibilityRole="list">
          {options.map((option) => {
            const isSelected = option.value === value;
            return (
              <Pressable
                key={option.value}
                onPress={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                accessibilityRole="button"
                accessibilityLabel={option.label}
                accessibilityState={{ selected: isSelected }}
                style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}
                testID={testID ? `${testID}-option-${option.value}` : undefined}
              >
                <View style={styles.optionContent}>
                  {renderOption ? (
                    renderOption(option)
                  ) : (
                    <Text style={styles.valueText}>{option.label}</Text>
                  )}
                </View>
                {isSelected ? (
                  <Check
                    size={sizes.iconCheck}
                    color={colors.accent}
                    strokeWidth={2}
                    accessibilityElementsHidden
                    importantForAccessibility="no-hide-descendants"
                  />
                ) : null}
              </Pressable>
            );
          })}
        </ScrollView>
      </BottomSheet>
    </View>
  );
}

const useStyles = makeStyles(({ colors, typography }) => ({
  container: {
    gap: spacing.sm,
  },
  label: {
    ...typography.labelSemibold,
  },
  value: {
    flex: 1,
  },
  valueText: {
    ...typography.bodyLg,
  },
  placeholder: {
    color: colors.textMuted,
  },
  list: {
    // Long lists scroll inside the sheet rather than pushing it off screen.
    maxHeight: sizes.rowSubscription * 6,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: sizes.minTouch,
    paddingVertical: spacing.sm,
    gap: spacing.md,
    borderBottomWidth: sizes.hairline,
    borderBottomColor: colors.border,
  },
  optionPressed: {
    backgroundColor: colors.surface2,
  },
  optionContent: {
    flex: 1,
  },
}));
