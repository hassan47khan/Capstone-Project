/**
 * Select — a labelled field that opens a list of choices.
 *
 * What it is for
 *   The category picker on the subscription form, and any field whose value is
 *   chosen from a list rather than typed.
 *
 * Why it opens a sheet instead of using a native picker
 *   React Native's `Picker` looks and behaves differently on each platform and
 *   cannot be styled to match this design. A modal list reuses `GroupedList` and
 *   `ListRow`, so a choice looks like every other list in the app, and the
 *   search and empty states come for free when a list gets long.
 *
 * Why the trigger has role "combobox"
 *   It is a control whose value is picked from a set. A screen reader announces
 *   it with its current value, which a plain button would not.
 *
 * Design tokens
 *   trigger   same as TextField: sizes.control, radius.control, colors.control
 *   label     typography.fieldLabel
 *   value     typography.body in colors.ink; placeholder in colors.ink3
 *
 * Used by: Add/Edit subscription (category), and any future single-choice field.
 */
import { Check, ChevronDown } from 'lucide-react-native';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors, radius, sizes, spacing, typography } from '@/theme';

import { Button } from './Button';
import { GroupedList } from './GroupedList';
import { ListRow } from './ListRow';

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
  error,
  disabled = false,
  testID,
}: SelectProps<T>) {
  const [open, setOpen] = useState(false);

  const selected = options.find((option) => option.value === value);
  const displayText = selected?.label ?? placeholder;

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
        style={[
          styles.trigger,
          Boolean(error) && styles.triggerError,
          disabled && styles.triggerDisabled,
        ]}
        testID={testID}
      >
        <Text style={[styles.value, !selected && styles.placeholder]} numberOfLines={1}>
          {displayText}
        </Text>
        <ChevronDown
          size={20}
          color={colors.ink2}
          strokeWidth={1.7}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
      </Pressable>

      {error ? (
        <Text style={styles.error} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}

      <Modal
        visible={open}
        animationType="slide"
        presentationStyle="pageSheet"
        // Android's hardware back must close the sheet, not the screen beneath.
        onRequestClose={() => setOpen(false)}
      >
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle} accessibilityRole="header">
              {label}
            </Text>
            <Button label="Cancel" variant="text" onPress={() => setOpen(false)} />
          </View>

          <ScrollView contentContainerStyle={styles.sheetBody}>
            <GroupedList>
              {options.map((option) => (
                <ListRow
                  key={option.value}
                  title={option.label}
                  selected={option.value === value}
                  onPress={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  accessibilityLabel={option.label}
                  trailing={
                    option.value === value ? (
                      <Check size={20} color={colors.accent} strokeWidth={2} />
                    ) : null
                  }
                  testID={testID ? `${testID}-option-${option.value}` : undefined}
                />
              ))}
            </GroupedList>
          </ScrollView>
        </View>
      </Modal>
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
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: sizes.minTouch,
    height: sizes.control,
    borderWidth: 1,
    borderColor: colors.control,
    borderRadius: radius.control,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  triggerError: {
    borderColor: colors.danger,
    backgroundColor: colors.dangerBg,
  },
  triggerDisabled: {
    backgroundColor: colors.sunken,
  },
  value: {
    ...typography.body,
    color: colors.ink,
    flex: 1,
  },
  placeholder: {
    color: colors.ink3,
  },
  error: {
    ...typography.caption,
    color: colors.danger,
  },
  sheet: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
  },
  sheetTitle: {
    ...typography.authTitle,
  },
  sheetBody: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxl,
  },
});
