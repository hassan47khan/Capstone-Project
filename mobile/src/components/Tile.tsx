/**
 * Tile — the monogram square beside a subscription name.
 *
 * What it is for
 *   The rounded square showing a service's first letter, tinted by category. It
 *   gives a list row a visual anchor and makes the category readable at a glance
 *   without a second line of text.
 *
 * Why a letter rather than a logo
 *   SubTrak has no relationship with the services a user logs, so it has no
 *   right to their marks, and fetching favicons would leak the user's
 *   subscription list to third parties. A letter costs nothing and reveals
 *   nothing.
 *
 * Why it is hidden from screen readers
 *   The tile shows the first letter of a name that is already read out on the
 *   very next line, and a colour that conveys a category also stated in text.
 *   Announcing "S" before "Streamly Plus, Streaming" is pure noise, so the tile
 *   is marked decorative.
 *
 * Design tokens
 *   size      sizes.tile (44) in a row, sizes.tileLarge (72) on a detail screen
 *   radius    radius.tile (10)
 *   colours   categoryColors[category].tint background, .ink letter
 *   letter    Newsreader 600 at half the tile size
 *
 * Used by: Subscriptions list rows, Home upcoming renewals, Subscription detail,
 *          Insights largest-subscriptions list.
 */
import { StyleSheet, Text, View } from 'react-native';

import { categoryColors, fontFamily, radius, sizes, type Category } from '@/theme';

export interface TileProps {
  /** The name to take a monogram from. Only its first character is used. */
  name: string;

  /** Null uses the `other` triplet, matching the "Uncategorized" label. */
  category: Category | null;

  /** `row` is the 44pt list size; `large` is the 72pt detail-screen size. */
  size?: 'row' | 'large';

  testID?: string;
}

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

export function Tile({ name, category, size = 'row', testID }: TileProps) {
  const palette = categoryColors[category ?? 'other'];
  const dimension = size === 'large' ? sizes.tileLarge : sizes.tile;

  return (
    <View
      style={[
        styles.tile,
        { width: dimension, height: dimension, backgroundColor: palette.tint },
      ]}
      // Decorative: the name and category are both stated in adjacent text.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID={testID}
    >
      <Text
        style={[styles.letter, { fontSize: dimension / 2, color: palette.ink }]}
        // Fixed: the letter is sized to the tile, so scaling it would overflow
        // a square that cannot grow with it.
        allowFontScaling={false}
      >
        {monogramOf(name)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    borderRadius: radius.tile,
    alignItems: 'center',
    justifyContent: 'center',
  },
  letter: {
    fontFamily: fontFamily.displaySemiBold,
    // Centres the glyph optically; a serif cap sits slightly high in its box.
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
});
