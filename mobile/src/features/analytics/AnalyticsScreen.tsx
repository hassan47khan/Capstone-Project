/**
 * Analytics tab (handoff 08, board card #99; US-16 comes with spend over time).
 *
 * Insight first, list last (08 §1). This first part is "Spending by category"
 * with the monthly total (08 §2.2, §2.3). Still to come, in their own PRs: the
 * spend-over-time chart above it (§2.1), the subscription list below it (§2.4),
 * and the AI insight card at the top (§2.0, once GET /analytics/insight exists).
 *
 * The header has no Add button: the FAB is the only way to add (03 §2).
 *
 * States (08 §4)
 *   loading     a skeleton for the section
 *   empty       no subscriptions: "Nothing to analyze yet" + Add
 *   error       the section's own error with Try again (nothing saved to show)
 *   stale       a refresh failed: the saved figures stay, with when they're from
 */
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { BarChart3 } from 'lucide-react-native';
import { Text } from 'react-native';

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

import { CategoryCard } from './CategoryCard';

export const ANALYTICS_COPY = {
  title: 'Analytics',
  loading: 'Loading spending by category',
  emptyTitle: 'Nothing to analyze yet',
  emptyMessage: 'Add a subscription and your spending shows up here.',
  emptyAction: 'Add a subscription',
  stalePrefix: 'Showing saved figures from',
} as const;

type Navigation = NativeStackNavigationProp<AppStackParamList>;

export function AnalyticsScreen() {
  const styles = useStyles();
  const navigation = useNavigation<Navigation>();
  // The same request and key as Home, so the two always agree (08 §3).
  const summary = useQuery({
    queryKey: queryKeys.analytics.summary(),
    queryFn: analyticsApi.getSummary,
  });

  const data = summary.data;
  // The same rule as Home's empty state (06 §6): nothing active, no trials.
  const empty = data && data.active_count === 0 && data.trial_count === 0;

  return (
    <Screen
      testID="analytics-screen"
      onRefresh={() => summary.refetch()}
      refreshing={summary.isRefetching}
    >
      <Header title={ANALYTICS_COPY.title} />

      {summary.isError && data ? (
        <Text
          style={styles.note}
          accessibilityLiveRegion="polite"
          testID="analytics-stale"
        >
          {ANALYTICS_COPY.stalePrefix} {formatTimeOfDay(summary.dataUpdatedAt)}
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
      ) : data ? (
        <CategoryCard summary={data} />
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
      )}
    </Screen>
  );
}

const useStyles = makeStyles(({ colors, typography }) => ({
  note: {
    ...typography.caption,
    color: colors.textMuted,
  },
}));
