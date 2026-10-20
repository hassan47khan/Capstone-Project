/**
 * SectionHeader — the small uppercase label above a group (handoff 02 §14).
 *
 * What it is for
 *   Naming a group of rows: "UPCOMING RENEWALS" on Home, a category name above
 *   a group of subscriptions, "PRICE HISTORY" on the detail screen.
 *
 * Why it is 12px Bold
 *   Measured Bold 12 on the Analytics group headers and the Detail price-history
 *   label. 02 first listed 11px SemiBold, which was a misread of the same nodes;
 *   11 would also have broken 01 §4's floor of 12pt for any new text, and this
 *   label is the sole carrier of its meaning, so it cannot go below it.
 *
 * The optional colour square
 *   Category group headers draw an 8 × 8 rounded square in the category colour
 *   before the label. It is reinforcement only, never the information: the label
 *   is always present, and 01 §7 forbids colour as the sole carrier. So the
 *   square is hidden from screen readers and the header announces just its text.
 *
 * Design tokens
 *   text     typography.sectionLabel — DM Sans Bold 12, +0.5 tracking,
 *            uppercase, colors.textMuted
 *   square   sizes.dot (8), radius.badge (4), spacing.sm (8) gap
 *   spacing  spacing.xl (20) above
 */
import { Text, View } from 'react-native';

import { makeStyles, radius, sizes, spacing } from '@/theme';

export interface SectionHeaderProps {
  title: string;

  /**
   * Category colour for the leading 8 × 8 square. Omitted on an ordinary
   * header, which is most of them.
   */
  color?: string;

  testID?: string;
}

export function SectionHeader({ title, color, testID }: SectionHeaderProps) {
  const styles = useStyles();

  if (!color) {
    return (
      <Text style={styles.header} accessibilityRole="header" testID={testID}>
        {title}
      </Text>
    );
  }

  return (
    <View
      style={styles.row}
      // One element with one name: the square is decorative, so the row has to
      // carry the label itself or the header announces as nameless.
      accessible
      accessibilityRole="header"
      accessibilityLabel={title}
      testID={testID}
    >
      <View
        style={[styles.square, { backgroundColor: color }]}
        // The label beside it carries the meaning; announcing the square too
        // would read a colour out as if it were content.
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        testID={testID ? `${testID}-square` : undefined}
      />
      <Text style={styles.label}>{title}</Text>
    </View>
  );
}

const useStyles = makeStyles(({ typography }) => ({
  header: {
    ...typography.sectionLabel,
    paddingTop: spacing.xl,
    paddingBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingTop: spacing.xl,
    paddingBottom: spacing.sm,
  },
  square: {
    width: sizes.dot,
    height: sizes.dot,
    borderRadius: radius.badge,
  },
  label: {
    ...typography.sectionLabel,
  },
}));
