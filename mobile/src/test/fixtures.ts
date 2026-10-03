/**
 * Synthetic fixture data.
 *
 * What this is for
 *   The dataset behind both the Jest mocks and the in-app mock transport. One
 *   set of fixtures, two consumers, so a screen looks the same in a test as it
 *   does when you run the app with mocks on.
 *
 * Why the numbers are what they are
 *   They RECONCILE, and that is the whole point. Category amounts sum exactly to
 *   the monthly total; percentages sum to exactly 100 using the largest-remainder
 *   method the server uses (specification section 9); the annual figure is
 *   exactly twelve times the monthly one. Fixtures that do not add up train you
 *   to ignore numbers that look wrong, which is how a real arithmetic bug ships.
 *
 * Privacy
 *   Everything here is invented. The capstone guidelines forbid real personal or
 *   financial data, so names, emails and amounts are made up and the domain is a
 *   reserved test domain that cannot receive mail.
 *
 * The four users exist to cover the states screens must handle
 *   alex   — a full account: many subscriptions, a trial, a cancelled one
 *   sam    — a brand new account with nothing in it (empty states)
 *   rosa   — one subscription in a currency with no exchange rate (US-4 marker)
 *   morgan — an account locked by failed logins (US-2, HTTP 423)
 */

import type {
  Analytics,
  CategoryBreakdownRow,
  CurrencyOption,
  Dashboard,
  NotificationPreferences,
  Subscription,
  UserProfile,
  UserSettings,
} from '@/api/types';

/**
 * "Today" for the mock data. Fixed rather than `new Date()` so a snapshot taken
 * in March still matches one taken in October, and so "in 3 days" is stable.
 * Matches the date on the prototype's Home screen.
 */
export const MOCK_TODAY = '2026-09-30';

/** Test-domain emails. `.test` is reserved by RFC 2606 and cannot resolve. */
export const MOCK_EMAILS = {
  full: 'alex@subtrak.test',
  empty: 'sam@subtrak.test',
  missingRate: 'rosa@subtrak.test',
  locked: 'morgan@subtrak.test',
} as const;

/** The password every mock account accepts. */
export const MOCK_PASSWORD = 'Testpass1!';

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export const mockProfiles: Record<string, UserProfile> = {
  alex: {
    id: 'usr_alex',
    email: MOCK_EMAILS.full,
    name: 'Alex Kim',
    email_verified: true,
  },
  sam: {
    id: 'usr_sam',
    email: MOCK_EMAILS.empty,
    name: 'Sam Rivera',
    email_verified: true,
  },
  rosa: {
    id: 'usr_rosa',
    email: MOCK_EMAILS.missingRate,
    name: 'Rosa Delgado',
    email_verified: true,
  },
};

export const mockSettings: UserSettings = {
  currency: 'USD',
  timezone: 'America/New_York',
  timezone_set: true,
};

/** Sam has never opened Settings, so no zone is set — drives the "not set" state. */
export const mockSettingsNoTimezone: UserSettings = {
  currency: 'USD',
  timezone: null,
  timezone_set: false,
};

export const mockNotificationPreferences: NotificationPreferences = {
  trial_reminders: true,
  renewal_reminders: true,
  price_change_alerts: true,
  discreet: false,
};

// ---------------------------------------------------------------------------
// Currencies
// ---------------------------------------------------------------------------

const RATES_AS_OF = '2026-09-30';

/**
 * The picker list. ARS deliberately has no stored rate: US-4 says such a currency
 * is not offered as a display currency, so the UI must filter it out rather than
 * showing a option that cannot work.
 */
