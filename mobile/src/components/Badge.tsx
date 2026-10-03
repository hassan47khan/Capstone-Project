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
 * Design tokens
 *   radius      radius.pill (fully rounded)
 *   neutral     colors.sunken background, colors.ink2 text
 *   accent      colors.accentTint background, colors.accent text
 *   notice      colors.noticeBg background, colors.noticeInk text
 *   text        typography.badge
 *
 * Used by: Subscription detail, Subscriptions list rows.
 */
import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, typography } from '@/theme';

export type BadgeTone = 'neutral' | 'accent' | 'notice';

export interface BadgeProps {
  /** The word shown. Short — one or two words at most. */
  label: string;

  /**
   * neutral — cancelled, or any inert state
   * accent  — active, the healthy state
   * notice  — trial, or anything that needs attention before a date
   */
  tone?: BadgeTone;

  testID?: string;
}

export function Badge({ label, tone = 'neutral', testID }: BadgeProps) {
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

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
  },
  label: {
    ...typography.badge,
  },
  neutral: { backgroundColor: colors.sunken },
  neutralText: { color: colors.ink2 },
  accent: { backgroundColor: colors.accentTint },
  accentText: { color: colors.accent },
  notice: { backgroundColor: colors.noticeBg },
  noticeText: { color: colors.noticeInk },
});
