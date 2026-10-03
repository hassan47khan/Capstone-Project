/**
 * Header — a screen's title area.
 *
 * What it is for
 *   Two shapes the design uses:
 *     tab   — a large serif title with a small eyebrow above it and an optional
 *             action at the right (Home's date + "Overview" + avatar)
 *     back  — a petrol back link naming where it returns to, with the title
 *             below (Subscription detail's "< Subscriptions")
 *
 * Why the back link names its destination
 *   "< Subscriptions" tells the user where they are going. A bare chevron, or
 *   the word "Back", does not — and for a screen-reader user a lone chevron is
 *   announced as nothing useful at all.
 *
 * Why the title is marked as a heading
 *   `accessibilityRole="header"` lets screen-reader users jump between sections
 *   with a rotor gesture instead of swiping through every element.
 *
 * Design tokens
 *   tab title   typography.screenTitle (32/38, Newsreader)
 *   eyebrow     typography.eyebrow (13, ink3)
 *   back link   typography.button in colors.accent
 *
 * Used by: every screen.
 */
import { ChevronLeft } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, opacity, sizes, spacing, typography } from '@/theme';

export interface HeaderProps {
  title: string;

  /** Small line above a tab title, such as today's date. */
  eyebrow?: string;

  /**
   * Where the back link goes, by name — "Subscriptions", "Settings". Supplying
   * this switches the header to its back variant.
   */
  backLabel?: string;
  onBack?: () => void;

  /** Rendered at the right of a tab header, such as the avatar or an Add button. */
  action?: ReactNode;

  testID?: string;
}

export function Header({
  title,
  eyebrow,
  backLabel,
  onBack,
  action,
  testID,
}: HeaderProps) {
  const isBackVariant = Boolean(backLabel && onBack);

  return (
    <View style={styles.container} testID={testID}>
      {isBackVariant ? (
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          // Names the destination, so the action is unambiguous when heard.
          accessibilityLabel={`Back to ${backLabel}`}
          style={({ pressed }) => [styles.back, pressed && styles.pressed]}
          testID={testID ? `${testID}-back` : undefined}
        >
          <ChevronLeft
            size={24}
            color={colors.accent}
            strokeWidth={1.7}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          />
          <Text style={styles.backLabel}>{backLabel}</Text>
        </Pressable>
      ) : null}

      <View style={styles.titleRow}>
        <View style={styles.titleText}>
          {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
          <Text
            style={styles.title}
            // Lets a rotor gesture jump straight here.
            accessibilityRole="header"
            // Capped: a 32pt serif at an unbounded multiplier wraps to four
            // lines and pushes the content off screen.
            maxFontSizeMultiplier={1.4}
          >
            {title}
          </Text>
        </View>

        {action ? <View style={styles.action}>{action}</View> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
  },
  back: {
    flexDirection: 'row',
    alignItems: 'center',
    // Full-height target: a chevron alone is far below 44pt.
    minHeight: sizes.minTouch,
    // Pulls the chevron's optical edge back to the gutter line.
    marginLeft: -spacing.sm,
    paddingLeft: spacing.xs,
    alignSelf: 'flex-start',
    paddingRight: spacing.md,
  },
  backLabel: {
    ...typography.button,
    color: colors.accent,
  },
  pressed: {
    opacity: opacity.pressed,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.lg,
  },
  titleText: {
    flex: 1,
    gap: spacing.xs,
  },
  eyebrow: {
    ...typography.eyebrow,
  },
  title: {
    ...typography.screenTitle,
  },
  action: {
    justifyContent: 'center',
  },
});
