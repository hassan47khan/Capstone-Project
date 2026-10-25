/**
 * Subscription detail (handoff 07 §4; US-7, US-16). Figma `4:3246`.
 *
 * One request: GET /subscriptions/{id}. It already includes the monthly
 * equivalent, the total spent and the history, all worked out by the server.
 * This screen only formats them.
 *
 * States (07 §9)
 *   loading     skeletons for the header, rows and chart
 *   loaded      header, detail rows, price history chart, Edit
 *   not found   "Not found" + Go back (404 means missing OR not yours)
 *   failed      full-screen error + Try again
 *   offline     the saved copy stays, with a note; Edit is disabled with a reason
 *
 * Not in this PR (come in later 07 PRs): Mark as cancelled, the ⋯ menu with
 * Delete, and Reactivate (no endpoint in the contract yet).
 */
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { ApiError } from '@/api/errors';
import { formatDateLong, formatMoney } from '@/api/format';
import { queryKeys } from '@/api/queryKeys';
import {
  Badge,
  Button,
  Card,
  CategoryBadge,
  ErrorState,
  Header,
  Screen,
  SectionHeader,
  ServiceMark,
  Skeleton,
  SkeletonGroup,
} from '@/components';
import type { AppStackParamList } from '@/navigation/types';
import { CATEGORY_SLUGS, makeStyles, sizes, spacing, type Category } from '@/theme';

import { getSubscription, type SubscriptionDetail } from './api';
import { describeCycle } from './formRules';
import { PriceHistoryChart } from './PriceHistoryChart';
import { buildPriceSeries, describePriceHistory } from './priceHistory';
import { utcToday } from './today';

export const DETAIL_COPY = {
  title: 'Subscription detail',
  priceHistory: 'Price history (last 12 months)',
  edit: 'Edit subscription',
  offlineEdit: 'Connect to the internet to edit.',
  stalePrefix: 'Showing saved details from',
  loading: 'Loading subscription',
} as const;

type Navigation = NativeStackNavigationProp<AppStackParamList>;
type Route = RouteProp<AppStackParamList, 'SubscriptionDetail'>;

// --- Small helpers ------------------------------------------------------------

/** The category slug as a known theme category, or null ("Uncategorized"). */
function knownCategory(slug: string | undefined): Category | null {
  return CATEGORY_SLUGS.find((c) => c === slug) ?? null;
}

/** "Active", "Trial" or "Cancelled", with the badge colour for each. */
function statusBadge(sub: SubscriptionDetail) {
  if (sub.status === 'cancelled') return { label: 'Cancelled', tone: 'neutral' as const };
  if (sub.is_trial) return { label: 'Trial', tone: 'warning' as const };
  return { label: 'Active', tone: 'success' as const };
}

