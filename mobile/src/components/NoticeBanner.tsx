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
 * Design tokens (the warning family, 01 §1)
 *   background  colors.warningSurface
 *   border      colors.warningBorder
 *   icon        colors.warning, on a sizes.warningIcon (40) colors.warningIconBg circle
 *   text        colors.text — muted grey is 4.22:1 on the tint, a 12px AA failure
 *   radius      radius.card (6)
 *
 * Used by: Home (notice slot), Subscription detail (price-increase), Settings
 *          (rate unavailable).
 */
import { AlertCircle, ChevronRight } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';

import { makeStyles, radius, sizes, spacing, useTheme } from '@/theme';

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
  const styles = useStyles();
  const { colors } = useTheme();
  const body = (
    <View style={styles.banner}>
      <View style={styles.iconCircle}>
        <AlertCircle
          size={sizes.icon}
          color={colors.warning}
          strokeWidth={1.7}
          // Decorative: the text says everything the icon implies.
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
      </View>

      <View style={styles.text}>
        {title ? <Text style={styles.title}>{title}</Text> : null}
        <Text style={styles.message}>{message}</Text>
      </View>

      {onPress ? (
        <ChevronRight
          size={sizes.icon}
          color={colors.text}
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

const useStyles = makeStyles(({ colors, typography }) => ({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.warningSurface,
    borderWidth: 1,
    borderColor: colors.warningBorder,
    borderRadius: radius.card,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  // 01 §1: a 40px circle behind the alert icon, which is what `warningIconBg`
  // is for. It layers over `warningSurface`, so both stay translucent.
  iconCircle: {
    width: sizes.warningIcon,
    height: sizes.warningIcon,
    borderRadius: radius.pill,
    backgroundColor: colors.warningIconBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
    gap: spacing.xs,
  },
  title: {
    ...typography.labelSemibold,
    color: colors.text,
  },
  message: {
    ...typography.bodyMd,
    color: colors.text,
  },
}));
