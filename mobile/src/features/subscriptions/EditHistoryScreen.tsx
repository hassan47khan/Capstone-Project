/**
 * Edit history (handoff 07 §6; US-7). Figma `4:4271`.
 *
 * Every recorded change, newest first, from GET /subscriptions/{id}/history.
 * The server writes these; the client only shows them.
 *
 * States (07 §9)
 *   loading            3 skeleton rows
 *   only creation      "No changes since you added this."
 *   loaded             one card per change: date, badge, sentence
 *   not found / error  full-screen error (a 404 can only go back)
 */
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { History } from 'lucide-react-native';
import { Text, View } from 'react-native';

import { ApiError } from '@/api/errors';
import { queryKeys } from '@/api/queryKeys';
import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  Header,
  Screen,
  SkeletonGroup,
  SkeletonRow,
} from '@/components';
import type { AppStackParamList } from '@/navigation/types';
import { makeStyles, spacing } from '@/theme';

import { getSubscription, getSubscriptionHistory, historyQueryKey } from './api';
import { historyLines, onlyCreation } from './historyLines';

export const HISTORY_COPY = {
  title: 'Edit history',
  titleFor: (name: string) => `Edit history — ${name}`,
  loading: 'Loading history',
  emptyTitle: 'No changes yet',
  emptyBody: 'No changes since you added this.',
} as const;

type Route = RouteProp<AppStackParamList, 'EditHistory'>;

export function EditHistoryScreen() {
  const styles = useStyles();
  const navigation = useNavigation();
  const { id } = useRoute<Route>().params;
  const close = () => navigation.goBack();

  const history = useQuery({
    queryKey: historyQueryKey(id),
    queryFn: () => getSubscriptionHistory(id),
  });
  // For the name in the title and the billing currency (usually already cached by Detail).
  const detail = useQuery({
    queryKey: queryKeys.subscriptions.detail(id),
    queryFn: () => getSubscription(id),
  });

  const name = detail.data?.name;
  const header = (
    <Header
      title={name ? HISTORY_COPY.titleFor(name) : HISTORY_COPY.title}
      onClose={close}
    />
  );

  // Either request failed: one full-screen error (a 404 can only go back).
  // Both are checked, or a failed detail would leave the skeleton up forever.
  const failed =
    (history.isError && !history.data ? history.error : null) ??
    (detail.isError && !detail.data ? detail.error : null);
  if (failed) {
    const notFound = failed instanceof ApiError && failed.status === 404;
    const retry = () => {
      if (history.isError) void history.refetch();
      if (detail.isError) void detail.refetch();
    };
    return (
      <Screen edges={['top', 'bottom']} testID="history-screen">
        {header}
        <ErrorState
          error={failed}
          onRetry={notFound ? close : retry}
          testID="history-error"
        />
      </Screen>
    );
  }

  // Loading: 3 skeleton rows (07 §9). The currency comes from the detail.
  if (!history.data || !detail.data) {
    return (
      <Screen edges={['top', 'bottom']} testID="history-screen">
        {header}
        <SkeletonGroup label={HISTORY_COPY.loading} testID="history-loading">
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </SkeletonGroup>
      </Screen>
    );
  }

  // Nothing but the "added" event: say so instead of a one-item list.
  if (onlyCreation(history.data)) {
    return (
      <Screen edges={['top', 'bottom']} testID="history-screen">
        {header}
        <View style={styles.empty}>
          <EmptyState
            icon={History}
            title={HISTORY_COPY.emptyTitle}
            message={HISTORY_COPY.emptyBody}
            testID="history-empty"
          />
        </View>
      </Screen>
    );
  }

  const lines = historyLines(history.data, detail.data.billing_currency);

  return (
    <Screen
      edges={['top', 'bottom']}
      testID="history-screen"
      onRefresh={() => history.refetch()}
      refreshing={history.isRefetching}
      contentStyle={styles.list}
    >
      {header}
      {lines.map((line) => (
        <Card
          key={line.id}
          style={styles.card}
          // Read as one item: "October 1, 2026, Price update: Price changed from …".
          accessibilityLabel={`${line.spokenDate}, ${line.badge.label}: ${line.text}`}
          testID={`history-${line.id}`}
        >
          <View style={styles.cardHeader}>
            <Text style={styles.date}>{line.date}</Text>
            <Badge label={line.badge.label} tone={line.badge.tone} />
          </View>
          <Text style={styles.text}>{line.text}</Text>
        </Card>
      ))}
    </Screen>
  );
}

const useStyles = makeStyles(({ colors, typography }) => ({
  // 07 §6: cards 16 apart.
  list: {
    gap: spacing.lg,
    paddingBottom: spacing.lg,
  },
  // 07 §6: padding 16, gap 12.
  card: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
  },
  date: {
    ...typography.labelSemibold,
    flexShrink: 1,
  },
  // 07 §6: Regular 14/20. TODO(tokens): no regular 14/20 token yet, so borrow
  // alertTitle's 20 line height.
  text: {
    ...typography.bodyMd,
    lineHeight: typography.alertTitle.lineHeight,
    color: colors.textMuted,
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
  },
}));
