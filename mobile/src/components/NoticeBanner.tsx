/**
 * NoticeBanner — the amber attention strip.
 *
 * What it is for
 *   Surfacing something the user should know but need not act on immediately: a
 *   scheduled price increase, a missed alert, a stale exchange rate.
 *
 * Why it renders nothing until the API supplies a notice
 *   The prototype shows a price-increase banner on Home and on the detail
 *   screen, but price-change detection is Epic H and is not built. Hard-coding
 *   that banner would put a permanent, fictional warning in front of every user.
 *   So the component exists, the slot exists, and it stays empty until the
 *   server sends something — which is what `Dashboard.notice` is for.
 *
 * Accessibility
 *   Announced as an alert so a screen reader reports it on arrival rather than
 *   only when the user swipes onto it. The icon is decorative; the words carry
 *   the meaning, and the amber tint is reinforcement.
 *
 * Design tokens
 *   background  colors.noticeBg
 *   border      colors.noticeLine
 *   text        colors.noticeInk
 *   radius      radius.card (16)
 *
 * Used by: Home (notice slot), Subscription detail (price-increase), Settings
 *          (rate unavailable).
 */
import { AlertCircle, ChevronRight } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, typography } from '@/theme';

export interface NoticeBannerProps {
  /** The message. Written as a full sentence — it is the entire content. */
  message: string;

  /** Optional bold first line, with `message` becoming the detail beneath. */
  title?: string;

  /** Makes the banner tappable and shows a chevron. */
  onPress?: () => void;

  /** What tapping leads to, e.g. "Opens the subscription". */
  accessibilityHint?: string;

  testID?: string;
}

export function NoticeBanner({
  message,
  title,
  onPress,
  accessibilityHint,
  testID,
}: NoticeBannerProps) {
  const body = (
    <View style={styles.banner}>
      <AlertCircle
        size={20}
        color={colors.noticeInk}
        strokeWidth={1.7}
        // Decorative: the text says everything the icon implies.
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />

      <View style={styles.text}>
        {title ? <Text style={styles.title}>{title}</Text> : null}
        <Text style={styles.message}>{message}</Text>
      </View>

      {onPress ? (
        <ChevronRight
          size={20}
          color={colors.noticeInk}
          strokeWidth={1.7}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
      ) : null}
    </View>
  );

  const label = title ? `${title}. ${message}` : message;

  if (!onPress) {
    return (
      <View
        accessible
        accessibilityRole="alert"
        accessibilityLabel={label}
        testID={testID}
      >
        {body}
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      accessible
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      testID={testID}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.noticeBg,
    borderWidth: 1,
    borderColor: colors.noticeLine,
    borderRadius: radius.card,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  text: {
    flex: 1,
    gap: spacing.xs,
  },
  title: {
    ...typography.rowTitle,
    color: colors.noticeInk,
  },
  message: {
    ...typography.body,
    color: colors.noticeInk,
  },
});
