/**
 * Home (handoff 06, US-6, US-8): the rich dashboard from Figma `4:2901`.
 *
 * Every figure comes from the API (06 §3), fetched in parallel, one request
 * per section, so each renders as soon as its own data arrives:
 *
 *   greeting            GET /me
 *   monthly spend       GET /analytics/summary + /analytics/spend-over-time?months=2
 *   category donut      GET /analytics/summary
 *   urgent attention    GET /analytics/price-changes?since=-30d&include_upcoming=true
 *   upcoming renewals   GET /analytics/upcoming?days=30
 *
 * States (06 §5)
 *   loading      a skeleton per section, never a full-screen spinner
 *   empty        no subscriptions at all → the first-run EmptyState (05 §6)
 *   partial      a failed section retries inline; the others still render
 *   total        nothing loaded → a full-screen error with retry
 *   offline      cached data stays, under "Showing data from {time}"
 *   refreshing   pull to refresh; content stays visible
 *
 * The greeting uses the device's clock: the contract has no settings endpoint
 * to read the user's time zone from yet.
 */
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { PlusCircle } from 'lucide-react-native';
import { Text, View } from 'react-native';

import type { PriceChangeItem, Upcoming, UpcomingBill } from '@/api/analyticsTypes';
import { analyticsApi, meApi } from '@/api/endpoints';
import { queryKeys } from '@/api/queryKeys';
import { Button, EmptyState, ErrorState, Screen } from '@/components';
import { FEATURE_EXTRACTION } from '@/config/features';
import type { AppStackParamList } from '@/navigation/types';
import { makeStyles, spacing } from '@/theme';

import {
  CategoryCard,
  Greeting,
  RenewalList,
  Section,
  SectionError,
  SectionLoading,
  SpendCard,
  UrgentList,
} from './HomeSections';

export const HOME_COPY = {
  emptyTitle: 'Start tracking',
  emptyBody:
    "Add your first subscription and SubTrak will keep an eye on what you're spending.",
  stalePrefix: 'Showing data from',
} as const;

/** 06 §3: Home's delta compares this month with last. */
const SPEND_MONTHS = 2;
/** 06 §2.5: renewals in the next 30 days. */
const UPCOMING_DAYS = 30;

type Navigation = NativeStackNavigationProp<AppStackParamList>;

/**
 * Whether Home's figures include amounts converted from another currency.
 *
 * The contract has no summary-level flag for this: `rates_as_of` is only the
 * date of the stored rates and is set whenever rates exist, converted or not.
 * The upcoming bills do carry both currencies, so a bill billed in a currency
 * other than the display currency is the signal. It compares currency codes;
 * it does no arithmetic. TODO(contract): a summary field would cover
 * subscriptions with no bill in the next 30 days.
 */
export function convertedFrom(upcoming: Upcoming | undefined): boolean {
  return Boolean(
    upcoming?.items.some(
      (bill) => bill.billing_amount.currency !== upcoming.display_currency,
    ),
  );
}

