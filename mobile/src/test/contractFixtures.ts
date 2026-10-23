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

export const alexUpcoming: Upcoming = {
  display_currency: 'USD',
  start: SEED_TODAY,
  end: '2026-10-31',
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
    upcoming: { ...alexUpcoming, items: [] },
  },
};

export function contractHomeFor(email: string): ContractHome {
  return contractHome[email] ?? contractHome[MOCK_EMAILS.full]!;
}
