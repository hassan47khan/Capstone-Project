/**
 * Analytics: spending by category and the monthly total (08 §2.2–2.4, §3, §5).
 *
 * The summaries below are what the real backend returned on 2026-10-30
 * (scratch database, seed data): Alex's six categories totalling $129.20, and
 * Rosa's one category with her ARS subscription left out for want of a rate.
 */
import { NavigationContainer, useRoute } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { http, HttpResponse } from 'msw';
import { processColor, StyleSheet, Text } from 'react-native';

import type { AnalyticsSummary, SpendOverTime } from '@/api/analyticsTypes';
import { queryKeys } from '@/api/queryKeys';
import { SessionProvider } from '@/session/SessionContext';
import { tokenStore } from '@/session/tokenStore';
import {
  alexSpend,
  alexSpendYear,
  emptySummary,
  spendFor,
} from '@/test/contractFixtures';
import { MOCK_EMAILS } from '@/test/fixtures';
import { createTestQueryClient, renderWithProviders } from '@/test/render';
import {
  cancelMockSubscription,
  deleteMockSubscription,
} from '@/test/subscriptionFixtures';
import { server } from '@/test/server';
import { lightCategoryColors, lightColors, type CategoryKey } from '@/theme';

import { ANALYTICS_COPY, AnalyticsScreen } from './AnalyticsScreen';
import { barFractions, CATEGORY_COPY } from './CategoryCard';
import { SPEND_COPY } from './SpendTrend';
import { LIST_COPY } from './SubscriptionList';

const category = (slug: string, name: string, key: string) => ({
  slug,
  display_name: name,
  color_token_key: key,
});
const usd = (amount: string) => ({ amount, currency: 'USD' });

// GET /analytics/summary for Alex, from the real backend.
const alexReal: AnalyticsSummary = {
  period: 'current_month',
  display_currency: 'USD',
  monthly_total: usd('129.20'),
  annual_total: usd('1550.34'),
  active_count: 8,
  trial_count: 3,
  pending_trials_monthly: usd('41.98'),
  unconverted_count: 0,
  converted: false,
  rates_as_of: '2026-10-01',
  categories: [
    {
      category: category('productivity', 'Productivity', 'productivity'),
      amount: usd('54.99'),
      percent: 43,
      share: '42.56',
    },
    {
      category: category('entertainment', 'Entertainment', 'entertainment'),
      amount: usd('40.47'),
      percent: 31,
      share: '31.32',
    },
    {
      category: category('ai-tools', 'AI Tools', 'aiTools'),
      amount: usd('20.00'),
      percent: 16,
      share: '15.48',
    },
    {
      category: category('health-wellness', 'Health & Wellness', 'healthWellness'),
      amount: usd('6.50'),
      percent: 5,
      share: '5.03',
    },
    {
      category: category('news-media', 'News & Media', 'newsMedia'),
      amount: usd('4.25'),
      percent: 3,
      share: '3.29',
    },
    {
      category: category('cloud-storage', 'Cloud Storage', 'cloudStorage'),
      amount: usd('2.99'),
      percent: 2,
      share: '2.31',
    },
  ],
} as AnalyticsSummary;

// Rosa: one category, and her ARS subscription left out (no rate).
const rosaReal: AnalyticsSummary = {
  ...alexReal,
  monthly_total: usd('6.00'),
  annual_total: usd('72.00'),
  active_count: 1,
  trial_count: 0,
  pending_trials_monthly: usd('0.00'),
  unconverted_count: 1,
  categories: [
    {
      category: category('news-media', 'News & Media', 'newsMedia'),
      amount: usd('6.00'),
      percent: 100,
      share: '100.00',
    },
  ],
} as AnalyticsSummary;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Stack = createNativeStackNavigator<any>();
function Stub() {
  return <Text testID="stub">{useRoute().name}</Text>;
}

function serve(summary: AnalyticsSummary) {
  server.use(http.get('*/analytics/summary', () => HttpResponse.json(summary)));
}

