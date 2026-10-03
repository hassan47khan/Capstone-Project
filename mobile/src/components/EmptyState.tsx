/**
 * EmptyState — what a screen shows when there is nothing to show.
 *
 * What it is for
 *   The first-run Home and Subscriptions screens, an Insights screen with no
 *   data, a search that matched nothing.
 *
 * Why it is a component and not a line of text per screen
 *   Empty states are the single most common omission in a wireframe — the
 *   prototype does not draw one — and they are the first thing a new user sees.
 *   A shared component means a new screen gets a decent one by default, and the
 *   review checklist has something concrete to check against.
 *
 * Why the action is optional
 *   "No subscriptions yet" with an Add button is an invitation. "No results for
 *   'xyz'" with a button would be nonsense — the user should change their search,
 *   not create something. So the call to action is offered, never assumed.
 *
 * Design tokens
 *   title    typography.rowTitle
 *   body     typography.body, centred
 *   spacing  spacing.xl between elements
 *
 * Used by: Home, Subscriptions, Insights, Currency search.
 */
import { StyleSheet, Text, View } from 'react-native';

import { spacing, typography } from '@/theme';

import { Button } from './Button';

export interface EmptyStateProps {
  /** A short statement of fact: "No subscriptions yet". */
  title: string;

  /** One sentence saying what to do about it. */
  message: string;

  /** Label for the call to action. Omit for a state with nothing to offer. */
  actionLabel?: string;
  onAction?: () => void;

  testID?: string;
}

export function EmptyState({
  title,
  message,
  actionLabel,
  onAction,
  testID,
}: EmptyStateProps) {
  return (
    <View
      style={styles.container}
      // Announced as a group, so the explanation arrives with the heading rather
      // than as a second, disconnected stop.
      accessible
      accessibilityLabel={`${title}. ${message}`}
      testID={testID}
    >
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>

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

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xxl * 2,
    paddingHorizontal: spacing.xl,
  },
  title: {
    ...typography.rowTitle,
    textAlign: 'center',
  },
  message: {
    ...typography.body,
    textAlign: 'center',
    // Keeps a line of prose at a readable measure instead of stretching it the
    // full width of a tablet.
    maxWidth: 280,
    marginBottom: spacing.sm,
  },
});
