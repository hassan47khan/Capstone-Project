/**
 * Analytics: spending by category and the monthly total (08 §2.2–2.4, §3, §5).
 *
 * The summaries below are what the real backend returned on 2026-10-30
 * (scratch database, seed data): Alex's six categories totalling $129.20, and
 * Rosa's one category with her ARS subscription left out for want of a rate.
 */
import { NavigationContainer, useRoute } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { http, HttpResponse } from 'msw';
import { StyleSheet, Text } from 'react-native';

import type { AnalyticsSummary } from '@/api/analyticsTypes';
import { queryKeys } from '@/api/queryKeys';
import { SessionProvider } from '@/session/SessionContext';
import { tokenStore } from '@/session/tokenStore';
import { emptySummary } from '@/test/contractFixtures';
import { MOCK_EMAILS } from '@/test/fixtures';
import { createTestQueryClient, renderWithProviders } from '@/test/render';
import { server } from '@/test/server';
import { lightCategoryColors, type CategoryKey } from '@/theme';

import { ANALYTICS_COPY, AnalyticsScreen } from './AnalyticsScreen';
import { barFractions, CATEGORY_COPY } from './CategoryCard';

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

async function renderAnalytics(queryClient = createTestQueryClient()) {
  await tokenStore.setRefreshToken(`mock-refresh-${MOCK_EMAILS.full}`);
  await renderWithProviders(
    <SessionProvider>
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Analytics" component={AnalyticsScreen} />
          <Stack.Screen name="AddSubscription" component={Stub} />
        </Stack.Navigator>
      </NavigationContainer>
    </SessionProvider>,
    { queryClient },
  );
  await screen.findByTestId('analytics-screen');
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
    await renderAnalytics();

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
