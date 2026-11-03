/**
 * Fixtures for the /analytics endpoints of the frozen contract (04 §5), with
 * the canonical seed figures the backend asserts (04 §4: Alex at SEED_TODAY
 * 2026-10-01). Served by the four /analytics routes in routes.ts, to Jest and
 * to the app when mocks are on.
 *
 * Written out rather than computed: these are what the server sends, and the
 * client never does the arithmetic. TODO(generated client): keep in step with
 * backend/subscriptions/tests/test_api_analytics.py.
 */
import type {
  AnalyticsSummary,
  CategoryRef,
  PriceChanges,
  ServiceMarkRef,
  SpendOverTime,
  Upcoming,
  UpcomingBill,
} from '@/api/analyticsTypes';

import { MOCK_EMAILS } from './fixtures';

const usd = (amount: string) => ({ amount, currency: 'USD' });

const category = (
  slug: string,
  display_name: string,
  color_token_key: string,
): CategoryRef => ({
  slug,
  display_name,
  color_token_key,
});

export const CATEGORIES = {
  productivity: category('productivity', 'Productivity', 'productivity'),
  entertainment: category('entertainment', 'Entertainment', 'entertainment'),
  aiTools: category('ai-tools', 'AI Tools', 'aiTools'),
  healthWellness: category('health-wellness', 'Health & Wellness', 'healthWellness'),
  newsMedia: category('news-media', 'News & Media', 'newsMedia'),
  cloudStorage: category('cloud-storage', 'Cloud Storage', 'cloudStorage'),
  other: category('other', 'Other', 'other'),
};

const mark = (m: string, brand_hex: string, tint_hex: string): ServiceMarkRef => ({
  mark: m,
  brand_hex,
  tint_hex,
});

const MARKS = {
  Netflix: mark('N', '#e50914', '#ffecee'),
  Spotify: mark('S', '#1db954', '#e3f9ed'),
  'Adobe CC': mark('A', '#b38b35', '#fff7cc'),
  'iCloud+': mark('iC', '#007aff', '#e6f0fa'),
  'ChatGPT Plus': mark('GP', '#10a37f', '#e1f7f4'),
  'YouTube Premium': mark('YT', '#ff0000', '#ffe0e0'),
  Hulu: mark('Hu', '#1ce783', '#e4fcf0'),
  Headspace: mark('H', '#a259ff', '#f4ecff'),
  'New York Times': mark('NY', '#000000', '#e0e0e0'),
} as Record<string, ServiceMarkRef>;

export const SEED_TODAY = '2026-10-01';

export const alexSummary: AnalyticsSummary = {
  period: 'current_month',
  display_currency: 'USD',
  monthly_total: usd('129.20'),
  annual_total: usd('1550.34'),
  active_count: 8,
  trial_count: 3,
  pending_trials_monthly: usd('41.98'),
  unconverted_count: 0,
  rates_as_of: SEED_TODAY,
  categories: [
    {
      category: CATEGORIES.productivity,
      amount: usd('54.99'),
      percent: 43,
      share: '42.56',
    },
    {
      category: CATEGORIES.entertainment,
      amount: usd('40.47'),
      percent: 31,
      share: '31.32',
    },
    { category: CATEGORIES.aiTools, amount: usd('20.00'), percent: 16, share: '15.48' },
    {
      category: CATEGORIES.healthWellness,
      amount: usd('6.50'),
      percent: 5,
      share: '5.03',
    },
    { category: CATEGORIES.newsMedia, amount: usd('4.25'), percent: 3, share: '3.29' },
    { category: CATEGORIES.cloudStorage, amount: usd('2.99'), percent: 2, share: '2.31' },
  ],
};

export const alexSpend: SpendOverTime = {
  display_currency: 'USD',
  months: [
    { month: '2026-09', amount: usd('127.70') },
    { month: '2026-10', amount: usd('129.20') },
  ],
  current: usd('129.20'),
  previous: usd('127.70'),
  delta_percent: '1.2',
  direction: 'up',
  enough_history: true,
};

