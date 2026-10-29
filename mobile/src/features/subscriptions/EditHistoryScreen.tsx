/**
 * Edit history (handoff 07 §6; US-7). Figma `4:4271`.
 *
 * Every recorded change, newest first. They come with GET /subscriptions/{id}
 * (its `history` is the same list GET .../history returns), so this screen
 * makes one request, shared with Detail: the name, the currency and the list
 * can't disagree, and opening it from Detail is instant.
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

import { getSubscription } from './api';
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

  // Couldn't load it: one full-screen error (a 404 can only go back).
  if (detail.isError && !detail.data) {
    const notFound = detail.error instanceof ApiError && detail.error.status === 404;
    return (
      <Screen edges={['top', 'bottom']} testID="history-screen">
        {header}
        <ErrorState
          error={detail.error}
          onRetry={notFound ? close : () => detail.refetch()}
          testID="history-error"
        />
      </Screen>
    );
  }

  // Loading: 3 skeleton rows (07 §9).
  if (!detail.data) {
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

  const { history, billing_currency: currency } = detail.data;

  // Nothing but the "added" event: say so instead of a one-item list.
  if (onlyCreation(history)) {
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

  return (
    <Screen
      edges={['top', 'bottom']}
      testID="history-screen"
      // One request, so a refresh updates the title, the currency and the list together.
      onRefresh={() => detail.refetch()}
      refreshing={detail.isRefetching}
    >
      {header}
      <View style={styles.list} testID="history-list">
        {historyLines(history, currency).map((line) => (
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
      </View>
    </Screen>
  );
}

const useStyles = makeStyles(({ colors, typography }) => ({
  // 07 §6: 8 below the app bar, cards 16 apart. Screen keeps its own bottom padding.
  list: {
    marginTop: spacing.sm,
    gap: spacing.lg,
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
