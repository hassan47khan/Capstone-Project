/**
 * The fields of the Add / Edit subscription form (07 §2). Shared by both
 * screens; it only draws fields and reports changes. Saving lives in the screen.
 *
 * Order follows 07 §11's focus order: name → price → currency → category →
 * cycle → custom fields (if shown) → start date → notes → paid with.
 */
import { History } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';

import { currencySymbol } from '@/api/format';
import {
  BillingCycleField,
  CategoryBadge,
  CurrencyField,
  DateField,
  normalizePriceInput,
  Select,
  Stepper,
  TextField,
} from '@/components';
import {
  CATEGORY_LABELS,
  CATEGORY_SLUGS,
  makeStyles,
  sizes,
  spacing,
  useTheme,
  type Category,
} from '@/theme';

import type { CustomCycleUnit } from './api';
import { LIMITS, type FormErrors, type FormField, type FormValues } from './formRules';

// Billing currencies offered. A subscription is billed in one of these; the
// display currency (Settings) is separate. TODO(contract): no /currencies yet.
const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF', 'INR'] as const;
const CURRENCY_OPTIONS = CURRENCIES.map((code) => ({
  value: code,
  label: `${code} (${currencySymbol(code)})`,
}));

const CATEGORY_OPTIONS = CATEGORY_SLUGS.map((slug) => ({
  value: slug,
  label: CATEGORY_LABELS[slug],
}));

// Extra touch area on each side of the History link, so it reaches 44pt.
export const HISTORY_HIT_SLOP = (sizes.minTouch - sizes.iconSmall) / 2;

const UNIT_OPTIONS: { value: CustomCycleUnit; label: string }[] = [
  { value: 'days', label: 'days' },
  { value: 'weeks', label: 'weeks' },
  { value: 'months', label: 'months' },
  { value: 'years', label: 'years' },
];

export interface SubscriptionFormProps {
  values: FormValues;
  /** The errors to show right now (the screen decides when). */
  errors: FormErrors;
  /** Called with just the fields that changed. */
  onChange: (patch: Partial<FormValues>) => void;
  /** Called when a field loses focus, so its error can appear (07 §3). */
  onBlur: (field: FormField) => void;
  /** True while saving: fields can't be edited. */
  disabled?: boolean;
  /** Edit only: shows a "History" link above the name (07 §5). */
  onHistory?: () => void;
}

export function SubscriptionForm({
  values,
  errors,
  onChange,
  onBlur,
  disabled = false,
  onHistory,
}: SubscriptionFormProps) {
  const styles = useStyles();
  const { colors } = useTheme();

  return (
    <View style={styles.form}>
      {/* Edit's "History" link, right-aligned above the name (07 §5). */}
      {onHistory ? (
        <Pressable
          onPress={onHistory}
          disabled={disabled}
          accessibilityRole="link"
          accessibilityLabel="Edit history"
          // Grow the touch area to the 44pt minimum around the 16pt icon.
          hitSlop={HISTORY_HIT_SLOP}
          style={styles.historyLink}
          testID="form-history"
        >
          <History size={sizes.iconSmall} color={colors.accent} />
          <Text style={styles.historyText}>History</Text>
        </Pressable>
      ) : null}

      <TextField
        label="Subscription name"
        value={values.name}
        // 07 §8: cap at 60 characters.
        onChangeText={(name) => onChange({ name: name.slice(0, LIMITS.name) })}
        onBlur={() => onBlur('name')}
        placeholder="e.g. Netflix, Spotify…"
        error={errors.name}
        editable={!disabled}
        autoCapitalize="words"
        testID="form-name"
      />

      <CurrencyField
        value={values.price}
        onChangeValue={(price) => onChange({ price })}
        onBlur={() => onBlur('price')}
        currency={values.currency}
        error={errors.price}
        editable={!disabled}
        testID="form-price"
      />

      <Select
        label="Billing currency"
        options={CURRENCY_OPTIONS}
        value={values.currency}
        // Re-fit the typed price to the new currency's decimals (JPY has none).
        onChange={(currency) =>
          onChange({ currency, price: normalizePriceInput(values.price, currency) })
        }
        disabled={disabled}
        testID="form-currency"
      />

      <Select<Category>
        label="Category"
        options={CATEGORY_OPTIONS}
        value={values.category}
        onChange={(category) => {
          onChange({ category });
          onBlur('category');
        }}
        placeholder="Select category"
        // The name in normal text with a coloured dot, not coloured text (07 §2).
        renderOption={(option) => <CategoryBadge category={option.value} />}
        error={errors.category}
        disabled={disabled}
        testID="form-category"
      />

      {/* The cycle controls have no disabled prop, so lock touches here while saving. */}
      <View
        pointerEvents={disabled ? 'none' : 'auto'}
        accessibilityState={{ disabled }}
        style={styles.cycle}
        testID="form-cycle-lock"
      >
        {/* All five cycles, always (07 §2). */}
        <BillingCycleField
          value={values.cycle}
          onChange={(cycle) => onChange({ cycle })}
          testID="form-cycle"
        />

        {/* Custom: "Every [n] [unit]", shown only when Custom is picked. */}
        {values.cycle === 'custom' ? (
          <View style={styles.customRow} testID="form-custom">
            <Stepper
              label="Every"
              value={values.customCount}
              onChange={(customCount) => onChange({ customCount })}
              testID="form-custom-count"
            />
            <View style={styles.customUnit}>
              <Select
                label="Unit"
                options={UNIT_OPTIONS}
                value={values.customUnit}
                onChange={(customUnit) => onChange({ customUnit })}
                disabled={disabled}
                testID="form-custom-unit"
              />
            </View>
          </View>
        ) : null}
      </View>

      <DateField
        label="Start date"
        value={values.startDate}
        onChange={(startDate) => {
          onChange({ startDate });
          onBlur('startDate');
        }}
        placeholder="Select date"
        error={errors.startDate}
        disabled={disabled}
        testID="form-start"
      />

      <TextField
        label="Notes (optional)"
        value={values.notes}
        onChangeText={(notes) => onChange({ notes: notes.slice(0, LIMITS.notes) })}
        placeholder="Add any notes…"
        error={errors.notes}
        editable={!disabled}
        multiline
        testID="form-notes"
      />

      <TextField
        label="Paid with (optional)"
        value={values.paymentLabel}
        onChangeText={(paymentLabel) =>
          onChange({ paymentLabel: paymentLabel.slice(0, LIMITS.paymentLabel) })
        }
        placeholder="e.g. Visa ••4242"
        helper="A label only — never enter a full card number."
        error={errors.paymentLabel}
        editable={!disabled}
        testID="form-paid-with"
      />
    </View>
  );
}

const useStyles = makeStyles(({ colors, typography }) => ({
  form: {
    gap: spacing.lg,
  },
  historyLink: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    gap: spacing.xs,
  },
  historyText: {
    ...typography.captionStrong,
    color: colors.accent,
  },
  // Same spacing as the other fields, for the cycle + custom row group.
  cycle: {
    gap: spacing.lg,
  },
  customRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.md,
  },
  customUnit: {
    flex: 1,
  },
}));
