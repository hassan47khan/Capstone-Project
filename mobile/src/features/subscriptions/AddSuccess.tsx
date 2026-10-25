// "Subscription added" screen shown after saving (07 §3, Figma `4:3587`).
import { Check } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Animated, Text, View } from 'react-native';

import { formatMoney } from '@/api/format';
import { Button, Card, CategoryBadge, ServiceMark } from '@/components';
import { CATEGORY_SLUGS, makeStyles, sizes, spacing, useMotion, useTheme } from '@/theme';

import type { SubscriptionDetail } from './api';
import { describeCycle } from './formRules';

export const SUCCESS_COPY = {
  title: 'Subscription added',
  body: (name: string) => `${name} has been added to your subscriptions.`,
  billingPrice: 'Billing price',
  frequency: 'Frequency',
  viewDashboard: 'View on Dashboard',
  addAnother: 'Add another',
} as const;

export interface AddSuccessProps {
  created: SubscriptionDetail; // what the server sent back
  onViewDashboard: () => void;
  onAddAnother: () => void;
}

export function AddSuccess({ created, onViewDashboard, onAddAnother }: AddSuccessProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const m = useMotion();
  const [opacity] = useState(() => new Animated.Value(m.moves ? 0 : 1));

  // Fade in (skipped under reduced motion).
  useEffect(() => {
    if (!m.moves) return;
    Animated.timing(opacity, {
      toValue: 1,
      duration: m.successFade,
      easing: m.easeOut,
      useNativeDriver: true,
    }).start();
  }, [opacity, m]);

  const price = formatMoney(created.billing_price, created.billing_currency).display;
  const cycle = describeCycle(created);
  const category = CATEGORY_SLUGS.find((c) => c === created.category?.slug) ?? null;
  // Only for non-monthly plans: on a monthly plan it would just repeat the price
  // (same rule as the Detail screen's "Monthly equivalent" row).
  const monthly =
    created.billing_cycle !== 'monthly' && created.normalized_monthly
      ? formatMoney(
          created.normalized_monthly.amount,
          created.normalized_monthly.currency,
        ).display
      : null;

  return (
    <Animated.View style={[styles.container, { opacity }]} testID="add-success">
      {/* Decorative: hidden from screen readers on iOS and Android. */}
      <View
        style={styles.circle}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        testID="add-success-icon"
      >
        <Check size={sizes.iconSuccess} color={colors.success} />
      </View>

      <View style={styles.text}>
        <Text style={styles.title} accessibilityRole="header">
          {SUCCESS_COPY.title}
        </Text>
        <Text style={styles.body}>{SUCCESS_COPY.body(created.name)}</Text>
      </View>

      {/* Summary card */}
      <Card style={styles.card}>
        <View style={styles.service}>
          <ServiceMark
            name={created.name}
            mark={created.service_mark?.mark}
            brand={
              created.service_mark
                ? {
                    tint: created.service_mark.tint_hex,
                    ink: created.service_mark.brand_hex,
                  }
                : undefined
            }
            size="medium"
          />
          <View style={styles.serviceText}>
            <Text style={styles.name} numberOfLines={1}>
              {created.name}
            </Text>
            <CategoryBadge category={category} />
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.columns}>
          <View
            style={styles.column}
            accessible
            accessibilityLabel={`${SUCCESS_COPY.billingPrice}, ${price}`}
          >
            <Text style={styles.label}>{SUCCESS_COPY.billingPrice}</Text>
            <Text style={styles.value}>{price}</Text>
          </View>
          <View
            style={[styles.column, styles.right]}
            accessible
            accessibilityLabel={`${SUCCESS_COPY.frequency}, ${cycle}`}
          >
            <Text style={styles.label}>{SUCCESS_COPY.frequency}</Text>
            <Text style={[styles.value, styles.rightText]}>{cycle}</Text>
          </View>
        </View>

        {/* Required: what a non-monthly plan adds to the monthly total. */}
        {monthly ? (
          <Text
            style={styles.monthly}
            accessibilityLabel={`About ${monthly} per month`}
            testID="add-success-monthly"
          >
            ≈ {monthly}/mo
          </Text>
        ) : null}
      </Card>

      <View style={styles.actions}>
        <Button
          label={SUCCESS_COPY.viewDashboard}
          onPress={onViewDashboard}
          fullWidth
          testID="add-success-dashboard"
        />
        <Button
          label={SUCCESS_COPY.addAnother}
          onPress={onAddAnother}
          variant="secondary"
          fullWidth
          testID="add-success-another"
        />
      </View>
    </Animated.View>
  );
}

const useStyles = makeStyles(({ colors, typography }) => ({
  // 07 §3: top 80, gap 32 between blocks, bottom 32.
  container: {
    alignItems: 'center',
    gap: spacing.xxl + spacing.sm,
    paddingTop: sizes.successTop,
    paddingBottom: spacing.xxl + spacing.sm,
  },
  circle: {
    width: sizes.successCircle,
    height: sizes.successCircle,
    borderRadius: sizes.successCircle / 2,
    backgroundColor: colors.successSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: {
    ...typography.displayMd,
    textAlign: 'center',
  },
  body: {
    ...typography.bodyLg,
    color: colors.textMuted,
    textAlign: 'center',
  },
  card: {
    alignSelf: 'stretch',
    padding: spacing.xl,
    gap: spacing.lg,
  },
  service: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  serviceText: {
    flex: 1,
    gap: spacing.xs,
  },
  name: {
    ...typography.labelBold,
  },
  divider: {
    height: sizes.hairline,
    backgroundColor: colors.border,
  },
  // Gap + shrinking columns, so large text wraps instead of overlapping.
  columns: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  column: {
    flexShrink: 1,
  },
  right: {
    alignItems: 'flex-end',
  },
  rightText: {
    textAlign: 'right',
  },
  label: {
    ...typography.sectionLabel,
  },
  value: {
    ...typography.labelMd,
  },
  monthly: {
    ...typography.labelSemibold,
    color: colors.textMuted,
  },
  actions: {
    alignSelf: 'stretch',
    gap: spacing.md,
  },
}));
