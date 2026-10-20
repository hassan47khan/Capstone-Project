/**
 * ServiceMark — the circular service tile beside a subscription name (02 §21).
 *
 * What it is for
 *   The tinted circle carrying a service's mark: "N" for Netflix, "iC" for
 *   iCloud. It gives a list row a visual anchor and makes services tell apart
 *   at a glance.
 *
 * Why a mark rather than a logo
 *   SubTrak has no relationship with the services a user logs, so it has no
 *   right to their marks, and fetching favicons would leak the user's
 *   subscription list to third parties. A letter costs nothing and reveals
 *   nothing.
 *
 * Where the colour comes from (handoff 01 §3)
 *   Service brand colour, not category colour. A catalog service passes its
 *   `brand` tint/ink (e.g. Netflix #ffecee / #e50914). A user-entered service
 *   with no catalog entry gets `serviceTint(name)` — deterministic from the name,
 *   so the same name is always the same colour, never random.
 *
 * Why it is hidden from screen readers
 *   The mark shows initials of a name that is already read out on the very next
 *   line. Announcing "S" before "Streamly Plus" is pure noise, so it is marked
 *   decorative. Its tint/ink pairs are also low-contrast by design (01 §3),
 *   which is only safe because the mark is never the information.
 *
 * Sizes (02 §21)
 *   The four diameters the design draws — 36, 40, 44, 72 — with the radius
 *   always half the diameter and the mark always 0.375 × diameter, so a new
 *   size needs no new type ramp. `shape="square"` is the 28pt rounded square
 *   used by the dense member-subscription rows on Member detail (10 §3.4).
 *
 * Design tokens
 *   diameters  sizes.markCompact (36), mark (40), markMedium (44),
 *              markLarge (72), markSquare (28)
 *   radius     diameter / 2, or radius.card (6) when square
 *   mark       DM Sans Bold at 0.375 × diameter, in the brand ink
 *
 * Used by: Subscriptions list rows, Home upcoming renewals, Subscription detail,
 *          Insights largest-subscriptions list, Member detail.
 */
import { Text, View } from 'react-native';

import {
  fontFamily,
  makeStyles,
  radius,
  serviceTint,
  sizes,
  useTheme,
  type ServiceColors,
} from '@/theme';

/** The named diameters of 02 §21, plus the square's 28. */
export type ServiceMarkSize = 'square' | 'compact' | 'row' | 'medium' | 'large';

const DIAMETERS: Record<ServiceMarkSize, number> = {
  square: sizes.markSquare,
  compact: sizes.markCompact,
  row: sizes.mark,
  medium: sizes.markMedium,
  large: sizes.markLarge,
};

export interface ServiceMarkProps {
  /** The service name. Supplies the mark unless `mark` is given. */
  name: string;

  /**
   * The catalog's 1–2 character mark: "N", "iC", "GP". Omit for a service with
   * no catalog entry and the first letter of `name` is used instead.
   */
  mark?: string;

  /** Catalog brand colours. Omit for a user-entered service. */
  brand?: ServiceColors;

  /**
   * `row` (40) is the list size, `large` (72) the detail screen, `compact` (36)
   * a ListRow `compact`, `medium` (44) the Add-form preview.
   */
  size?: ServiceMarkSize;

  /**
   * `square` is the 28pt rounded square of the Member-detail rows. Everything
   * else is a circle. Forces the 28pt diameter, since that is the only size the
   * design draws it at.
   */
  shape?: 'circle' | 'square';

  testID?: string;
}

/** 02 §21: the mark is 0.375 of the diameter — 15px in a 40px circle. */
const MARK_RATIO = 0.375;

/**
 * Falls back to the first character of a name, uppercased.
 *
 * `Array.from` rather than `name[0]`, because indexing a string splits
 * characters outside the Basic Multilingual Plane in half and renders a broken
 * glyph. A user may well name a subscription with an emoji.
 */
function markOf(name: string, mark?: string): string {
  const explicit = mark?.trim();
  // Two characters is the catalog's limit ("iC", "GP"); anything longer would
  // not fit the circle at 0.375 × diameter.
  if (explicit) return Array.from(explicit).slice(0, 2).join('');

  const trimmed = name.trim();
  if (!trimmed) return '?';
  return (Array.from(trimmed)[0] ?? '?').toUpperCase();
}

export function ServiceMark({
  name,
  mark,
  brand,
  size = 'row',
  shape = 'circle',
  testID,
}: ServiceMarkProps) {
  const styles = useStyles();
  const { servicePalette } = useTheme();
  const palette = brand ?? serviceTint(name, servicePalette);

  // The square is only ever drawn at 28, so the shape pins the diameter rather
  // than letting a caller pair `square` with `large` and get something the
  // design has no measurement for.
  const isSquare = shape === 'square';
  const diameter = isSquare ? sizes.markSquare : DIAMETERS[size];

  return (
    <View
      style={[
        styles.mark,
        {
          width: diameter,
          height: diameter,
          borderRadius: isSquare ? radius.card : diameter / 2,
          backgroundColor: palette.tint,
        },
      ]}
      // Decorative: the name is stated in adjacent text.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID={testID}
    >
      <Text
        style={[styles.letter, { fontSize: diameter * MARK_RATIO, color: palette.ink }]}
        // Fixed: the mark is sized to the circle, so scaling it would overflow
        // a shape that cannot grow with it.
        allowFontScaling={false}
      >
        {markOf(name, mark)}
      </Text>
    </View>
  );
}

const useStyles = makeStyles(() => ({
  mark: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  letter: {
    fontFamily: fontFamily.bodyBold,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
}));
