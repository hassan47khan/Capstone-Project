/**
 * The AI insight card, first on Analytics (handoff 08 §2.0, Figma `4:3036`).
 *
 * A single Card: a lightbulb and a label in `accent`, then the server's one
 * sentence, as sent. "AI insight" only when the model worded it (`generated`);
 * the template fallback says "Insight", so the label never claims an AI wrote
 * something it didn't.
 *
 * An insight about one subscription (a price rise, a trial about to convert)
 * opens it; a category insight has nothing to open, so it is plain text.
 *
 * The card is an optional extra, so it never shows a skeleton or an error: the
 * screen renders it only once there is an insight to show.
 */
import { Lightbulb } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';

import { Card } from '@/components';
import { makeStyles, sizes, spacing, useTheme } from '@/theme';

import type { Insight } from './insight';

export const INSIGHT_COPY = {
  generated: 'AI insight',
  template: 'Insight',
  opensHint: 'Opens the subscription',
} as const;

export interface InsightCardProps {
  insight: Insight;
  /** Opens a subscription; used only when the insight is about one. */
  onOpen: (subscriptionId: string) => void;
}

export function InsightCard({ insight, onOpen }: InsightCardProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const label = insight.generated ? INSIGHT_COPY.generated : INSIGHT_COPY.template;
  const subscriptionId = insight.subscription_id;

  const content = (pressed = false) => (
    <Card style={[styles.card, pressed && styles.pressed]}>
      <View style={styles.labelRow}>
        <Lightbulb
          size={sizes.iconSmall}
          color={colors.accent}
          strokeWidth={2}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
        <Text style={styles.label}>{label}</Text>
      </View>
      <Text style={styles.text}>{insight.text}</Text>
    </Card>
  );

  // One element for a screen reader: "AI insight. Netflix rose $1.50 on Oct 1…"
  const spoken = `${label}. ${insight.text}`;

  return subscriptionId ? (
    <Pressable
      onPress={() => onOpen(subscriptionId)}
      accessibilityRole="button"
      accessibilityLabel={spoken}
      accessibilityHint={INSIGHT_COPY.opensHint}
      testID="analytics-insight"
    >
      {({ pressed }) => content(pressed)}
    </Pressable>
  ) : (
    <View accessible accessibilityLabel={spoken} testID="analytics-insight">
      {content()}
    </View>
  );
}

const useStyles = makeStyles(({ colors, typography }) => ({
  card: {
    gap: spacing.sm,
  },
  pressed: {
    backgroundColor: colors.surface2,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  label: {
    ...typography.labelSemibold,
    color: colors.accent,
  },
  text: {
    ...typography.bodyLg,
  },
}));
