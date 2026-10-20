/**
 * Stepper — the numeric − / + control (handoff 02 §16).
 *
 * What it is for
 *   The count in a custom billing cycle: "Every [2] [Months ▾]". It sits beside
 *   a Select of the same 44pt height, which supplies the unit.
 *
 * Why the hit areas are thirds and not the icons
 *   Measured in `4:3417` the − and + glyphs are 14px. Tapping a 14px target is
 *   a coin flip, so the glyphs are visual only: the left and right thirds of
 *   the control are each a full-height Pressable, which at 44 tall and a third
 *   of the width clears 44 × 44. The value in the middle is not tappable.
 *
 * Long-press repeat
 *   Holding a side repeats after 400ms at 8 steps a second, so going from 1 to
 *   24 is a hold rather than 23 taps. The repeat stops at the bound, on release,
 *   and on unmount — a timer that outlives the component would step a value
 *   nobody is looking at.
 *
 * Accessibility
 *   One `adjustable` element rather than two buttons, so an assistive
 *   technology can swipe up and down to change the value instead of hunting for
 *   a 14px glyph. It announces "Every, 2" via `accessibilityValue.text`, and the
 *   increment/decrement actions are what a swipe maps to.
 *
 * Design tokens
 *   height    sizes.stepperControl (44), matching the Select beside it
 *   radius    radius.card (6 — 02 measures 12, normalized by 01 §5)
 *   fill      colors.surface, 1px colors.borderControl
 *   padding   spacing.md (12) horizontal
 *   glyphs    sizes.iconStepper (14); colors.textMuted at a bound
 *   value     typography.stepperValue (DM Sans Medium 16)
 *
 * Used by: Add/Edit subscription (custom billing cycle).
 */
import { Minus, Plus } from 'lucide-react-native';
import { useEffect, useRef } from 'react';
import { Pressable, Text, View } from 'react-native';

import { makeStyles, radius, sizes, spacing, useTheme } from '@/theme';

/** 02 §16: the bounds a billing-cycle count may take. */
export const STEPPER_MIN = 1;
export const STEPPER_MAX = 99;

/** How long a press is held before it starts repeating, and the rate after. */
const REPEAT_DELAY_MS = 400;
const REPEAT_INTERVAL_MS = 1000 / 8;

export interface StepperProps {
  value: number;
  onChange: (value: number) => void;

  min?: number;
  max?: number;

  /**
   * What the value means, spoken before it: "Every" announces as "Every, 2".
   * Also the accessible name, so the control is never just a bare number.
   */
  label: string;

  testID?: string;
}

export function Stepper({
  value,
  onChange,
  min = STEPPER_MIN,
  max = STEPPER_MAX,
  label,
  testID,
}: StepperProps) {
  const styles = useStyles();
  const { colors } = useTheme();

  const atMin = value <= min;
  const atMax = value >= max;

  // The repeat reads the live value through a ref: the interval closure is
  // created once per press, so capturing `value` would step from a stale number
  // and the count would stop advancing after the first repeat. Synced in an
  // effect rather than during render — by the time a press or a tick can read
  // it, the effect has flushed.
  const latest = useRef(value);
  useEffect(() => {
    latest.current = value;
  }, [value]);

  const delay = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const repeat = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  const stop = () => {
    if (delay.current) clearTimeout(delay.current);
    if (repeat.current) clearInterval(repeat.current);
    delay.current = undefined;
    repeat.current = undefined;
  };

  // A timer that survives the screen would call `onChange` on an unmounted
  // form, so unmount cancels it.
  useEffect(() => stop, []);

  const step = (by: number) => {
    const next = Math.min(max, Math.max(min, latest.current + by));
    if (next === latest.current) return;
    latest.current = next;
    onChange(next);
  };

  const startRepeat = (by: number) => {
    stop();
    delay.current = setTimeout(() => {
      repeat.current = setInterval(() => {
        const bound = by < 0 ? min : max;
        // Stop at the bound rather than spinning against it for as long as the
        // finger stays down.
        if (latest.current === bound) {
          stop();
          return;
        }
        step(by);
      }, REPEAT_INTERVAL_MS);
    }, REPEAT_DELAY_MS);
  };

  const side = (by: number, disabled: boolean, name: string) => (
    <Pressable
      onPress={() => step(by)}
      onPressIn={() => {
        if (!disabled) startRepeat(by);
      }}
      onPressOut={stop}
      disabled={disabled}
      // Hidden from screen readers: the whole control is one `adjustable`
      // element, so exposing the sides as well would read three things.
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={styles.side}
      testID={testID ? `${testID}-${name}` : undefined}
    >
      {by < 0 ? (
        <Minus
          size={sizes.iconStepper}
          color={disabled ? colors.textMuted : colors.text}
          strokeWidth={2}
        />
      ) : (
        <Plus
          size={sizes.iconStepper}
          color={disabled ? colors.textMuted : colors.text}
          strokeWidth={2}
        />
      )}
    </Pressable>
  );

  return (
    <View
      style={styles.control}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ now: value, min, max, text: `${label}, ${value}` }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={({ nativeEvent }) => {
        if (nativeEvent.actionName === 'increment') step(1);
        if (nativeEvent.actionName === 'decrement') step(-1);
      }}
      testID={testID}
    >
      {side(-1, atMin, 'decrement')}
      <Text style={styles.value} maxFontSizeMultiplier={1.3}>
        {value}
      </Text>
      {side(1, atMax, 'increment')}
    </View>
  );
}

const useStyles = makeStyles(({ colors, typography }) => ({
  control: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: sizes.stepperControl,
    minHeight: sizes.minTouch,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    borderWidth: sizes.hairline,
    borderColor: colors.borderControl,
    paddingHorizontal: spacing.md,
  },
  // A third of the control each, full height: the 14px glyph inside is visual.
  side: {
    flex: 1,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: {
    ...typography.stepperValue,
    flex: 1,
    textAlign: 'center',
  },
}));