export const mockCurrencies: CurrencyOption[] = [
  {
    code: 'USD',
    name: 'US Dollar',
    symbol: '$',
    rate_available: true,
    rate_as_of: RATES_AS_OF,
  },
  {
    code: 'EUR',
    name: 'Euro',
    symbol: '€',
    rate_available: true,
    rate_as_of: RATES_AS_OF,
  },
  {
    code: 'GBP',
    name: 'British Pound',
    symbol: '£',
    rate_available: true,
    rate_as_of: RATES_AS_OF,
  },
  {
    code: 'JPY',
    name: 'Japanese Yen',
    symbol: '¥',
    rate_available: true,
    rate_as_of: RATES_AS_OF,
  },
  {
    code: 'CAD',
    name: 'Canadian Dollar',
    symbol: '$',
    rate_available: true,
    rate_as_of: RATES_AS_OF,
  },
  {
    code: 'AUD',
    name: 'Australian Dollar',
    symbol: '$',
    rate_available: true,
    rate_as_of: RATES_AS_OF,
  },
  {
    code: 'CHF',
    name: 'Swiss Franc',
    symbol: 'CHF',
    rate_available: true,
    rate_as_of: RATES_AS_OF,
  },
  {
    code: 'INR',
    name: 'Indian Rupee',
    symbol: '₹',
    rate_available: true,
    rate_as_of: RATES_AS_OF,
  },
  // No rate stored. Must not appear as a selectable display currency.
  {
    code: 'ARS',
    name: 'Argentine Peso',
    symbol: '$',
    rate_available: false,
    rate_as_of: null,
  },
];

// ---------------------------------------------------------------------------
// Alex's subscriptions
// ---------------------------------------------------------------------------

/** Builds a subscription, defaulting the fields most records share. */
function sub(
  partial: Partial<Subscription> & Pick<Subscription, 'id' | 'name' | 'price'>,
): Subscription {
  return {
    category: 'other',
    currency: 'USD',
    cycle: { unit: 'month', count: 1 },
    next_renewal_on: MOCK_TODAY,
    status: 'active',
    trial: null,
    // For a monthly USD subscription the monthly equivalent IS the price. Yearly
    // ones override it below, which is where the server's normalisation shows.
    monthly_equivalent: partial.price,
    reminder_enabled: true,
    revisions: [],
    created_at: '2026-01-15T10:00:00Z',
    ...partial,
  };
}

/**
 * Twelve active subscriptions, one trial, one cancelled.
 *
 * Spread across all seven categories plus a null one, so the stacked bar, the
 * legend, the category filter chips and the "Uncategorized" label all have real
 * data to render. Category subtotals are stated against each group and are what
 * the breakdown below reports.
 */
export const mockSubscriptions: Subscription[] = [
  // --- streaming: 15.49 + 11.99 + 13.99 = 41.47 ----------------------------
  sub({
    id: 'sub_netflix',
    name: 'Streamly Plus',
    category: 'streaming',
    price: '15.49',
    next_renewal_on: '2026-10-03',
    revisions: [
      // Drives the price-history list on the detail screen.
      { changed_at: '2025-10-03T12:00:00Z', field: 'price', old: '13.99', new: '15.49' },
    ],
    created_at: '2024-03-02T09:00:00Z',
  }),
  sub({
    id: 'sub_music',
    name: 'Tempo Music Premium',
    category: 'streaming',
    price: '11.99',
    next_renewal_on: '2026-10-07',
  }),
  sub({
    id: 'sub_video',
    name: 'ClipHouse Premium',
    category: 'streaming',
    price: '13.99',
    next_renewal_on: '2026-10-18',
  }),

  // --- fitness: 34.99 ------------------------------------------------------
  sub({
    id: 'sub_gym',
    name: 'Northside Gym',
    category: 'fitness',
    price: '34.99',
    next_renewal_on: '2026-10-09',
  }),

  // --- cloud_storage: 2.99 -------------------------------------------------
  sub({
    id: 'sub_storage',
    name: 'Nimbus Drive 200 GB',
    category: 'cloud_storage',
    price: '2.99',
    next_renewal_on: '2026-10-12',
  }),

  // --- software: 20.00 + 59.99 + 10.00 + 10.00 = 99.99 ---------------------
  sub({
    id: 'sub_assistant',
    name: 'Lumen Assistant Pro',
    category: 'software',
    price: '20.00',
    next_renewal_on: '2026-10-15',
  }),
  sub({
    id: 'sub_creative',
    name: 'Palette Creative Suite',
    category: 'software',
    price: '59.99',
    next_renewal_on: '2026-10-22',
  }),
  sub({
    id: 'sub_notes',
    name: 'Draftboard',
    category: 'software',
    price: '10.00',
    next_renewal_on: '2026-11-01',
  }),
  sub({
    id: 'sub_codehelp',
    name: 'Copilot Dev Tools',
    category: 'software',
    price: '10.00',
    next_renewal_on: '2026-11-05',
  }),

  // --- utilities: 25.00 ----------------------------------------------------
  sub({
    id: 'sub_mobile',
    name: 'Ridge Mobile Data',
    category: 'utilities',
    price: '25.00',
    next_renewal_on: '2026-10-20',
  }),

  // --- uncategorized: 4.00 -------------------------------------------------
  sub({
    id: 'sub_news',
    name: 'The Daily Ledger',
    category: null,
    price: '4.00',
    next_renewal_on: '2026-10-28',
  }),

  // --- insurance: 144.00 a year, which normalises to 12.00 a month ---------
  sub({
    id: 'sub_insurance',
    name: 'Harbour Renters Insurance',
    category: 'insurance',
    price: '144.00',
    cycle: { unit: 'year', count: 1 },
    next_renewal_on: '2027-03-01',
    // The server divides by the cycle length. This is the one record that proves
    // the client is reading a server-computed value rather than the raw price.
    monthly_equivalent: '12.00',
  }),

  // --- excluded from every total ------------------------------------------
  sub({
    id: 'sub_trial',
    name: 'Audioshelf Unlimited',
    category: 'streaming',
    price: '9.99',
    status: 'trial',
    trial: { ends_on: '2026-10-20' },
    next_renewal_on: '2026-10-20',
    // Trials are excluded from totals until they convert (specification
    // section 9), so this contributes to trial_conversion_total only.
    monthly_equivalent: '9.99',
  }),
  sub({
    id: 'sub_cancelled',
    name: 'Old Backup Service',
    category: 'cloud_storage',
    price: '5.00',
    status: 'cancelled',
    next_renewal_on: '2026-08-01',
    reminder_enabled: false,
  }),
];