async function renderAnalytics(
  queryClient = createTestQueryClient(),
  { reduceMotion = false, settle = true } = {},
) {
  await tokenStore.setRefreshToken(`mock-refresh-${MOCK_EMAILS.full}`);
  await renderWithProviders(
    <SessionProvider>
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Analytics" component={AnalyticsScreen} />
          <Stack.Screen name="AddSubscription" component={Stub} />
          <Stack.Screen name="SubscriptionDetail" component={Stub} />
        </Stack.Navigator>
      </NavigationContainer>
    </SessionProvider>,
    { queryClient, reduceMotion },
  );
  await screen.findByTestId('analytics-screen');
  // Let all three sections' requests finish, so none lands after the test.
  if (settle) await waitFor(() => expect(queryClient.isFetching()).toBe(0));
  return queryClient;
}

const bar = (slug: string) =>
  StyleSheet.flatten(
    screen.getByTestId(`analytics-bar-${slug}`, { includeHiddenElements: true }).props
      .style,
  );

beforeEach(async () => {
  await tokenStore.clear();
});

describe('Spending by category (08 §2.2, §3)', () => {
  it('shows every non-zero category, largest first, as the server sent them', async () => {
    serve(alexReal);
    await renderAnalytics();

    await screen.findByTestId('analytics-category-card');
    const labels = alexReal.categories.map(
      (row) =>
        screen.getByTestId(`analytics-category-${row.category!.slug}`).props
          .accessibilityLabel,
    );
    expect(labels).toEqual([
      'Productivity, $54.99, 43 percent of monthly spending.',
      'Entertainment, $40.47, 31 percent of monthly spending.',
      'AI Tools, $20.00, 16 percent of monthly spending.',
      'Health & Wellness, $6.50, 5 percent of monthly spending.',
      'News & Media, $4.25, 3 percent of monthly spending.',
      'Cloud Storage, $2.99, 2 percent of monthly spending.',
    ]);
    expect(screen.getByText(CATEGORY_COPY.title)).toBeOnTheScreen();
    expect(screen.getByText(CATEGORY_COPY.subtitle)).toBeOnTheScreen();
  });

  it('the largest category fills the track; the rest are sized against it', async () => {
    serve(alexReal);
    await renderAnalytics();
    await screen.findByTestId('analytics-category-card');

    expect(bar('productivity').width).toBe('100%');
    // 31.32 / 42.56 and 2.31 / 42.56 of the track.
    expect(parseFloat(String(bar('entertainment').width))).toBeCloseTo(73.59, 1);
    expect(parseFloat(String(bar('cloud-storage').width))).toBeCloseTo(5.43, 1);
  });

  it('uses the same category colors as Home (color_token_key)', async () => {
    serve(alexReal);
    await renderAnalytics();
    await screen.findByTestId('analytics-category-card');

    for (const row of alexReal.categories) {
      expect(bar(row.category!.slug).backgroundColor).toBe(
        lightCategoryColors[row.category!.color_token_key as CategoryKey],
      );
    }
  });

  it('the bars are decoration: hidden from screen readers', async () => {
    serve(alexReal);
    await renderAnalytics();
    await screen.findByTestId('analytics-category-card');

    expect(screen.queryByTestId('analytics-bar-productivity')).toBeNull();
  });
});

describe('Monthly total (08 §2.3)', () => {
  it("matches Home's total exactly ($129.20 with seed data)", async () => {
    serve(alexReal);
    await renderAnalytics();

    expect(
      (await screen.findByTestId('analytics-monthly-total')).props.accessibilityLabel,
    ).toBe('Monthly total, $129.20');
  });
});