// Alex's real 12 months (GET /analytics/spend-over-time?months=12 on the real
// backend, scratch database, 2026-10-30). Home's two months above are the last
// two of these; spendFor() slices it to the months asked for.
export const alexSpendYear: SpendOverTime = {
  ...alexSpend,
  months: [
    { month: '2025-11', amount: usd('109.46') },
    { month: '2025-12', amount: usd('123.45') },
    { month: '2026-01', amount: usd('123.45') },
    { month: '2026-02', amount: usd('127.70') },
    { month: '2026-03', amount: usd('127.70') },
    { month: '2026-04', amount: usd('127.70') },
    { month: '2026-05', amount: usd('127.70') },
    { month: '2026-06', amount: usd('127.70') },
    { month: '2026-07', amount: usd('127.70') },
    { month: '2026-08', amount: usd('127.70') },
    { month: '2026-09', amount: usd('127.70') },
    { month: '2026-10', amount: usd('129.20') },
  ],
};

export const alexUrgent: PriceChanges = {
  display_currency: 'USD',
  items: [
    {
      kind: 'trial_ending',
      subscription_id: 'sub-hulu',
      name: 'Hulu',
      service_mark: MARKS.Hulu!,
      effective_on: '2026-10-03',
      is_upcoming: true,
      old_price: null,
      new_price: usd('17.99'),
      monthly_change: null,
      annual_change: null,
      direction: null,
      days_left: 2,
    },
    {
      kind: 'price_change',
      subscription_id: 'sub-netflix',
      name: 'Netflix',
      service_mark: MARKS.Netflix!,
      effective_on: '2026-10-01',
      is_upcoming: false,
      old_price: usd('13.99'),
      new_price: usd('15.49'),
      monthly_change: usd('1.50'),
      annual_change: usd('18.00'),
      direction: 'up',
      days_left: null,
    },
  ],
};

const bill = (
  name: string,
  bill_date: string,
  days_until: number,
  price: string,
  cat: CategoryRef,
  is_trial = false,
): UpcomingBill => ({
  subscription_id: `sub-${name.toLowerCase().replace(/[^a-z]+/g, '-')}`,
  name,
  category: cat,
  service_mark: MARKS[name] ?? null,
  bill_date,
  days_until,
  amount: usd(price),
  billing_amount: usd(price),
  is_trial,
});

type UpcomingDay = Upcoming['days'][number];

const day = (date: string, count: number, total: string): UpcomingDay => ({
  date,
  count,
  total: usd(total),
});

/** Alex's earliest start date in the seed (04 §4). */
export const ALEX_TRACKING_SINCE = '2023-10-01';

/**
 * GET /analytics/upcoming for October, as the backend answers at SEED_TODAY.
 * Trials converting are listed but not in the totals (04 §6a), so October is
 * $135.69: every charge that month, unlike Home's $129.20 monthly run rate.
 */
export const alexUpcoming: Upcoming = {
  display_currency: 'USD',
  start: SEED_TODAY,
  end: '2026-10-31',
  total: usd('135.69'),
  days: [
    day('2026-10-01', 1, '2.99'),
    day('2026-10-03', 1, '0.00'),
    day('2026-10-04', 1, '10.99'),
    day('2026-10-08', 1, '4.25'),
    day('2026-10-10', 1, '0.00'),
    day('2026-10-12', 1, '15.49'),
    day('2026-10-15', 2, '26.98'),
    day('2026-10-18', 1, '54.99'),
    day('2026-10-20', 1, '20.00'),
    day('2026-10-22', 1, '0.00'),
  ],
  tracking_since: ALEX_TRACKING_SINCE,
  items: [
    bill('iCloud+', '2026-10-01', 0, '2.99', CATEGORIES.cloudStorage),
    bill('Hulu', '2026-10-03', 2, '17.99', CATEGORIES.entertainment, true),
    bill('Spotify', '2026-10-04', 3, '10.99', CATEGORIES.entertainment),
    bill('New York Times', '2026-10-08', 7, '4.25', CATEGORIES.newsMedia),
    bill('Notion AI', '2026-10-10', 9, '10.00', CATEGORIES.productivity, true),
    bill('Netflix', '2026-10-12', 11, '15.49', CATEGORIES.entertainment),
    bill('Headspace', '2026-10-15', 14, '12.99', CATEGORIES.healthWellness),
    bill('YouTube Premium', '2026-10-15', 14, '13.99', CATEGORIES.entertainment),
    bill('Adobe CC', '2026-10-18', 17, '54.99', CATEGORIES.productivity),
    bill('ChatGPT Plus', '2026-10-20', 19, '20.00', CATEGORIES.aiTools),
    bill('Duolingo Max', '2026-10-22', 21, '13.99', CATEGORIES.other, true),
  ],
};

