/**
 * SectionHeader — the small uppercase label above a group (handoff 02 §14).
 *
 * What it is for
 *   "ENTERTAINMENT" above a group of rows, "NOTIFICATIONS" above a settings
 *   group. Announced as a header so screen-reader users can jump between groups.
 *
 * Deviation from 02
 *   02 asks for 11px. It is 12px (`typography.sectionLabel`): 01 §4 allows no
 *   new text below the 12pt floor, and this label is the sole carrier of its
 *   information.
 *
 * Design tokens
 *   text     typography.sectionLabel — DM Sans SemiBold 12, +0.5 tracking,
 *            uppercase, colors.textMuted
 *   spacing  spacing.xl (20) above
 */
import { Text } from 'react-native';

import { makeStyles, spacing } from '@/theme';

export interface SectionHeaderProps {
  title: string;
  testID?: string;
}

export function SectionHeader({ title, testID }: SectionHeaderProps) {
  const styles = useStyles();
  return (
    <Text style={styles.header} accessibilityRole="header" testID={testID}>
      {title}
    </Text>
  );
}

const useStyles = makeStyles(({ typography }) => ({
  header: {
    ...typography.sectionLabel,
    paddingTop: spacing.xl,
    paddingBottom: spacing.sm,
  },
}));