/**
 * Category breakdown for Alex.
 *
 * Amounts: 99.99 + 41.47 + 34.99 + 25.00 + 12.00 + 4.00 + 2.99 = 220.44, which
 * is exactly `monthly_total` below.
 *
 * Percentages: the exact shares are 45.3593, 18.8122, 15.8728, 11.3410, 5.4437,
 * 1.8146 and 1.3564. Flooring those gives 96, so the largest-remainder method
 * hands the four spare points to the four largest fractions — fitness (.8728),
 * uncategorized (.8146), streaming (.8122) and insurance (.4437). The result
 * sums to exactly 100, which is what the server guarantees and what the UI
 * renders without recomputation.
 */
export const mockCategoryBreakdown: CategoryBreakdownRow[] = [
  { category: 'software', amount: '99.99', percent: 45 },
  { category: 'streaming', amount: '41.47', percent: 19 },
  { category: 'fitness', amount: '34.99', percent: 16 },
  { category: 'utilities', amount: '25.00', percent: 11 },
  { category: 'insurance', amount: '12.00', percent: 6 },
  { category: null, amount: '4.00', percent: 2 },
  { category: 'cloud_storage', amount: '2.99', percent: 1 },
];

/** Active subscriptions, soonest renewal first — the order the API promises. */
const upcoming = mockSubscriptions
  .filter((s) => s.status === 'active')
  .sort((a, b) => a.next_renewal_on.localeCompare(b.next_renewal_on));

export const mockDashboard: Dashboard = {
  currency: 'USD',
  monthly_total: '220.44',
  // 220.44 x 12, computed by the server. Stated exactly, not derived here.
  annual_total: '2645.28',
  active_count: 12,
  // What Alex would pay if the one trial converted: 220.44 + 9.99.
  trial_conversion_total: '230.43',
  trial_count: 1,
  category_breakdown: mockCategoryBreakdown,
  upcoming_renewals: upcoming.slice(0, 4),
  rates_as_of: RATES_AS_OF,
  unconverted_count: 0,
  // Epic H populates this. Null until then, so the banner slot renders nothing.
  notice: null,
};

export const mockAnalytics: Analytics = {
  currency: 'USD',
  monthly_total: '220.44',
  annual_projection: '2645.28',
  category_breakdown: mockCategoryBreakdown,
  largest_subscriptions: [
    {
      id: 'sub_creative',
      name: 'Palette Creative Suite',
      category: 'software',
      amount: '59.99',
      percent: 27,
    },
    {
      id: 'sub_gym',
      name: 'Northside Gym',
      category: 'fitness',
      amount: '34.99',
      percent: 16,
    },
    {
      id: 'sub_mobile',
      name: 'Ridge Mobile Data',
      category: 'utilities',
      amount: '25.00',
      percent: 11,
    },
  ],
  rates_as_of: RATES_AS_OF,
};