function timeOf(epochMs: number): string {
  return new Date(epochMs).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function HomeScreen() {
  const styles = useStyles();
  const navigation = useNavigation<Navigation>();

  const profile = useQuery({
    queryKey: queryKeys.session.profile(),
    queryFn: meApi.getProfile,
  });
  const summary = useQuery({
    queryKey: queryKeys.analytics.summary(),
    queryFn: analyticsApi.getSummary,
  });
  const spend = useQuery({
    queryKey: queryKeys.analytics.spendOverTime(SPEND_MONTHS),
    queryFn: () => analyticsApi.getSpendOverTime(SPEND_MONTHS),
  });
  const urgent = useQuery({
    queryKey: queryKeys.analytics.urgent(),
    queryFn: analyticsApi.getUrgentChanges,
  });
  const upcoming = useQuery({
    queryKey: queryKeys.analytics.upcoming(UPCOMING_DAYS),
    queryFn: () => analyticsApi.getUpcoming(UPCOMING_DAYS),
  });

  const sections = [summary, spend, urgent, upcoming];
  const refreshing = sections.some((q) => q.isRefetching);
  const refresh = () => {
    sections.forEach((q) => q.refetch());
    profile.refetch();
  };

  const openCalendar = () =>
    navigation.navigate('MainTabs', {
      screen: 'Calendar',
      params: { screen: 'CalendarMain' },
    });
  const openUrgent = (item: PriceChangeItem) =>
    item.kind === 'trial_ending'
      ? navigation.navigate('MainTabs', {
          screen: 'Calendar',
          params: { screen: 'TrialShield' },
        })
      : navigation.navigate('SubscriptionDetail', { id: item.subscription_id });
  const openBill = (bill: UpcomingBill) =>
    navigation.navigate('SubscriptionDetail', { id: bill.subscription_id });

  // Nothing at all to show: one full-screen error, not four broken sections.
  if (sections.every((q) => q.isError && !q.data)) {
    return (
      <Screen testID="home-screen">
        <ErrorState error={summary.error} onRetry={refresh} testID="home-error" />
      </Screen>
    );
  }

  // 05 §6 / 06 §5: a user with no subscriptions sees the first-run state only.
  if (summary.data && summary.data.active_count === 0 && summary.data.trial_count === 0) {
    return (
      <Screen testID="home-screen">
        <View style={styles.empty}>
          <EmptyState
            icon={PlusCircle}
            title={HOME_COPY.emptyTitle}
            message={HOME_COPY.emptyBody}
            actionLabel="Add a subscription"
            onAction={() => navigation.navigate('AddSubscription')}
            testID="home-empty"
          />
          {FEATURE_EXTRACTION ? (
            <Button
              label="Find them in my email"
              variant="secondary"
              onPress={() =>
                navigation.navigate('MainTabs', {
                  screen: 'Settings',
                  params: { screen: 'ConnectEmail' },
                })
              }
              testID="home-find-in-email"
            />
          ) : null}
        </View>
      </Screen>
    );
  }

  // Offline or a failed refresh with data still in hand: keep it, and say how old.
  const stale = sections.find((q) => q.isError && q.data);
  const urgentItems = urgent.data?.items ?? [];
  const urgentContent =
    urgent.isError && !urgent.data ? (
      <SectionError error={urgent.error} onRetry={() => urgent.refetch()} />
    ) : urgent.isPending ? (
      <SectionLoading label="Loading alerts" rows={1} />
    ) : urgentItems.length > 0 ? (
      <UrgentList items={urgentItems} onOpen={openUrgent} />
    ) : null;
  const converted = convertedFrom(upcoming.data);

  return (
    <Screen
      testID="home-screen"
      gutter="compact"
      onRefresh={refresh}
      refreshing={refreshing}
      contentStyle={styles.content}
    >
      <Greeting
        name={profile.data?.name ?? null}
        hour={new Date().getHours()}
        onProfile={() => navigation.navigate('ProfileAccount')}
      />

      {stale ? (
        <Text style={styles.stale} accessibilityLiveRegion="polite" testID="home-stale">
          {HOME_COPY.stalePrefix} {timeOf(stale.dataUpdatedAt)}
        </Text>
      ) : null}

      <Section testID="home-spend">
        {summary.data ? (
          <SpendCard summary={summary.data} spend={spend.data} converted={converted} />
        ) : summary.isError ? (
          <SectionError error={summary.error} onRetry={() => summary.refetch()} />
        ) : (
          <SectionLoading label="Loading monthly spend" rows={1} />
        )}
      </Section>

      <Section title="Spending by category" testID="home-categories">
        {summary.data ? (
          <CategoryCard summary={summary.data} />
        ) : summary.isError ? (
          <SectionError error={summary.error} onRetry={() => summary.refetch()} />
        ) : (
          <SectionLoading label="Loading categories" />
        )}
      </Section>

      {/* 06 §2.4: hidden entirely when empty, header and all. */}
      {urgentContent ? (
        <Section title="Urgent attention" testID="home-urgent">
          {urgentContent}
        </Section>
      ) : null}

      <Section
        title="Upcoming renewals"
        action={
          <Button
            label="View all"
            variant="ghost"
            onPress={openCalendar}
            accessibilityHint="Opens the Calendar"
            testID="home-view-all"
          />
        }
        testID="home-upcoming"
      >
        {upcoming.data ? (
          <RenewalList
            upcoming={upcoming.data}
            onOpen={openBill}
            onCalendar={openCalendar}
          />
        ) : upcoming.isError ? (
          <SectionError error={upcoming.error} onRetry={() => upcoming.refetch()} />
        ) : (
          <SectionLoading label="Loading renewals" rows={4} />
        )}
      </Section>
    </Screen>
  );
}

const useStyles = makeStyles(({ colors, typography }) => ({
  // 06 §2: 20 between sections, 16 at the bottom.
  content: {
    gap: spacing.xl,
    paddingBottom: spacing.lg,
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    gap: spacing.md,
  },
  stale: {
    ...typography.caption,
    color: colors.textMuted,
  },
}));
