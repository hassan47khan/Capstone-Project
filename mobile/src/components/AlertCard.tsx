/**
 * AlertCard — the amber attention card (handoff 02 §20).
 *
 * What it is for
 *   Surfacing something the user should know but need not act on immediately: a
 *   scheduled price increase, a missed alert, a stale exchange rate. Measured on
 *   the Home alert, node `4:2968`.
 *
 * Why it renders nothing until the API supplies a notice
 *   The prototype shows a price-increase alert on Home and on the detail
 *   screen, but price-change detection is Epic H and is not built. Hard-coding
 *   that alert would put a permanent, fictional warning in front of every user.
 *   So the component exists, the slot exists, and it stays empty until the
 *   server sends something — which is what `Dashboard.notice` is for.
 *
 * Accessibility
 *   Announced as an alert so a screen reader reports it on arrival rather than
 *   only when the user swipes onto it. The icon is decorative; the words carry
 *   the meaning, and the amber tint is reinforcement. When `onPress` is given
 *   the WHOLE CARD is the touch target, not the chevron.
 *
 * Why the body text is `text` and not `textMuted`
 *   The body is 12px, and muted grey on the flattened warning tint is 4.22:1 —
 *   an AA failure at that size. 02 §20 calls this out, and 01 §1 fixes the whole
 *   warning family to `text`.
 *
 * Design tokens (the warning family, 01 §1)
 *   layout      row, spacing.md (12) gap, spacing.lg (16) padding, radius.card (6)
 *   background  colors.warningSurface
 *   border      colors.warningBorder
 *   icon        colors.warning alert triangle at sizes.icon (20), on a
 *               sizes.warningIcon (40) colors.warningIconBg circle
 *   title       typography.alertTitle (DM Sans Bold 14/20, colors.text)
 *   body        typography.alertBody (DM Sans Medium 12/16, colors.text)
 *
 * Used by: Home (notice slot), Subscription detail (price-increase), Settings
 *          (rate unavailable).
 */
import { AlertTriangle, ChevronRight } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';

import { makeStyles, radius, sizes, spacing, useTheme } from '@/theme';

/**
 * Only one tone is measured. It is a prop rather than a constant so the amber is
 * not baked into every call site, and 02's later tones land here, not in a
 * second component.
 */
export type AlertTone = 'warning';

export interface AlertCardProps {
  /** The message. Written as a full sentence — it is the entire content. */
  message: string;

  /** Optional bold first line, with `message` becoming the detail beneath. */
  title?: string;

  tone?: AlertTone;

  /** Makes the whole card tappable and shows a chevron. */
  onPress?: () => void;

  /** What tapping leads to, e.g. "Opens the subscription". */
  accessibilityHint?: string;

  testID?: string;
}

export function AlertCard({
  message,
  title,
  tone = 'warning',
  onPress,
  accessibilityHint,
  testID,
}: AlertCardProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const body = (
    <View style={[styles.card, styles[tone]]}>
      <View style={styles.iconCircle}>
        <AlertTriangle
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
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: sizes.hairline,
    borderRadius: radius.card,
    padding: spacing.lg,
  },
  warning: {
    backgroundColor: colors.warningSurface,
    borderColor: colors.warningBorder,
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
    ...typography.alertTitle,
  },
  message: {
    ...typography.alertBody,
  },
}));
