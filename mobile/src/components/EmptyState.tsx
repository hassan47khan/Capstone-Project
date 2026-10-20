/**
 * EmptyState — what a screen shows when there is nothing to show (handoff 02 §14).
 *
 * What it is for
 *   The first-run Home, an Analytics screen with no data, a search that matched
 *   nothing. "No screen renders a blank frame" is a non-negotiable rule (00).
 *
 * Why the action is optional
 *   "No subscriptions yet" with an Add button is an invitation. "No results for
 *   'xyz'" with a button would be nonsense — the user should change their search,
 *   not create something. So the call to action is offered, never assumed.
 *
 * Accessibility
 *   The title and message are announced together as one stop, so the
 *   explanation arrives with the heading. The button stays a separate stop — if
 *   it were inside the grouped element a screen reader could never reach it.
 *
 * Design tokens
 *   icon     sizes.iconLarge (48), colors.textMuted
 *   title    typography.displayMd
 *   body     typography.bodyMd in colors.textMuted
 *   width    sizes.proseWidth (280) max, centred
 */
import type { LucideIcon } from 'lucide-react-native';
import { Text, View } from 'react-native';

import { makeStyles, sizes, spacing, useTheme } from '@/theme';

import { Button } from './Button';

export interface EmptyStateProps {
  /** A short statement of fact: "No subscriptions yet". */
  title: string;

  /** One sentence saying what to do about it. */
  message: string;

  /** A lucide icon drawn above the title. Decorative. */
  icon?: LucideIcon;

  /** Label for the call to action. Omit for a state with nothing to offer. */
  actionLabel?: string;
  onAction?: () => void;

  testID?: string;
}

export function EmptyState({
  title,
  message,
  icon: Icon,
  actionLabel,
  onAction,
  testID,
}: EmptyStateProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.container} testID={testID}>
      {Icon ? (
        <Icon
          size={sizes.iconLarge}
          color={colors.textMuted}
          strokeWidth={1.5}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
      ) : null}

      <View style={styles.text} accessible accessibilityLabel={`${title}. ${message}`}>
        <Text style={styles.title} accessibilityRole="header">
          {title}
        </Text>
        <Text style={styles.message}>{message}</Text>
      </View>

      {actionLabel && onAction ? (
        <Button
          label={actionLabel}
          onPress={onAction}
          variant="primary"
          testID={testID ? `${testID}-action` : undefined}
        />
      ) : null}
    </View>
  );
}

const useStyles = makeStyles(({ colors, typography }) => ({
  container: {
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: sizes.proseWidth,
    gap: spacing.lg,
    paddingVertical: spacing.xxl * 2,
  },
  text: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: {
    ...typography.displayMd,
    textAlign: 'center',
  },
  message: {
    ...typography.bodyMd,
    color: colors.textMuted,
    textAlign: 'center',
  },
}));
