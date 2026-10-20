/**
 * SettingsRow — one row of a settings group (handoff 02 §11, Figma node 3:1819).
 *
 * What it is for
 *   Every row on Settings, Notification Rules and Profile. Rows sit inside a
 *   `GroupedList`, which draws the surface, the radius and the dividers between
 *   rows — so the last row in a group never has a divider under it.
 *
 * Variants (02 §11)
 *   chevron      optional value text + 16px chevron; navigates
 *   toggle       a Toggle; the WHOLE ROW is the switch (02 §7)
 *   stepper      − value + with 28 × 28 buttons
 *   destructive  label in danger + a trailing icon ("Sign out")
 *
 * Why the toggle row is the switch, not the toggle
 *   The toggle is 24pt tall, below the 44pt floor. The row is 52. Making the row
 *   the control gives a target anyone can hit, and puts the label and state in
 *   one announcement: "Billing reminders, switch, on".
 *
 * Design tokens
 *   padding  spacing.lg (16) horizontal, 14 vertical — derived from the row
 *            heights: sizes.rowSettings (46) chevron, rowSettingsToggle (52) toggle
 *   label    typography.labelMd, colors.text (danger for destructive)
 *   value    typography.labelMd, colors.textMuted
 */
import { ChevronRight, LogOut, Minus, Plus, type LucideIcon } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';

import { makeStyles, radius, sizes, spacing, useTheme } from '@/theme';

import { Toggle } from './Toggle';

interface BaseRowProps {
  label: string;
  testID?: string;
}

export interface ChevronRowProps extends BaseRowProps {
  variant?: 'chevron';
  /** Current value shown before the chevron, e.g. "USD". */
  value?: string;
  onPress: () => void;
}

export interface ToggleRowProps extends BaseRowProps {
  variant: 'toggle';
  value: boolean;
  onValueChange: (next: boolean) => void;
  disabled?: boolean;
  /** A second line explaining what the setting does. */
  description?: string;
}

export interface StepperRowProps extends BaseRowProps {
  variant: 'stepper';
  value: number;
  onValueChange: (next: number) => void;
  min?: number;
  max?: number;
  /** Formats the value, e.g. `(n) => `${n} days``. */
  format?: (value: number) => string;
}

export interface DestructiveRowProps extends BaseRowProps {
  variant: 'destructive';
  onPress: () => void;
  icon?: LucideIcon;
}

export type SettingsRowProps =
  ChevronRowProps | ToggleRowProps | StepperRowProps | DestructiveRowProps;

export function SettingsRow(props: SettingsRowProps) {
  const styles = useStyles();
  const { colors } = useTheme();

  switch (props.variant) {
    case 'toggle': {
      const {
        label,
        value,
        onValueChange,
        disabled = false,
        description,
        testID,
      } = props;
      return (
        <Pressable
          onPress={() => onValueChange(!value)}
          disabled={disabled}
          accessibilityRole="switch"
          accessibilityLabel={label}
          accessibilityHint={description}
          accessibilityState={{ checked: value, disabled }}
          style={({ pressed }) => [
            styles.row,
            styles.rowToggle,
            pressed && styles.pressed,
          ]}
          testID={testID}
        >
          <View style={styles.text}>
            <Text style={styles.label}>{label}</Text>
            {description ? <Text style={styles.description}>{description}</Text> : null}
          </View>
          <Toggle value={value} disabled={disabled} />
        </Pressable>
      );
    }

    case 'stepper': {
      const {
        label,
        value,
        onValueChange,
        min = 0,
        max = Number.MAX_SAFE_INTEGER,
        format = String,
        testID,
      } = props;
      const shown = format(value);
      return (
        <View
          style={[styles.row, styles.rowToggle]}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={label}
          accessibilityValue={{ text: shown }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={(event) => {
            if (event.nativeEvent.actionName === 'increment' && value < max) {
              onValueChange(value + 1);
            }
            if (event.nativeEvent.actionName === 'decrement' && value > min) {
              onValueChange(value - 1);
            }
          }}
          testID={testID}
        >
          <Text style={[styles.label, styles.text]}>{label}</Text>
          <View style={styles.stepper}>
            <StepButton
              icon={Minus}
              label={`Decrease ${label}`}
              disabled={value <= min}
              onPress={() => onValueChange(value - 1)}
              testID={testID ? `${testID}-decrement` : undefined}
            />
            <Text style={styles.value}>{shown}</Text>
            <StepButton
              icon={Plus}
              label={`Increase ${label}`}
              disabled={value >= max}
              onPress={() => onValueChange(value + 1)}
              testID={testID ? `${testID}-increment` : undefined}
            />
          </View>
        </View>
      );
    }

    case 'destructive': {
      const { label, onPress, icon: Icon = LogOut, testID } = props;
      return (
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={label}
          style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          testID={testID}
        >
          <Text style={[styles.label, styles.text, styles.danger]}>{label}</Text>
          <Icon
            size={sizes.iconSmall}
            color={colors.danger}
            strokeWidth={2}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          />
        </Pressable>
      );
    }

    default: {
      const { label, value, onPress, testID } = props;
      return (
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={value ? `${label}, ${value}` : label}
          style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          testID={testID}
        >
          <Text style={[styles.label, styles.text]}>{label}</Text>
          {value ? (
            <Text style={styles.value} numberOfLines={1}>
              {value}
            </Text>
          ) : null}
          <ChevronRight
            size={sizes.iconSmall}
            color={colors.textMuted}
            strokeWidth={2}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          />
        </Pressable>
      );
    }
  }
}

function StepButton({
  icon: Icon,
  label,
  disabled,
  onPress,
  testID,
}: {
  icon: LucideIcon;
  label: string;
  disabled: boolean;
  onPress: () => void;
  testID?: string;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      // 28pt visible, 44pt to the finger.
      hitSlop={(sizes.minTouch - sizes.stepper) / 2}
      style={({ pressed }) => [styles.stepButton, pressed && styles.pressed]}
      testID={testID}
    >
      <Icon
        size={sizes.iconSmall}
        color={disabled ? colors.textMuted : colors.text}
        strokeWidth={2}
      />
    </Pressable>
  );
}

const useStyles = makeStyles(({ colors, typography }) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: Math.max(sizes.rowSettings, sizes.minTouch),
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    backgroundColor: colors.surface,
  },
  rowToggle: {
    minHeight: sizes.rowSettingsToggle,
  },
  pressed: {
    backgroundColor: colors.surface2,
  },
  text: {
    flex: 1,
    gap: spacing.xs,
  },
  label: {
    ...typography.labelMd,
  },
  description: {
    ...typography.caption,
  },
  value: {
    ...typography.labelMd,
    color: colors.textMuted,
  },
  danger: {
    color: colors.danger,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  stepButton: {
    width: sizes.stepper,
    height: sizes.stepper,
    borderRadius: radius.card,
    borderWidth: sizes.hairline,
    borderColor: colors.borderControl,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));
