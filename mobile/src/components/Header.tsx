/**
 * Header — a screen's title bar (handoff 03 §4).
 *
 * What it is for
 *   Every screen's top bar: an optional leading back or close control, the
 *   title, and an optional trailing action.
 *
 * Left-aligned, everywhere
 *   The prototype mixed centred titles (Edit Subscription, Subscription Detail)
 *   with left-aligned ones. Left wins — it matches Settings and the dashboard,
 *   the most-visited screens — and there is no prop to centre it.
 *
 * Back vs close
 *   A pushed screen gets a back chevron, announced as "Back to <where>" so the
 *   destination is clear when heard. A modal (Add Subscription, 03 §3 rule 1)
 *   gets a close (X) instead — the prototype had neither, leaving the user no
 *   way out but the system gesture.
 *
 * Touch targets
 *   The back/close button is 32 × 32 to the eye and 44 × 44 to the finger
 *   (hitSlop), as 03 §4 requires.
 *
 * Why the title is marked as a heading
 *   `accessibilityRole="header"` lets screen-reader users jump between sections
 *   with a rotor gesture instead of swiping through every element.
 *
 * Design tokens
 *   height      sizes.header (56)
 *   title       typography.displaySm (DM Serif Display 20/28), left-aligned.
 *               03 §4 normalizes the measured 18/20/24 titles to 20.
 *   back/close  sizes.headerButton (32), sizes.iconSmall (16) icon, colors.text
 *   trailing    sizes.headerButton (32) slot
 */
import { ChevronLeft, X } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { makeStyles, radius, sizes, spacing, useTheme } from '@/theme';

export interface HeaderProps {
  title: string;

  /**
   * Where the back button goes, by name — "Settings", "Home". Announced as
   * "Back to Settings". Supplying it with `onBack` shows the back button.
   */
  backLabel?: string;
  onBack?: () => void;

  /** Shows a close (X) button instead of back — for modals. */
  onClose?: () => void;
  /** What the close button dismisses, for its accessible name. Default "Close". */
  closeLabel?: string;

  /** Rendered at the right, in a 32pt slot. Callers keep it 44pt to the finger. */
  action?: ReactNode;

  testID?: string;
}

const HIT_SLOP = (sizes.minTouch - sizes.headerButton) / 2;

export function Header({
  title,
  backLabel,
  onBack,
  onClose,
  closeLabel = 'Close',
  action,
  testID,
}: HeaderProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const showBack = Boolean(backLabel && onBack) && !onClose;

  return (
    <View style={styles.bar} testID={testID}>
      {onClose ? (
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={closeLabel}
          hitSlop={HIT_SLOP}
          style={({ pressed }) => [styles.button, pressed && styles.pressed]}
          testID={testID ? `${testID}-close` : 'header-close'}
        >
          <X size={sizes.iconSmall} color={colors.text} strokeWidth={2} />
        </Pressable>
      ) : null}

      {showBack ? (
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          // Names the destination, so the action is unambiguous when heard.
          accessibilityLabel={`Back to ${backLabel}`}
          hitSlop={HIT_SLOP}
          style={({ pressed }) => [styles.button, pressed && styles.pressed]}
          testID={testID ? `${testID}-back` : 'header-back'}
        >
          <ChevronLeft size={sizes.iconSmall} color={colors.text} strokeWidth={2} />
        </Pressable>
      ) : null}

      <Text
        style={styles.title}
        numberOfLines={1}
        // Lets a rotor gesture jump straight here.
        accessibilityRole="header"
        // Capped: the serif title at an unbounded multiplier would burst a
        // fixed-height bar.
        maxFontSizeMultiplier={1.4}
        testID={testID ? `${testID}-title` : 'header-title'}
      >
        {title}
      </Text>

      {action ? <View style={styles.action}>{action}</View> : null}
    </View>
  );
}

const useStyles = makeStyles(({ colors, typography }) => ({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: sizes.header,
    gap: spacing.sm,
  },
  button: {
    width: sizes.headerButton,
    height: sizes.headerButton,
    borderRadius: radius.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    backgroundColor: colors.surface2,
  },
  title: {
    ...typography.displaySm,
    flex: 1,
    textAlign: 'left',
  },
  action: {
    minWidth: sizes.headerButton,
    minHeight: sizes.headerButton,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));
