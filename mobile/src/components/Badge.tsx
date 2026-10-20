/**
 * Badge — a small status pill.
 *
 * What it is for
 *   Labelling a record's state next to its name: "Active" on the subscription
 *   detail screen, "Trial" on a list row, "Cancelled" on an archived one.
 *
 * Why it is not just styled text
 *   A badge carries meaning a sighted user reads from its position and tint. A
 *   screen reader would otherwise announce the subscription name immediately
 *   followed by a loose word, with no indication it is a status. The explicit
 *   accessibility label ("Status: Trial") supplies that context.
 *
 * Colour never carries the meaning alone: the word is always present. The tint
 * is reinforcement, not information.
 *
 * Never a pill (02 §19): the radius is the measured 4, so a badge does not read
 * as a tappable chip.
 *
 * Design tokens
 *   radius      radius.badge (4, measured — 01 §5)
 *   padding     spacing.sm (8) horizontal, spacing.xs (4) vertical
 *   label       typography.caption at DM Sans Bold — 12px, the 01 §4 floor. The
 *               prototype's 10px count badge is raised to it.
 *   success     colors.successSurface background, colors.success text (4.79:1)
 *   neutral     colors.surface2 background, colors.text text
 *   warning     colors.warningSurface background, colors.text text
 *
 * Deviations from 02 §19
 *   `neutral` text is `text`, not `textMuted`: muted grey on `surface2` is
 *   4.28:1, an AA failure (CONTRAST.md). `warning` text is `text` for the same
 *   reason — 02 §19 already notes `warning` on its own tint is 3.79:1.
 *
 * Used by: Subscription detail, Subscriptions list rows, Insights counts.
 */
import { Text, View } from 'react-native';

import { fontFamily, makeStyles, radius, spacing } from '@/theme';

export type BadgeTone = 'success' | 'neutral' | 'warning';

export interface BadgeProps {
  /** The word shown. Short — one or two words at most. */
  label: string;

  /**
   * success — "Active", "12 active": the healthy state
   * neutral — "Cancelled", or any inert state
   * warning — "Trial", or anything needing attention before a date
   */
  tone?: BadgeTone;

  testID?: string;
}

export function Badge({ label, tone = 'neutral', testID }: BadgeProps) {
  const styles = useStyles();
  return (
    <View
      style={[styles.badge, styles[tone]]}
      // Without this a screen reader reads the word with no clue it is a status.
      accessibilityLabel={`Status: ${label}`}
      testID={testID}
    >
      <Text style={[styles.label, styles[`${tone}Text`]]} maxFontSizeMultiplier={1.4}>
        {label}
      </Text>
    </View>
  );
}

const useStyles = makeStyles(({ colors, typography }) => ({
  badge: {
    alignSelf: 'flex-start',
    borderRadius: radius.badge,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  label: {
    ...typography.caption,
    fontFamily: fontFamily.bodyBold,
  },
  success: { backgroundColor: colors.successSurface },
  successText: { color: colors.success },
  neutral: { backgroundColor: colors.surface2 },
  // Not textMuted: muted text on surface2 is 4.28:1, below AA (see CONTRAST.md).
  neutralText: { color: colors.text },
  warning: { backgroundColor: colors.warningSurface },
  // Text on the warning tint is `text`, never muted grey (01 §1).
  warningText: { color: colors.text },
}));