// ---------------------------------------------------------------------------
// Sam — the empty account
// ---------------------------------------------------------------------------

/** Drives the empty states on Home, Subscriptions and Insights. */
export const mockEmptyDashboard: Dashboard = {
  currency: 'USD',
  monthly_total: '0.00',
  annual_total: '0.00',
  active_count: 0,
  trial_conversion_total: null,
  trial_count: 0,
  category_breakdown: [],
  upcoming_renewals: [],
  rates_as_of: RATES_AS_OF,
  unconverted_count: 0,
  notice: null,
};

export const mockEmptyAnalytics: Analytics = {
  currency: 'USD',
  monthly_total: '0.00',
  annual_projection: '0.00',
  category_breakdown: [],
  largest_subscriptions: [],
  rates_as_of: RATES_AS_OF,
};

// ---------------------------------------------------------------------------
// Rosa — a subscription in a currency with no exchange rate
// ---------------------------------------------------------------------------

/**
 * US-4: a subscription whose currency has no stored rate is shown unconverted
 * with a visible marker and is NEVER silently summed. The server signals that by
 * setting `monthly_equivalent` to null and counting it in `unconverted_count`.
 */
export const mockUnconvertedSubscription: Subscription = sub({
  id: 'sub_unconverted',
  name: 'Fútbol Pass',
  category: 'streaming',
  price: '4500.00',
  currency: 'ARS',
  next_renewal_on: '2026-10-11',
  monthly_equivalent: null,
});

export const mockMissingRateSubscriptions: Subscription[] = [
  sub({
    id: 'sub_rosa_news',
    name: 'Civic Weekly',
    category: null,
    price: '6.00',
    next_renewal_on: '2026-10-05',
  }),
  mockUnconvertedSubscription,
];

export const mockMissingRateDashboard: Dashboard = {
  currency: 'USD',
  // 6.00 only. The ARS subscription is excluded because it cannot be converted.
  monthly_total: '6.00',
  annual_total: '72.00',
  active_count: 2,
  trial_conversion_total: null,
  trial_count: 0,
  category_breakdown: [{ category: null, amount: '6.00', percent: 100 }],
  upcoming_renewals: mockMissingRateSubscriptions,
  rates_as_of: RATES_AS_OF,
  // The flag that makes the UI show the marker rather than quietly under-reporting.
  unconverted_count: 1,
  notice: null,
};

export const mockMissingRateAnalytics: Analytics = {
  currency: 'USD',
  monthly_total: '6.00',
  annual_projection: '72.00',
  category_breakdown: [{ category: null, amount: '6.00', percent: 100 }],
  largest_subscriptions: [
    {
      id: 'sub_rosa_news',
      name: 'Civic Weekly',
      category: null,
      amount: '6.00',
      percent: 100,
    },
  ],
  rates_as_of: RATES_AS_OF,
};

// ---------------------------------------------------------------------------
// Per-account lookup used by the route table
// ---------------------------------------------------------------------------

export interface MockAccount {
  profile: UserProfile;
  settings: UserSettings;
  subscriptions: Subscription[];
  dashboard: Dashboard;
  analytics: Analytics;
}

export const mockAccounts: Record<string, MockAccount> = {
  [MOCK_EMAILS.full]: {
    profile: mockProfiles.alex!,
    settings: mockSettings,
    subscriptions: mockSubscriptions,
    dashboard: mockDashboard,
    analytics: mockAnalytics,
  },
  [MOCK_EMAILS.empty]: {
    profile: mockProfiles.sam!,
    settings: mockSettingsNoTimezone,
    subscriptions: [],
    dashboard: mockEmptyDashboard,
    analytics: mockEmptyAnalytics,
  },
  [MOCK_EMAILS.missingRate]: {
    profile: mockProfiles.rosa!,
    settings: mockSettings,
    subscriptions: mockMissingRateSubscriptions,
    dashboard: mockMissingRateDashboard,
    analytics: mockMissingRateAnalytics,
  },
};

/** The account served when a test does not care which user is signed in. */
export const defaultAccount = mockAccounts[MOCK_EMAILS.full]!;
