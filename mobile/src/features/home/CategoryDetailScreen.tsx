/**
 * One category, opened by tapping its bar on Home.
 *
 * What it shows
 *   The category's monthly spend and its share, both from GET /analytics/summary
 *   (the same query as Home, so the figures match), then the active
 *   subscriptions in the category from GET /subscriptions. Tapping a row opens
 *   that subscription's Detail.
 *
 * The client adds nothing up: the total and the percent are the server's.
 * Cancelled subscriptions are left out because they no longer count toward the
 * total above them.
 *
 * States
 *   loading     skeletons for the figure and the list
 *   error       ErrorState with Try again, per section
 *   empty       "No subscriptions in {name}" (e.g. the last one was just moved)
 */
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { Layers } from 'lucide-react-native';
import { Text, View } from 'react-native';

import { analyticsApi } from '@/api/endpoints';
import { formatMoney } from '@/api/format';
import { queryKeys } from '@/api/queryKeys';
import {
  Amount,
  Card,
  EmptyState,
  ErrorState,
  Header,
  ListRow,
  Screen,
  SectionHeader,
  Skeleton,
  SkeletonGroup,
} from '@/components';
import { rowCycle } from '@/features/analytics/listGroups';
import { listSubscriptions, type SubscriptionRow } from '@/features/subscriptions/api';
import type { AppStackParamList } from '@/navigation/types';
import { makeStyles, sizes, spacing } from '@/theme';

import { slugFor, UNCATEGORIZED_SLUG } from './CategoryBars';

export const CATEGORY_DETAIL_COPY = {
  back: 'Home',
  perMonth: 'Per month',
  share: (percent: number) => `${percent}% of your monthly spending`,
  count: (n: number) => (n === 1 ? '1 subscription' : `${n} subscriptions`),
  list: 'Subscriptions',
  loadingTotal: 'Loading the category total',
  loadingList: 'Loading subscriptions',
  emptyTitle: (name: string) => `No subscriptions in ${name}`,
  emptyMessage: 'Active subscriptions in this category show up here.',
} as const;

type Navigation = NativeStackNavigationProp<AppStackParamList>;
type Route = RouteProp<AppStackParamList, 'CategoryDetail'>;

/** Active subscriptions in the category, in the server's order (soonest bill first). */
export function rowsInCategory(
  rows: readonly SubscriptionRow[],
  slug: string,
): SubscriptionRow[] {
  return rows.filter(
    (row) =>
      row.status === 'active' && (row.category?.slug ?? UNCATEGORIZED_SLUG) === slug,
  );
}

export function CategoryDetailScreen() {
  const styles = useStyles();
  const navigation = useNavigation<Navigation>();
  const { slug, name } = useRoute<Route>().params;

  // The same keys as Home and Analytics, so this opens from cache.
  const summary = useQuery({
    queryKey: queryKeys.analytics.summary(),
    queryFn: analyticsApi.getSummary,
  });
  const list = useQuery({
    queryKey: queryKeys.subscriptions.list(),
    queryFn: listSubscriptions,
  });

  const spend = summary.data?.categories.find((row) => slugFor(row) === slug);
  const rows = list.data ? rowsInCategory(list.data, slug) : [];

  return (
    <Screen
      edges={['top', 'bottom']}
      testID="category-detail-screen"
      onRefresh={() => {
        summary.refetch();
        list.refetch();
      }}
      refreshing={summary.isRefetching || list.isRefetching}
      contentStyle={styles.content}
    >
      <Header
        title={name}
        backLabel={CATEGORY_DETAIL_COPY.back}
        onBack={() => navigation.goBack()}
      />

      {summary.data ? (
        spend ? (
          <Card
            style={styles.total}
            testID="category-detail-total"
            accessibilityLabel={`${name}, ${
              formatMoney(spend.amount.amount, spend.amount.currency).display
            } per month, ${CATEGORY_DETAIL_COPY.share(spend.percent)}.`}
          >
            <Text style={styles.eyebrow}>{CATEGORY_DETAIL_COPY.perMonth}</Text>
            <Amount
              value={spend.amount.amount}
              currency={spend.amount.currency}
              size="large"
            />
            <Text style={styles.caption}>
              {CATEGORY_DETAIL_COPY.share(spend.percent)}
            </Text>
          </Card>
        ) : null
      ) : summary.isError ? (
        <ErrorState
          error={summary.error}
          onRetry={() => summary.refetch()}
          testID="category-detail-total-error"
        />
      ) : (
        <SkeletonGroup
          label={CATEGORY_DETAIL_COPY.loadingTotal}
          testID="category-detail-total-loading"
        >
          <Skeleton height={sizes.field * 2} />
        </SkeletonGroup>
      )}

      <View style={styles.section}>
        {list.data ? (
          rows.length > 0 ? (
            <>
              <SectionHeader
                title={`${CATEGORY_DETAIL_COPY.list} · ${CATEGORY_DETAIL_COPY.count(rows.length)}`}
              />
              {rows.map((row) => (
                <ListRow
                  key={row.id}
                  name={row.name}
                  price={row.billing_price}
                  currency={row.billing_currency}
                  cycle={rowCycle(row)}
                  nextBillOn={row.next_bill_date}
                  mark={row.service_mark?.mark}
                  brand={
                    row.service_mark
                      ? {
                          tint: row.service_mark.tint_hex,
                          ink: row.service_mark.brand_hex,
                        }
                      : undefined
                  }
                  onPress={() =>
                    navigation.navigate('SubscriptionDetail', { id: row.id })
                  }
                  testID={`category-detail-row-${row.id}`}
                />
              ))}
            </>
          ) : (
            <EmptyState
              icon={Layers}
              title={CATEGORY_DETAIL_COPY.emptyTitle(name)}
              message={CATEGORY_DETAIL_COPY.emptyMessage}
              testID="category-detail-empty"
            />
          )
        ) : list.isError ? (
          <ErrorState
            error={list.error}
            onRetry={() => list.refetch()}
            testID="category-detail-list-error"
          />
        ) : (
          <SkeletonGroup
            label={CATEGORY_DETAIL_COPY.loadingList}
            testID="category-detail-list-loading"
          >
            <Skeleton height={sizes.rowSubscription} />
            <Skeleton height={sizes.rowSubscription} />
          </SkeletonGroup>
        )}
      </View>
    </Screen>
  );
}

const useStyles = makeStyles(({ colors, typography }) => ({
  content: {
    gap: spacing.lg,
  },
  total: {
    gap: spacing.xs,
    padding: spacing.lg,
  },
  eyebrow: {
    ...typography.sectionLabel,
    color: colors.textMuted,
  },
  caption: {
    ...typography.caption,
    color: colors.textMuted,
  },
  section: {
    gap: spacing.sm,
  },
}));