/** September, as charged: Netflix was still $13.99 and no trial had converted. */
const alexSeptember: Upcoming = {
  display_currency: 'USD',
  start: '2026-09-01',
  end: '2026-09-30',
  total: usd('121.20'),
  days: [
    day('2026-09-01', 1, '2.99'),
    day('2026-09-04', 1, '10.99'),
    day('2026-09-08', 1, '4.25'),
    day('2026-09-12', 1, '13.99'),
    day('2026-09-15', 1, '13.99'),
    day('2026-09-18', 1, '54.99'),
    day('2026-09-20', 1, '20.00'),
  ],
  tracking_since: ALEX_TRACKING_SINCE,
  items: [
    bill('iCloud+', '2026-09-01', -30, '2.99', CATEGORIES.cloudStorage),
    bill('Spotify', '2026-09-04', -27, '10.99', CATEGORIES.entertainment),
    bill('New York Times', '2026-09-08', -23, '4.25', CATEGORIES.newsMedia),
    bill('Netflix', '2026-09-12', -19, '13.99', CATEGORIES.entertainment),
    bill('YouTube Premium', '2026-09-15', -16, '13.99', CATEGORIES.entertainment),
    bill('Adobe CC', '2026-09-18', -13, '54.99', CATEGORIES.productivity),
    bill('ChatGPT Plus', '2026-09-20', -11, '20.00', CATEGORIES.aiTools),
  ],
};

/** November, projected: the three trials have converted; Headspace bills every 2 months. */
const alexNovember: Upcoming = {
  display_currency: 'USD',
  start: '2026-11-01',
  end: '2026-11-30',
  total: usd('164.68'),
  days: [
    day('2026-11-01', 1, '2.99'),
    day('2026-11-03', 1, '17.99'),
    day('2026-11-04', 1, '10.99'),
    day('2026-11-08', 1, '4.25'),
    day('2026-11-10', 1, '10.00'),
    day('2026-11-12', 1, '15.49'),
    day('2026-11-15', 1, '13.99'),
    day('2026-11-18', 1, '54.99'),
    day('2026-11-20', 1, '20.00'),
    day('2026-11-22', 1, '13.99'),
  ],
  tracking_since: ALEX_TRACKING_SINCE,
  items: [
    bill('iCloud+', '2026-11-01', 31, '2.99', CATEGORIES.cloudStorage),
    bill('Hulu', '2026-11-03', 33, '17.99', CATEGORIES.entertainment),
    bill('Spotify', '2026-11-04', 34, '10.99', CATEGORIES.entertainment),
    bill('New York Times', '2026-11-08', 38, '4.25', CATEGORIES.newsMedia),
    bill('Notion AI', '2026-11-10', 40, '10.00', CATEGORIES.productivity),
    bill('Netflix', '2026-11-12', 42, '15.49', CATEGORIES.entertainment),
    bill('YouTube Premium', '2026-11-15', 45, '13.99', CATEGORIES.entertainment),
    bill('Adobe CC', '2026-11-18', 48, '54.99', CATEGORIES.productivity),
    bill('ChatGPT Plus', '2026-11-20', 50, '20.00', CATEGORIES.aiTools),
    bill('Duolingo Max', '2026-11-22', 52, '13.99', CATEGORIES.other),
  ],
};

