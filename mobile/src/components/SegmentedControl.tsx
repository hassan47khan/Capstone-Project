/**
 * SegmentedControl — a horizontal single-choice control (handoff 02 §4).
 *
 * What it is for
 *   The billing-cycle picker and the Monthly/Annual toggle. The chosen segment
 *   sits on a `surface` tile inside a `surface2` track. Flat: 02 §8 allows no
 *   drop shadows anywhere, so the old Phase-0 thumb shadow is gone.
 *
 * Five billing cycles, always
 *   The prototype dropped Quarterly in one place and Custom in another. All five
 *   are present (`BILLING_CYCLE_OPTIONS`). Measured from the DM Sans SemiBold
 *   file, the widest label, "Quarterly", is 64.5px at 14px; on the 402-wide
 *   baseline each of five segments gets `segmentBudget(402)` ≈ 68px, so they
 *   fit at the default text size. At any larger OS text size they would not,
 *   and 02 §4 says to switch to a Select rather than abbreviate — that is what
 *   `BillingCycleField` does.
 *
 * Roles (02 §4)
 *   `tablist` on the track, `tab` on each segment, `selected` on the chosen one.
 *
 * Design tokens
 *   track      colors.surface2, radius.card, height sizes.segmentTrack (44)
 *   segment    sizes.segment (40); selected fill colors.surface
 *   text       selected typography.labelSemibold / colors.text,
 *              unselected typography.labelMd / colors.textMuted
 */
import { PixelRatio, Pressable, Text, View } from 'react-native';

import { makeStyles, radius, sizes, spacing } from '@/theme';

import { Select } from './Select';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

export interface SegmentedControlProps<T extends string> {
  /** Accessible name for the group, e.g. "Billing cycle". */
  label: string;

  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (next: T) => void;

  testID?: string;
}

/** Track padding and the gap between segments: what is left of 44 around 40. */
const TRACK_INSET = (sizes.segmentTrack - sizes.segment) / 2;

/**
 * Width one segment gets when `count` segments share a row on a screen of
 * `screenWidth`, after the 24pt gutters, track padding and gaps.
 */
export function segmentBudget(screenWidth: number, count = 5): number {
  const inner = screenWidth - spacing.xxl * 2 - TRACK_INSET * 2;
  return (inner - TRACK_INSET * (count - 1)) / count;
}

/**
 * The widest billing-cycle label, "Quarterly", in DM Sans SemiBold 14 at a font
 * scale of 1 — measured from the font file's advance widths.
 */
export const WIDEST_BILLING_LABEL_PX = 64.5;

export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
  testID,
}: SegmentedControlProps<T>) {
  const styles = useStyles();
  return (
    <View
      style={styles.track}
      accessibilityRole="tablist"
      accessibilityLabel={label}
      testID={testID}
    >
      {options.map((option) => {
        const selected = option.value === value;

        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="tab"
            accessibilityLabel={option.label}
            accessibilityState={{ selected }}
            style={[styles.segment, selected && styles.segmentSelected]}
            // The visible segment is 40; the hit area reaches the 44 floor.
            hitSlop={TRACK_INSET}
            testID={testID ? `${testID}-${option.value}` : undefined}
          >
            <Text
              style={selected ? styles.labelSelected : styles.labelUnselected}
              numberOfLines={1}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export type BillingCycleOption = 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'custom';

/** All five, in order. Never fewer (02 §4). */
export const BILLING_CYCLE_OPTIONS: readonly SegmentedOption<BillingCycleOption>[] = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly', label: 'Yearly' },
  { value: 'custom', label: 'Custom' },
];

export interface BillingCycleFieldProps {
  value: BillingCycleOption;
  onChange: (next: BillingCycleOption) => void;
  /** Injected in tests; defaults to the OS text-size setting. */
  fontScale?: number;
  testID?: string;
}

/**
 * The billing-cycle input. Segments when all five labels fit; a Select when
 * the OS text size would make them truncate (02 §4).
 */
export function BillingCycleField({
  value,
  onChange,
  fontScale = PixelRatio.getFontScale(),
  testID,
}: BillingCycleFieldProps) {
  const fits = WIDEST_BILLING_LABEL_PX * fontScale <= segmentBudget(402);
  return fits ? (
    <SegmentedControl
      label="Billing cycle"
      options={BILLING_CYCLE_OPTIONS}
      value={value}
      onChange={onChange}
      testID={testID}
    />
  ) : (
    <Select
      label="Billing cycle"
      options={BILLING_CYCLE_OPTIONS}
      value={value}
      onChange={onChange}
      testID={testID}
    />
  );
}

const useStyles = makeStyles(({ colors, typography }) => ({
  track: {
    flexDirection: 'row',
    height: sizes.segmentTrack,
    backgroundColor: colors.surface2,
    borderRadius: radius.card,
    padding: TRACK_INSET,
    gap: TRACK_INSET,
  },
  segment: {
    flex: 1,
    height: sizes.segment,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.card - TRACK_INSET,
  },
  segmentSelected: {
    backgroundColor: colors.surface,
  },
  labelSelected: {
    ...typography.labelSemibold,
  },
  labelUnselected: {
    ...typography.labelMd,
    // On surface2 — muted text is 4.28:1 there, below AA. Unselected segments
    // therefore stay in `text`; the selected tile and weight carry the state.
    color: colors.text,
  },
}));