describe('edge cases (08 §5)', () => {
  it('one category is a single full-width bar, and a subscription with no rate is called out (Rosa, real data)', async () => {
    serve(rosaReal);
    await renderAnalytics();
    await screen.findByTestId('analytics-category-card');

    expect(bar('news-media').width).toBe('100%');
    expect(screen.getByTestId('analytics-left-out')).toHaveTextContent(
      '1 subscription left out: there is no exchange rate for its currency.',
    );
    expect(screen.queryByText(CATEGORY_COPY.converted)).toBeNull();
  });

  it('says when figures were converted from another currency', async () => {
    serve({ ...alexReal, converted: true });
    await renderAnalytics();

    expect(await screen.findByText(CATEGORY_COPY.converted)).toBeOnTheScreen();
    expect(screen.queryByTestId('analytics-left-out')).toBeNull();
  });

  it('a tiny category still shows a sliver of bar', async () => {
    serve({
      ...alexReal,
      categories: [
        alexReal.categories[0]!,
        { ...alexReal.categories[5]!, percent: 0, share: '0.10' },
      ],
    } as AnalyticsSummary);
    await renderAnalytics();
    await screen.findByTestId('analytics-category-card');

    expect(bar('cloud-storage').minWidth).toBe(2);
  });

  it('an uncategorized row reads "Uncategorized" in the other color', async () => {
    serve({
      ...alexReal,
      categories: [{ ...alexReal.categories[0]!, category: null }],
    } as AnalyticsSummary);
    await renderAnalytics();

    const row = await screen.findByTestId('analytics-category-uncategorized');
    expect(row.props.accessibilityLabel).toMatch(/^Uncategorized, \$54\.99/);
    expect(bar('uncategorized').backgroundColor).toBe(lightCategoryColors.other);
  });

  it('the left-out note counts in the plural too', () => {
    expect(CATEGORY_COPY.leftOut(2)).toBe(
      '2 subscriptions left out: there is no exchange rate for their currency.',
    );
  });

  it('only trials is not "empty": trials sit outside the totals, so the total is $0.00', async () => {
    serve({
      ...emptySummary,
      trial_count: 2,
    } as AnalyticsSummary);
    await renderAnalytics();

    expect(
      (await screen.findByTestId('analytics-monthly-total')).props.accessibilityLabel,
    ).toBe('Monthly total, $0.00');
    expect(screen.queryByText(ANALYTICS_COPY.emptyTitle)).toBeNull();
  });

  it('a subscription that can\'t be converted isn\'t "empty": it shows the left-out note (real ARS-only user)', async () => {
    // What the real backend returned for a user whose only subscription is
    // ARS 4500.00 (2026-11-01, scratch database): nothing counted, one left out.
    serve({
      ...alexReal,
      monthly_total: usd('0.00'),
      annual_total: usd('0.00'),
      active_count: 0,
      trial_count: 0,
      pending_trials_monthly: usd('0.00'),
      unconverted_count: 1,
      converted: false,
      rates_as_of: '2026-11-01',
      categories: [],
    } as AnalyticsSummary);
    await renderAnalytics();

    expect(await screen.findByTestId('analytics-left-out')).toHaveTextContent(
      '1 subscription left out: there is no exchange rate for its currency.',
    );
    expect(screen.queryByText(ANALYTICS_COPY.emptyTitle)).toBeNull();
    expect(screen.getByTestId('analytics-monthly-total').props.accessibilityLabel).toBe(
      'Monthly total, $0.00',
    );
  });

  it('barFractions: largest is 1, and nothing divides by zero', () => {
    expect(barFractions(alexReal.categories)[0]).toBe(1);
    expect(barFractions([])).toEqual([]);
    expect(barFractions([{ ...alexReal.categories[0]!, share: '0.00' }])).toEqual([0]);
  });
});

