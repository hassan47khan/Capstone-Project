/**
 * GroupedList — one white card containing rows separated by hairlines.
 *
 * What it is for
 *   The SettingsRow group (02 §11): Settings, Notification Rules, Profile, and
 *   the key-value card on the subscription detail screen. Subscription rows are
 *   separate bordered cards (ListRow) and do not go in here.
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
 *   radius      radius.card (6)
 *   border      colors.border, hairline
 *
 * Used by: Settings, Notification Rules, Profile, Subscription detail.
 */
import { Children, type ReactNode } from 'react';
import { Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { makeStyles, radius, sizes, spacing } from '@/theme';

import { SectionHeader } from './SectionHeader';

export interface GroupedListProps {
  /** Rows, usually `SettingsRow` elements. */
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
  const styles = useStyles();
  // `Children.toArray` discards null and false, so a conditionally rendered row
  // does not leave a divider with nothing beneath it.
  const rows = Children.toArray(children);

  return (
    <View style={[styles.container, style]}>
      {title ? <SectionHeader title={title} /> : null}

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

const useStyles = makeStyles(({ colors, typography }) => ({
  container: {
    gap: spacing.sm,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: sizes.hairline,
    borderColor: colors.border,
    // Clips each row's background to the rounded corners, so a pressed first or
    // last row does not paint a square highlight outside the card.
    overflow: 'hidden',
  },
  divided: {
    borderTopWidth: sizes.hairline,
    borderTopColor: colors.border,
  },
  footnote: {
    ...typography.caption,
    paddingHorizontal: spacing.xs,
  },
}));
