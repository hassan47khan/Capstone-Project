/**
 * DateField — a date input that opens the native picker (handoff 02 §6).
 *
 * What it is for
 *   Start date and next bill date on Add and Edit subscription.
 *
 * How it behaves
 *   It looks like a TextField with a trailing 16px calendar icon. Tapping
 *   anywhere in it opens the platform's own date picker
 *   (@react-native-community/datetimepicker).
 *
 * Dates are calendar dates, not instants
 *   Values are "YYYY-MM-DD" strings, never Date objects in state. A Date is
 *   built from local parts only for the picker and read back the same way, so a
 *   user west of Greenwich never sees the day shift (the spec's off-by-one).
 *
 * Display format
 *   02 says to follow the user's `date_format` setting (09 §1). That field does
 *   not exist in the API yet, so the default is the app's long style
 *   ("Oct 12, 2026") and a caller can pass `format`. TODO(09): read the setting.
 *
 * Design tokens
 *   box   FieldBox (identical to TextField)
 *   icon  sizes.iconSmall (16), colors.textMuted
 */
import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { Calendar } from 'lucide-react-native';
import { useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';

import { formatDateLong } from '@/api/format';
import { makeStyles, sizes, spacing, useTheme } from '@/theme';

import { FieldBox, FieldMessage } from './TextField';

/** "YYYY-MM-DD" → a local Date at midnight. */
function toLocalDate(value: string): Date {
  const [y, m, d] = value.split('-').map((part) => parseInt(part, 10));
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

/** A local Date → "YYYY-MM-DD", from its local parts. */
export function toDateOnly(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export interface DateFieldProps {
  label: string;
  /** "YYYY-MM-DD", or null when unset. */
  value: string | null;
  onChange: (next: string) => void;
  placeholder?: string;
  /** Display formatter. Defaults to "Oct 12, 2026". */
  format?: (value: string) => string;
  helper?: string;
  error?: string;
  disabled?: boolean;
  testID?: string;
}

export function DateField({
  label,
  value,
  onChange,
  placeholder = 'Select a date',
  format = formatDateLong,
  helper,
  error,
  disabled = false,
  testID,
}: DateFieldProps) {
  const styles = useStyles();
  const { colors, scheme } = useTheme();
  const [open, setOpen] = useState(false);

  const shown = value ? format(value) : null;

  const handleChange = (event: DateTimePickerEvent, date?: Date) => {
    // Android's picker is a dialog that closes itself; iOS's inline one stays.
    if (Platform.OS === 'android') setOpen(false);
    if (event.type === 'set' && date) onChange(toDateOnly(date));
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>

      <Pressable
        onPress={() => setOpen((previous) => !previous)}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityValue={{ text: shown ?? 'Not set' }}
        accessibilityHint={error ?? helper ?? 'Opens a date picker'}
        accessibilityState={{ disabled, expanded: open }}
        testID={testID}
      >
        <FieldBox
          focused={open}
          error={Boolean(error)}
          disabled={disabled}
          testID={testID ? `${testID}-box` : undefined}
        >
          <Text style={[styles.value, !shown && styles.placeholder]} numberOfLines={1}>
            {shown ?? placeholder}
          </Text>
          <Calendar
            size={sizes.iconSmall}
            color={colors.textMuted}
            strokeWidth={2}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          />
        </FieldBox>
      </Pressable>

      {open ? (
        <DateTimePicker
          value={value ? toLocalDate(value) : new Date()}
          mode="date"
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          themeVariant={scheme}
          accentColor={colors.accent}
          onChange={handleChange}
          testID={testID ? `${testID}-picker` : undefined}
        />
      ) : null}

      <FieldMessage error={error} helper={helper} testID={testID} />
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
    ...typography.bodyLg,
    flex: 1,
  },
  placeholder: {
    color: colors.textMuted,
  },
}));