describe('screen states (08 §4)', () => {
  it('shows a skeleton while loading', async () => {
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    server.use(
      http.get('*/analytics/summary', async () => {
        await held;
        return HttpResponse.json(alexReal);
      }),
    );
    await renderAnalytics(createTestQueryClient(), { settle: false });

    expect(screen.getByLabelText(ANALYTICS_COPY.loading)).toBeOnTheScreen();
    await act(async () => release());
    await screen.findByTestId('analytics-category-card');
  });

  it('no subscriptions: "Nothing to analyze yet", and Add opens the add screen', async () => {
    serve(emptySummary);
    await renderAnalytics();

    expect(await screen.findByText(ANALYTICS_COPY.emptyTitle)).toBeOnTheScreen();
    await fireEvent.press(screen.getByText(ANALYTICS_COPY.emptyAction));
    expect(await screen.findByTestId('stub')).toHaveTextContent('AddSubscription');
  });

  it('a failed load shows the error with Try again, which recovers', async () => {
    let fail = true;
    server.use(
      http.get('*/analytics/summary', () =>
        fail
          ? HttpResponse.json(
              { error: { code: 'server_error', message: 'Down.' } },
              { status: 503 },
            )
          : HttpResponse.json(alexReal),
      ),
    );
    await renderAnalytics();
    await screen.findByTestId('analytics-error');

    fail = false;
    await fireEvent.press(screen.getByTestId('analytics-error-retry'));

    expect(await screen.findByTestId('analytics-category-card')).toBeOnTheScreen();
  });

  it('a failed refresh keeps the saved figures, and says when they are from', async () => {
    serve(alexReal);
    const queryClient = await renderAnalytics();
    await screen.findByTestId('analytics-category-card');

    server.use(http.get('*/analytics/summary', () => HttpResponse.error()));
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: queryKeys.analytics.summary() });
    });

    expect(await screen.findByTestId('analytics-stale')).toHaveTextContent(
      new RegExp(`^${ANALYTICS_COPY.stalePrefix} `),
    );
    expect(screen.getByTestId('analytics-category-card')).toBeOnTheScreen();
  });

  it('has no Add button of its own: the FAB is the only way to add (03 §2)', async () => {
    serve(alexReal);
    await renderAnalytics();
    await screen.findByTestId('analytics-category-card');

    expect(screen.queryByRole('button', { name: /add/i })).toBeNull();
    expect(screen.getByRole('header', { name: ANALYTICS_COPY.title })).toBeOnTheScreen();
  });
});

