/**
 * Tile — the monogram circle beside a subscription name.
 *
 * What it is for
 *   The circle showing a service's first letter on a tinted fill. It gives a list
 *   row a visual anchor and makes services tell apart at a glance.
 *
 * Why a letter rather than a logo
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
 *   The tile shows the first letter of a name that is already read out on the
 *   very next line. Announcing "S" before "Streamly Plus" is pure noise, so the
 *   tile is marked decorative.
 *
 * Design tokens
 *   size      sizes.tile (40) in a row, sizes.tileLarge (72) on a detail screen
 *   radius    radius.avatar (20) — a full circle at row size
 *   letter    DM Sans Bold at 15/40 of the tile size (Figma: 15px in a 40px circle)
 *
 * Used by: Subscriptions list rows, Home upcoming renewals, Subscription detail,
 *          Insights largest-subscriptions list.
 */
import { Text, View } from 'react-native';

import {
  fontFamily,
  makeStyles,
  serviceTint,
  sizes,
  useTheme,
  type ServiceColors,
} from '@/theme';

export interface TileProps {
  /** The name to take a monogram from. Only its first character is used. */
  name: string;

  /** Catalog brand colours. Omit for a user-entered service. */
  brand?: ServiceColors;

  /** `row` is the 40pt list size; `large` is the 72pt detail-screen size. */
  size?: 'row' | 'large';

  testID?: string;
}

/** Figma: a 15px initial in a 40px circle. */
const LETTER_RATIO = 15 / 40;

/**
 * First character of a name, uppercased.
 *
 * `Array.from` rather than `name[0]`, because indexing a string splits
 * characters outside the Basic Multilingual Plane in half and renders a broken
 * glyph. A user may well name a subscription with an emoji.
 */
function monogramOf(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  return (Array.from(trimmed)[0] ?? '?').toUpperCase();
}

export function Tile({ name, brand, size = 'row', testID }: TileProps) {
  const styles = useStyles();
  const { servicePalette } = useTheme();
  const palette = brand ?? serviceTint(name, servicePalette);
  const dimension = size === 'large' ? sizes.tileLarge : sizes.tile;

  return (
    <View
      style={[
        styles.tile,
        {
          width: dimension,
          height: dimension,
          borderRadius: dimension / 2,
          backgroundColor: palette.tint,
        },
      ]}
      // Decorative: the name is stated in adjacent text.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID={testID}
    >
      <Text
        style={[
          styles.letter,
          { fontSize: dimension * LETTER_RATIO, color: palette.ink },
        ]}
        // Fixed: the letter is sized to the tile, so scaling it would overflow
        // a circle that cannot grow with it.
        allowFontScaling={false}
      >
        {monogramOf(name)}
      </Text>
    </View>
  );
}

const useStyles = makeStyles(() => ({
  tile: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  letter: {
    fontFamily: fontFamily.bodyBold,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
}));