const lastDayOf = (month: string): string => {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;
};

/** A month's payload moved to another month: same days, same figures. */
function retemplate(template: Upcoming, month: string): Upcoming {
  const move = (date: string) => `${month}${date.slice(7)}`;
  const offset = (date: string) =>
    Math.round((Date.parse(move(date)) - Date.parse(SEED_TODAY)) / 86_400_000);
  return {
    ...template,
    start: `${month}-01`,
    end: lastDayOf(month),
    days: template.days.map((d) => ({ ...d, date: move(d.date) })),
    items: template.items.map((i) => ({
      ...i,
      bill_date: move(i.bill_date),
      days_until: offset(i.bill_date),
    })),
  };
}

/**
 * GET /analytics/upcoming?start&end for one calendar month, as the mock
 * server answers it. September to November are the backend's own figures;
 * later months repeat November (everything is monthly by then, Headspace
 * aside), earlier ones repeat September back to Alex's first subscription.
 * Nothing here is computed from the items: the totals come with the template.
 */
export function upcomingMonthFor(email: string, start: string): Upcoming {
  const month = start.slice(0, 7);
  const empty: Upcoming = {
    display_currency: 'USD',
    start: `${month}-01`,
    end: lastDayOf(month),
    total: usd('0.00'),
    days: [],
    tracking_since: null,
    items: [],
  };
  if (email !== MOCK_EMAILS.full) return empty;
  if (month === '2026-10') return { ...alexUpcoming, start: '2026-10-01' };
  if (month === '2026-09') return alexSeptember;
  if (month === '2026-11') return alexNovember;
  if (month > '2026-11') return retemplate(alexNovember, month);
  if (month >= ALEX_TRACKING_SINCE.slice(0, 7)) return retemplate(alexSeptember, month);
  return { ...empty, tracking_since: ALEX_TRACKING_SINCE };
}

/** A user with no subscriptions: zero totals, nothing listed. */
export const emptySummary: AnalyticsSummary = {
  ...alexSummary,
  monthly_total: usd('0.00'),
  annual_total: usd('0.00'),
  active_count: 0,
  trial_count: 0,
  pending_trials_monthly: usd('0.00'),
  categories: [],
};

export const emptySpend: SpendOverTime = {
  display_currency: 'USD',
  months: [
    { month: '2026-09', amount: usd('0.00') },
    { month: '2026-10', amount: usd('0.00') },
  ],
  current: usd('0.00'),
  previous: usd('0.00'),
  delta_percent: null,
  direction: 'flat',
  enough_history: false,
};

export interface ContractHome {
  summary: AnalyticsSummary;
  spend: SpendOverTime;
  urgent: PriceChanges;
  upcoming: Upcoming;
}

export const contractHome: Record<string, ContractHome> = {
  [MOCK_EMAILS.full]: {
    summary: alexSummary,
    spend: alexSpend,
    urgent: alexUrgent,
    upcoming: alexUpcoming,
  },
  [MOCK_EMAILS.empty]: {
    summary: emptySummary,
    spend: emptySpend,
    urgent: { display_currency: 'USD', items: [] },
    upcoming: {
      ...alexUpcoming,
      total: usd('0.00'),
      days: [],
      tracking_since: null,
      items: [],
    },
  },
};

/**
 * GET /analytics/spend-over-time?months=n: the last n months. Alex has a real
 * year of history; the other accounts keep their short series.
 */
export function spendFor(email: string, months: number): SpendOverTime {
  const spend = contractHomeFor(email).spend;
  if (spend !== alexSpend) return spend;
  return { ...alexSpendYear, months: alexSpendYear.months.slice(-months) };
}

export function contractHomeFor(email: string): ContractHome {
  return contractHome[email] ?? contractHome[MOCK_EMAILS.full]!;
}