// 08 §2.1 and US-16 (#57). The mock serves Alex's real 12 months; the cases
// below are the real backend's responses (scratch database, 2026-10-30).
describe('Spend over time (08 §2.1)', () => {
  const usd = (amount: string) => ({ amount, currency: 'USD' });
  const serveSpend = (spend: SpendOverTime) =>
    server.use(http.get('*/analytics/spend-over-time', () => HttpResponse.json(spend)));
  const layOut = async (width: number) =>
    fireEvent(
      screen.getByTestId('analytics-spend-plot', { includeHiddenElements: true }),
      'layout',
      {
        nativeEvent: { layout: { width, height: 120, x: 0, y: 0 } },
      },
    );
  const hidden = (testID: string) =>
    screen.getByTestId(testID, { includeHiddenElements: true });

  it('is the first section, with this month and the change from last month', async () => {
    await renderAnalytics();
    await screen.findByTestId('analytics-spend');
    await screen.findByTestId('analytics-category-card');

    const order = screen
      .getAllByTestId(/^analytics-(spend|category-card)$/)
      .map((node) => node.props.testID);
    expect(order).toEqual(['analytics-spend', 'analytics-category-card']);
    expect(screen.getByTestId('analytics-spend-current')).toHaveTextContent('$129.20');
    expect(screen.getByTestId('analytics-spend-delta')).toHaveTextContent(
      'up 1.2% from last month',
    );
  });

  it('says the chart in words, with the real year (08 §7)', async () => {
    await renderAnalytics();

    expect(await screen.findByTestId('analytics-spend-summary')).toHaveTextContent(
      'Spending over 12 months. Current month $129.20, up 1.2% from last month. Highest was $129.20 in October.',
    );
  });

  it('draws 12 months: the accent line, an 8% fill, the current month marked, and a round top', async () => {
    await renderAnalytics(createTestQueryClient(), { reduceMotion: true });
    await screen.findByTestId('analytics-spend');
    await layOut(300);

    // react-native-svg hands colors to native code as processed numbers.
    expect(hidden('analytics-spend-line').props.stroke).toEqual({
      type: 0,
      payload: processColor(lightColors.accent),
    });
    expect(hidden('analytics-spend-area').props.fillOpacity).toBe(0.08);
    expect(hidden('analytics-spend-current-dot')).toBeTruthy();
    // SVG text sits in a nested span's `content`.
    const top = hidden('analytics-spend-top').children[0] as {
      props: { content?: string };
    };
    expect(top.props.content).toBe('$150.00');
    // The picture is hidden from screen readers; the sentence carries it.
    expect(screen.queryByTestId('analytics-spend-plot')).toBeNull();
  });

  it('labels every month by its initial, the current one in bold', async () => {
    await renderAnalytics(createTestQueryClient(), { reduceMotion: true });
    await screen.findByTestId('analytics-spend');
    await layOut(300);

    const labels = alexSpendYear.months.map(
      (m) => hidden(`analytics-spend-axis-${m.month}`).props.children,
    );
    expect(labels).toEqual(['N', 'D', 'J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O']);
    const current = StyleSheet.flatten(
      hidden('analytics-spend-axis-2026-10').props.style,
    );
    expect(current.color).toBe(lightColors.text);
  });

  it('on a narrow screen, every 2nd month label, ending on the current month', async () => {
    await renderAnalytics(createTestQueryClient(), { reduceMotion: true });
    await screen.findByTestId('analytics-spend');
    await layOut(200);

    expect(hidden('analytics-spend-axis-2026-10').props.children).toBe('O');
    expect(hidden('analytics-spend-axis-2026-09').props.children).toBe(' ');
    expect(hidden('analytics-spend-axis-2026-08').props.children).toBe('A');
  });

  it('a fall is in green; a rise is plain text, never red', async () => {
    serveSpend({
      ...alexSpendYear,
      current: usd('127.70'),
      previous: usd('128.73'),
      delta_percent: '-0.8',
      direction: 'down',
    });
    await renderAnalytics();

    const delta = await screen.findByText('down 0.8% from last month');
    expect(StyleSheet.flatten(delta.props.style).color).toBe(lightColors.success);
  });

  it('a flat month reads "No change from last month" (08 §5; Sam, real data)', async () => {
    serveSpend({
      ...alexSpendYear,
      months: alexSpendYear.months.map((m) => ({ ...m, amount: usd('22.98') })),
      current: usd('22.98'),
      previous: usd('22.98'),
      delta_percent: '0.0',
      direction: 'flat',
    });
    await renderAnalytics();

    expect(await screen.findByTestId('analytics-spend-delta')).toHaveTextContent(
      'No change from last month',
    );
  });

  it('under two months of tracking: the placeholder, not a one-point chart (real new user)', async () => {
    // A user whose only subscription started this month, from the real backend.
    serveSpend({
      display_currency: 'USD',
      months: [
        ...alexSpendYear.months.slice(0, 11).map((m) => ({ ...m, amount: usd('0.00') })),
        { month: '2026-10', amount: usd('15.00') },
      ],
      current: usd('15.00'),
      previous: usd('0.00'),
      delta_percent: null,
      direction: 'up',
      enough_history: false,
    });
    await renderAnalytics();

    expect(await screen.findByTestId('analytics-spend-placeholder')).toHaveTextContent(
      SPEND_COPY.placeholder,
    );
    expect(screen.getByTestId('analytics-spend-current')).toHaveTextContent('$15.00');
    expect(
      screen.queryByTestId('analytics-spend-plot', { includeHiddenElements: true }),
    ).toBeNull();
    expect(screen.queryByTestId('analytics-spend-delta')).toBeNull();
  });

  it("US-16: shows the projected yearly spend, at today's prices without trials", async () => {
    await renderAnalytics();

    expect(
      (await screen.findByTestId('analytics-projected')).props.accessibilityLabel,
    ).toBe(
      "Projected for the year, $1,550.34. At today's prices. Trials aren't counted.",
    );
  });

  it("a failed spend load doesn't take the category card with it, and Try again recovers", async () => {
    let fail = true;
    server.use(
      http.get('*/analytics/spend-over-time', () =>
        fail
          ? HttpResponse.json(
              { error: { code: 'server_error', message: 'Down.' } },
              { status: 503 },
            )
          : undefined,
      ),
    );
    await renderAnalytics();

    await screen.findByTestId('analytics-spend-error');
    expect(await screen.findByTestId('analytics-category-card')).toBeOnTheScreen();

    fail = false;
    await fireEvent.press(screen.getByTestId('analytics-spend-error-retry'));
    expect(await screen.findByTestId('analytics-spend')).toBeOnTheScreen();
  });

  it('draws the line in from the left, or at once under reduced motion (08 §6)', async () => {
    // How much of the line is still hidden: none means fully drawn
    // (react-native-svg passes an offset of 0 on as null).
    const undrawn = () => hidden('analytics-spend-line').props.strokeDashoffset ?? 0;

    await renderAnalytics(createTestQueryClient(), { reduceMotion: true });
    await screen.findByTestId('analytics-spend');
    await layOut(300);
    expect(undrawn()).toBe(0);
  });

  it('with motion on, the line starts hidden and draws in', async () => {
    await renderAnalytics();
    await screen.findByTestId('analytics-spend');
    await layOut(300);

    expect(Number(hidden('analytics-spend-line').props.strokeDashoffset)).toBeGreaterThan(
      0,
    );
    // Let the draw finish, so it doesn't update the screen after the test.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 600));
    });
  });

  it("the mock's year ends in Home's two months, so the screens agree", () => {
    expect(spendFor(MOCK_EMAILS.full, 2)).toEqual({
      ...alexSpendYear,
      months: alexSpend.months,
    });
    expect(spendFor(MOCK_EMAILS.full, 12).months).toHaveLength(12);
  });
});

