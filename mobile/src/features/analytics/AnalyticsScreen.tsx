/**
 * Analytics tab (handoff 08, board card #99; US-16 comes with spend over time).
 *
 * Insight first, list last (08 §1): the spend-over-time headline with the
 * projected yearly spend (§2.1, US-16), then "Spending by category" with the
 * monthly total (§2.2, §2.3), then the subscription list, last (§2.4). Still
 * to come: the AI insight card at the top (§2.0, once GET /analytics/insight
 * exists).
 *
 * Each section loads, fails and retries on its own (08 §4).
 *
 * The header has no Add button: the FAB is the only way to add (03 §2).
 *
 * States (08 §4)
 *   loading     a skeleton per section
 *   empty       no subscriptions: "Nothing to analyze yet" + Add
 *   error       the section's own error with Try again (nothing saved to show)
 *   stale       a refresh failed: the saved figures stay, with when they're from
 */
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { BarChart3 } from 'lucide-react-native';
import { Text } from 'react-native';

import type { AnalyticsSummary } from '@/api/analyticsTypes';
import { analyticsApi } from '@/api/endpoints';
import { formatTimeOfDay } from '@/api/format';
import { queryKeys } from '@/api/queryKeys';
import {
  EmptyState,
  ErrorState,
  Header,
  Screen,
  Skeleton,
  SkeletonGroup,
} from '@/components';
import type { AppStackParamList } from '@/navigation/types';
import { makeStyles, sizes } from '@/theme';

import { listSubscriptions } from '@/features/subscriptions/api';

import { CategoryCard } from './CategoryCard';
import { SpendTrend } from './SpendTrend';
import { SubscriptionList } from './SubscriptionList';

export const ANALYTICS_COPY = {
  title: 'Analytics',
  loading: 'Loading spending by category',
  loadingSpend: 'Loading spending over time',
  loadingList: 'Loading your subscriptions',
  emptyTitle: 'Nothing to analyze yet',
  emptyMessage: 'Add a subscription and your spending shows up here.',
  emptyAction: 'Add a subscription',
  stalePrefix: 'Showing saved figures from',
} as const;

type Navigation = NativeStackNavigationProp<AppStackParamList>;

// 08 §2.1: a 12-month trend.
const SPEND_MONTHS = 12;

export function AnalyticsScreen() {
  const styles = useStyles();
  const navigation = useNavigation<Navigation>();
  // The same request and key as Home, so the two always agree (08 §3).
  const summary = useQuery({
    queryKey: queryKeys.analytics.summary(),
    queryFn: analyticsApi.getSummary,
  });
  const spend = useQuery({
    queryKey: queryKeys.analytics.spendOverTime(SPEND_MONTHS),
    queryFn: () => analyticsApi.getSpendOverTime(SPEND_MONTHS),
  });
  // The same list query as the Add screen's duplicate-name check.
  const list = useQuery({
    queryKey: queryKeys.subscriptions.list(),
    queryFn: listSubscriptions,
  });
  const sections = [spend, summary, list];

  const data = summary.data;
  // Nothing to show at all. active_count only counts subscriptions the server
  // can convert, so one in a currency with no rate (e.g. only ARS) counts in
  // unconverted_count instead: that's not empty, it gets the "left out" note.
  const empty =
    data &&
    data.active_count === 0 &&
    data.trial_count === 0 &&
    data.unconverted_count === 0;
  // A refresh failed but saved figures are still showing: say how old they are.
  const stale = sections.find((q) => q.isError && q.data);

  return (
    <Screen
      testID="analytics-screen"
      onRefresh={() => sections.forEach((q) => q.refetch())}
      refreshing={sections.some((q) => q.isRefetching)}
    >
      <Header title={ANALYTICS_COPY.title} />

      {stale ? (
        <Text
          style={styles.note}
          accessibilityLiveRegion="polite"
          testID="analytics-stale"
        >
          {ANALYTICS_COPY.stalePrefix} {formatTimeOfDay(stale.dataUpdatedAt)}
        </Text>
      ) : null}

      {empty ? (
        <EmptyState
          icon={BarChart3}
          title={ANALYTICS_COPY.emptyTitle}
          message={ANALYTICS_COPY.emptyMessage}
          actionLabel={ANALYTICS_COPY.emptyAction}
          onAction={() => navigation.navigate('AddSubscription')}
          testID="analytics-empty"
        />
      ) : (
        <>
          {/* 08 §2.1: the headline, first on the screen. */}
          {spend.data ? (
            <SpendTrend spend={spend.data} annual={data?.annual_total} />
          ) : spend.isError ? (
            <ErrorState
              error={spend.error}
              onRetry={() => spend.refetch()}
              testID="analytics-spend-error"
            />
          ) : (
            <SkeletonGroup
              label={ANALYTICS_COPY.loadingSpend}
              testID="analytics-spend-loading"
            >
              <Skeleton height={sizes.field * 3} />
            </SkeletonGroup>
          )}

          <CategorySection summary={summary} />

          {/* 08 §2.4: the list, demoted to last. */}
          {list.data ? (
            <SubscriptionList rows={list.data} />
          ) : list.isError ? (
            <ErrorState
              error={list.error}
              onRetry={() => list.refetch()}
              testID="analytics-list-error"
            />
          ) : (
            <SkeletonGroup
              label={ANALYTICS_COPY.loadingList}
              testID="analytics-list-loading"
            >
              <Skeleton height={sizes.rowSubscription} />
              <Skeleton height={sizes.rowSubscription} />
            </SkeletonGroup>
          )}
        </>
      )}
    </Screen>
  );
}

// "Spending by category" with its own loading and error (08 §4).
function CategorySection({
  summary,
}: {
  summary: ReturnType<typeof useQuery<AnalyticsSummary>>;
}) {
  return summary.data ? (
    <CategoryCard summary={summary.data} />
  ) : summary.isError ? (
    <ErrorState
      error={summary.error}
      onRetry={() => summary.refetch()}
      testID="analytics-error"
    />
  ) : (
    <SkeletonGroup label={ANALYTICS_COPY.loading} testID="analytics-loading">
      <Skeleton height={sizes.field} />
      <Skeleton height={sizes.field * 4} />
    </SkeletonGroup>
  );
}

const useStyles = makeStyles(({ colors, typography }) => ({
  note: {
    ...typography.caption,
    color: colors.textMuted,
  },
}));
