/**
 * GroupedList — one white card containing rows separated by hairlines.
 *
 * What it is for
 *   The list pattern used throughout the design: the Settings groups, the
 *   key-value card on the subscription detail screen, and the subscription list
 *   itself.
 *
 * Why one card rather than a card per row
 *   The prototype draws a single rounded surface with 1px dividers between rows,
 *   not a stack of separate cards. The difference is what makes the app look
 *   composed rather than like a feed of tiles.
 *
 * Why the divider logic lives here
 *   The rule — a divider between every pair of rows, none above the first or
 *   below the last — is easy to get wrong when each row draws its own border,
 *   and the mistake (a stray line under the last row, inside the rounded
 *   corner) is subtle but looks broken. Centralising it means a row never has to
 *   know its position.
 *
 * Design tokens
 *   background  colors.surface
 *   radius      radius.card (16)
 *   border      colors.line, hairline
 *
 * Used by: Settings, Subscription detail, Subscriptions list, Currency picker.
 */
import { Children, type ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radius, spacing, typography } from '@/theme';

export interface GroupedListProps {
  /** Rows, usually `ListRow` elements. */
  children: ReactNode;

  /** Small heading above the card, such as "Display" or "Notifications". */
  title?: string;

  /** Explanatory line below the card, such as the exchange-rate footnote. */
  footnote?: string;

  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function GroupedList({
  children,
  title,
  footnote,
  style,
  testID,
}: GroupedListProps) {
  // `Children.toArray` discards null and false, so a conditionally rendered row
  // does not leave a divider with nothing beneath it.
  const rows = Children.toArray(children);

  return (
    <View style={[styles.container, style]}>
      {title ? <Text style={styles.title}>{title}</Text> : null}

      <View style={styles.card} testID={testID}>
        {rows.map((row, index) => (
          // The index is a safe key here: these rows are a static, ordered list
          // that is never reordered or filtered after mount. A list that CAN
          // reorder (the subscription list) renders its own keyed rows and
          // passes them in already built.
          <View key={index} style={index > 0 ? styles.divided : undefined}>
            {row}
          </View>
        ))}
      </View>

      {footnote ? <Text style={styles.footnote}>{footnote}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  title: {
    ...typography.eyebrow,
    // Settings section headers read as labels, not sentences.
    textTransform: 'none',
    paddingHorizontal: spacing.xs,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.line,
    // Clips each row's background to the rounded corners, so a pressed first or
    // last row does not paint a square highlight outside the card.
    overflow: 'hidden',
  },
  divided: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  footnote: {
    ...typography.caption,
    paddingHorizontal: spacing.xs,
  },
});