// 08 §2.4, with the mock store's copy of Alex's real list (11 subscriptions).
describe('Subscription list (08 §2.4)', () => {
  const rowIds = () =>
    screen
      .queryAllByTestId(/^analytics-row-/)
      .map((node) => node.props.testID.replace('analytics-row-', ''));

  it('comes last, grouped by category with a header each', async () => {
    await renderAnalytics();
    await screen.findByTestId('analytics-list');
    await screen.findByTestId('analytics-category-card');

    const order = screen
      .getAllByTestId(/^analytics-(spend|category-card|list)$/)
      .map((node) => node.props.testID);
    expect(order).toEqual([
      'analytics-spend',
      'analytics-category-card',
      'analytics-list',
    ]);
    expect(rowIds()).toHaveLength(11);
    expect(screen.getByTestId('analytics-group-entertainment')).toHaveTextContent(
      'Entertainment',
    );
    // Groups A to Z, the same order as the chips.
    const groups = screen
      .getAllByTestId(/^analytics-group-/)
      .map((node) => node.props.testID.replace('analytics-group-', ''));
    expect(groups).toEqual([
      'ai-tools',
      'cloud-storage',
      'entertainment',
      'health-wellness',
      'news-media',
      'other',
      'productivity',
    ]);
  });

  it('a row reads as one stop, with its real price and next bill, and opens Detail', async () => {
    await renderAnalytics();
    const netflix = await screen.findByTestId('analytics-row-sub-netflix');

    expect(netflix.props.accessibilityLabel).toBe(
      'Netflix, $15.49 per month, next bill October 12, 2026',
    );
    // Headspace bills every 2 months (real seed).
    expect(
      screen.getByTestId('analytics-row-sub-headspace').props.accessibilityLabel,
    ).toMatch(/^Headspace, \$12\.99 every 2 months/);

    await fireEvent.press(netflix);
    expect(await screen.findByTestId('stub')).toHaveTextContent('SubscriptionDetail');
  });

  it('search narrows by name as you type, and says how many match', async () => {
    await renderAnalytics();
    await screen.findByTestId('analytics-list');

    await fireEvent.changeText(screen.getByTestId('analytics-search-input'), '  NET ');

    expect(rowIds()).toEqual(['sub-netflix']);
    const count = screen.getByTestId('analytics-list-count');
    expect(count).toHaveTextContent('1 subscription');
    expect(count.props.accessibilityLiveRegion).toBe('polite');
  });

  it('no matches: "No results for \'…\'"', async () => {
    await renderAnalytics();
    await screen.findByTestId('analytics-list');

    await fireEvent.changeText(screen.getByTestId('analytics-search-input'), 'zzz');

    expect(screen.getByText("No results for 'zzz'")).toBeOnTheScreen();
    expect(rowIds()).toEqual([]);
  });

  it('chips: "All" plus one per category, each saying its count; one picks a group', async () => {
    await renderAnalytics();
    await screen.findByTestId('analytics-list');

    expect(screen.getByTestId('analytics-chip-all').props.accessibilityLabel).toBe(
      'All, 11 subscriptions',
    );
    const chip = screen.getByTestId('analytics-chip-entertainment');
    expect(chip.props.accessibilityLabel).toBe('Entertainment, 4 subscriptions');

    await fireEvent.press(chip);

    expect(rowIds()).toEqual([
      'sub-hulu',
      'sub-spotify',
      'sub-netflix',
      'sub-youtube-premium',
    ]);
    expect(screen.getByTestId('analytics-chip-entertainment')).toBeSelected();
    expect(screen.getByTestId('analytics-chip-all')).not.toBeSelected();
    expect(screen.getByTestId('analytics-list-count')).toHaveTextContent(
      '4 subscriptions',
    );
  });

  it('a chip whose category empties out: "No subscriptions in …" and Clear filter', async () => {
    const queryClient = await renderAnalytics();
    await screen.findByTestId('analytics-list');
    await fireEvent.press(screen.getByTestId('analytics-chip-ai-tools'));
    expect(rowIds()).toEqual(['sub-chatgpt-plus']);

    // ChatGPT Plus is deleted elsewhere, and the list refreshes.
    deleteMockSubscription(MOCK_EMAILS.full, 'sub-chatgpt-plus');
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: queryKeys.subscriptions.list() });
    });

    // Every category keeps its chip, so the message names it (08 §4).
    expect(screen.getByText(LIST_COPY.noneInCategory('AI Tools'))).toBeOnTheScreen();
    expect(screen.getByTestId('analytics-chip-ai-tools').props.accessibilityLabel).toBe(
      'AI Tools, no subscriptions',
    );
    await fireEvent.press(screen.getByTestId('analytics-clear-filter'));
    expect(rowIds()).toHaveLength(10);
  });

  it('leaves cancelled subscriptions out for now (#167)', async () => {
    cancelMockSubscription(MOCK_EMAILS.full, 'sub-netflix');
    await renderAnalytics();
    await screen.findByTestId('analytics-list');

    expect(rowIds()).not.toContain('sub-netflix');
    expect(rowIds()).toHaveLength(10);
  });

  it("a failed list doesn't take the other sections with it, and Try again recovers", async () => {
    let fail = true;
    server.use(
      http.get('*/subscriptions', () =>
        fail
          ? HttpResponse.json(
              { error: { code: 'server_error', message: 'Down.' } },
              { status: 503 },
            )
          : undefined,
      ),
    );
    await renderAnalytics();

    await screen.findByTestId('analytics-list-error');
    expect(await screen.findByTestId('analytics-category-card')).toBeOnTheScreen();

    fail = false;
    await fireEvent.press(screen.getByTestId('analytics-list-error-retry'));
    expect(await screen.findByTestId('analytics-list')).toBeOnTheScreen();
  });
});