function timeOf(epochMs: number): string {
  return new Date(epochMs).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

// --- The screen -------------------------------------------------------------

export function SubscriptionDetailScreen() {
  const styles = useStyles();
  const navigation = useNavigation<Navigation>();
  const { id } = useRoute<Route>().params;

  const detail = useQuery({
    queryKey: queryKeys.subscriptions.detail(id),
    queryFn: () => getSubscription(id),
  });

  const close = () => navigation.goBack();
  const header = <Header title={DETAIL_COPY.title} onClose={close} />;

  // Nothing loaded and it failed: one full-screen error.
  if (detail.isError && !detail.data) {
    const notFound = detail.error instanceof ApiError && detail.error.status === 404;
    return (
      <Screen edges={['top', 'bottom']} testID="detail-screen">
        {header}
        <ErrorState
          error={detail.error}
          // A 404 cannot be retried; its button says "Go back".
          onRetry={notFound ? close : () => detail.refetch()}
          testID="detail-error"
        />
      </Screen>
    );
  }

  // Still loading the first time.
  if (!detail.data) {
    return (
      <Screen edges={['top', 'bottom']} testID="detail-screen">
        {header}
        <SkeletonGroup label={DETAIL_COPY.loading} testID="detail-loading">
          <View style={styles.hero}>
            <Skeleton shape="mark" width={sizes.markLarge} height={sizes.markLarge} />
            <Skeleton width="50%" />
          </View>
          <Skeleton height={sizes.field * 4} />
          <Skeleton height={sizes.field * 2} />
        </SkeletonGroup>
      </Screen>
    );
  }

  const sub = detail.data;
  // A refresh failed but we still have the saved copy: keep showing it.
  const stale = detail.isError;
  const offline = stale && detail.error instanceof ApiError && detail.error.isOffline;
  const badge = statusBadge(sub);
  // UTC, the same clock as the history events (see priceHistory.ts).
  const series = buildPriceSeries(sub.history, sub.billing_price, utcToday());

  return (
    <Screen
      edges={['top', 'bottom']}
      testID="detail-screen"
      onRefresh={() => detail.refetch()}
      refreshing={detail.isRefetching}
      contentStyle={styles.content}
    >
      {header}

      {stale ? (
        <Text style={styles.note} accessibilityLiveRegion="polite" testID="detail-stale">
          {DETAIL_COPY.stalePrefix} {timeOf(detail.dataUpdatedAt)}
        </Text>
      ) : null}

      {/* Service mark, name and status (07 §4). */}
      <View style={styles.hero}>
        <ServiceMark
          name={sub.name}
          mark={sub.service_mark?.mark}
          brand={
            sub.service_mark
              ? { tint: sub.service_mark.tint_hex, ink: sub.service_mark.brand_hex }
              : undefined
          }
          size="large"
        />
        <Text style={styles.name} accessibilityRole="header">
          {sub.name}
        </Text>
        <Badge label={badge.label} tone={badge.tone} testID="detail-status" />
      </View>

      <DetailRows sub={sub} />

      {/* Price history (07 §4). */}
      <View style={styles.section}>
        <SectionHeader title={DETAIL_COPY.priceHistory} />
        <PriceHistoryChart
          series={series}
          currency={sub.billing_currency}
          // Describes the same 12 months the chart shows (07 §11).
          summary={describePriceHistory(series, sub.billing_currency)}
        />
      </View>

      {/* Actions. Cancel and Delete arrive with their sheets in a later PR. */}
      <View style={styles.section}>
        <Button
          label={DETAIL_COPY.edit}
          onPress={() => navigation.navigate('EditSubscription', { id: sub.id })}
          disabled={offline}
          accessibilityHint={offline ? DETAIL_COPY.offlineEdit : undefined}
          fullWidth
          testID="detail-edit"
        />
        {offline ? <Text style={styles.note}>{DETAIL_COPY.offlineEdit}</Text> : null}
      </View>
    </Screen>
  );
}

// --- The detail rows card ---------------------------------------------------

/** The rows in the card, in the measured order (07 §4). Empty ones are skipped. */
function DetailRows({ sub }: { sub: SubscriptionDetail }) {
  const styles = useStyles();
  const money = (amount: string, currency: string) =>
    formatMoney(amount, currency).display;

  const rows: { label: string; value: ReactNode; spoken: string; testID: string }[] = [];
  const add = (label: string, value: ReactNode, spoken: string, testID: string) =>
    rows.push({ label, value, spoken, testID });

  const price = money(sub.billing_price, sub.billing_currency);
  add('Current price', <Text style={styles.value}>{price}</Text>, price, 'row-price');

  const cycle = describeCycle(sub);
  add('Billing cycle', <Text style={styles.value}>{cycle}</Text>, cycle, 'row-cycle');

  const category = knownCategory(sub.category?.slug);
  add(
    'Category',
    <CategoryBadge category={category} />,
    sub.category?.display_name ?? 'Uncategorized',
    'row-category',
  );

  // Only when it differs from the price: a monthly plan's equivalent is itself.
  if (sub.billing_cycle !== 'monthly' && sub.normalized_monthly) {
    const monthly = money(sub.normalized_monthly.amount, sub.normalized_monthly.currency);
    add(
      'Monthly equivalent',
      <Text style={styles.value}>{`${monthly}/mo`}</Text>,
      `${monthly} per month`,
      'row-monthly',
    );
  }

  if (sub.next_bill_date) {
    const next = formatDateLong(sub.next_bill_date);
    add('Next renewal', <Text style={styles.value}>{next}</Text>, next, 'row-next');
  }

  // Hidden when empty (07 §4).
  if (sub.payment_label) {
    add(
      'Paid with',
      <Text style={styles.value}>{sub.payment_label}</Text>,
      sub.payment_label,
      'row-paid-with',
    );
  }

  const added = formatDateLong(sub.start_date);
  add('Date added', <Text style={styles.value}>{added}</Text>, added, 'row-added');

  // Never red: red is only for errors and destructive actions (07 §4, 01 §2).
  if (sub.total_spent_to_date) {
    const spent = money(sub.total_spent_to_date.amount, sub.total_spent_to_date.currency);
    add('Total spent', <Text style={styles.total}>{spent}</Text>, spent, 'row-total');
  }

  return (
    <Card style={styles.rows}>
      {rows.map((row, index) => (
        <View
          key={row.label}
          // Read as one item: "Current price, $15.49".
          accessible
          accessibilityLabel={`${row.label}, ${row.spoken}`}
          style={[styles.row, index < rows.length - 1 ? styles.divider : null]}
          testID={row.testID}
        >
          <Text style={styles.label}>{row.label}</Text>
          {row.value}
        </View>
      ))}
    </Card>
  );
}

const useStyles = makeStyles(({ colors, typography }) => ({
  content: {
    gap: spacing.xl,
    paddingBottom: spacing.lg,
  },
  // 07 §4: mark, then name and badge, centred, 12 apart.
  hero: {
    alignItems: 'center',
    gap: spacing.md,
  },
  name: {
    ...typography.displayMd,
    textAlign: 'center',
  },
  section: {
    gap: spacing.sm,
  },
  // 07 §4: no card padding; each row pads itself by 14.
  rows: {
    padding: 0,
    gap: 0,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
    // TODO(tokens): 07 §4 measures 14; the scale has 12 and 16.
    padding: spacing.md + 2,
  },
  divider: {
    borderBottomWidth: sizes.hairline,
    borderBottomColor: colors.border,
  },
  label: {
    ...typography.labelMd,
    color: colors.textMuted,
  },
  value: {
    ...typography.labelMd,
    color: colors.text,
    flexShrink: 1,
    textAlign: 'right',
  },
  // 07 §4: DM Serif 18/24.
  total: {
    ...typography.displaySm,
    color: colors.text,
  },
  note: {
    ...typography.caption,
    color: colors.textMuted,
  },
}));
