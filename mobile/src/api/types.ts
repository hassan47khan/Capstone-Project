/**
 * API data transfer objects.
 *
 * What this is for
 *   The TypeScript shape of every payload the SubTrak API sends and receives for
 *   Epics A, B and C. These types are what make "the client does no money math"
 *   enforceable: amounts are typed as strings, so multiplying two of them is a
 *   compile error rather than a rounding bug.
 *
 * TODO: replace with generated types.
 *   The specification (section 5) says the backend publishes an OpenAPI schema via
 *   drf-spectacular, and the client should generate from `backend/schema.yml`.
 *   That file does not exist yet — the backend is still a scaffold — so every type
 *   here is hand-written from specification section 5 and must be regenerated once
 *   the schema lands. Until then these are an assumption, not a contract, and any
 *   mismatch surfaces the first time the app runs against the real API.
 *
 * Conventions, from specification section 5
 *   - Money is a decimal STRING ("15.49") plus an ISO 4217 currency code. Never a
 *     number: IEEE-754 floats cannot represent 0.1, and a cent lost in a total is
 *     the kind of bug users notice immediately.
 *   - Calendar dates are "YYYY-MM-DD" in the user's time zone.
 *   - Instants are ISO 8601 in UTC.
 *   - A list is always scoped to the authenticated caller by the server.
 */

import type { Category } from '@/theme/tokens';

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/**
 * A decimal money amount as a string, e.g. "15.49" or "1733.40".
 *
 * The brand (`__money`) makes this assignable from a string literal but not
 * accidentally interchangeable with an arbitrary string in a function signature,
 * which documents intent without costing a runtime wrapper.
 */
export type MoneyString = string & { readonly __money?: never };

/** ISO 4217 code, uppercase: "USD", "EUR", "JPY". */
export type CurrencyCode = string;

/** Calendar date, "YYYY-MM-DD". Not an instant — it has no time or zone. */
export type DateOnly = string;

/** ISO 8601 instant in UTC, e.g. "2026-10-02T09:00:00Z". */
export type Instant = string;

/** An amount always travels with its currency. Never pass one without the other. */
export interface Money {
  amount: MoneyString;
  currency: CurrencyCode;
}

// ---------------------------------------------------------------------------
// Errors — specification section 5
// ---------------------------------------------------------------------------

/**
 * The single error shape every endpoint uses.
 *
 * `fields` is present on 400 responses and maps a form field name to its
 * messages, which is what lets a form show the error inline on the right input
 * rather than as one banner at the top.
 */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    fields?: Record<string, string[]>;
  };
}

/**
 * Error codes the client branches on. Anything not listed falls through to the
 * server's `message`, so a new backend code degrades to "show what it said"
 * rather than to a blank screen.
 */
export type KnownErrorCode =
  | 'invalid_credentials'
  | 'account_locked'
  | 'email_not_verified'
  | 'duplicate_email'
  | 'token_expired'
  | 'token_invalid'
  | 'price_invalid'
  | 'validation_error'
  | 'not_found'
  | 'throttled'
  | 'extraction_unavailable'
  | 'server_error'
  | 'network_error';

// ---------------------------------------------------------------------------
// Epic A — Account Management (US-1 to US-3)
// ---------------------------------------------------------------------------

export interface RegisterRequest {
  email: string;
  password: string;
}

/** Registration creates an INACTIVE user and emails a link; it returns no tokens. */
export interface RegisterResponse {
  email: string;
  verification_sent: boolean;
}

export interface LoginRequest {
  email: string;
  password: string;
}

/**
 * Access token lives 15 minutes, refresh token 7 days (specification section 6).
 * Both carry a `tv` claim so a password reset invalidates every session at once.
 */
export interface TokenPair {
  access: string;
  refresh: string;
}

export interface RefreshRequest {
  refresh: string;
}

export interface VerifyEmailRequest {
  token: string;
}

export interface PasswordResetRequestBody {
  email: string;
}

export interface PasswordResetConfirmBody {
  token: string;
  password: string;
}

// ---------------------------------------------------------------------------
// Epic B — Settings and Preferences (US-4, US-5, plus profile/preference gaps)
// ---------------------------------------------------------------------------

export interface UserProfile {
  id: string;
  email: string;
  name: string | null;
  email_verified: boolean;
}

export interface UserSettings {
  /** Display currency. Each subscription keeps the currency it is billed in. */
  currency: CurrencyCode;
  /** IANA zone name, e.g. "America/New_York". Null until the user picks one. */
  timezone: string | null;
  /**
   * False when the user has never chosen a zone. The app shows a "Time zone not
   * set" state, and the server treats them as UTC (specification section 8).
   */
  timezone_set: boolean;
}

/**
 * One switch per alert type. `discreet` replaces the subscription name with
 * generic text in push payloads, for anyone who does not want their lock screen
 * announcing what they subscribe to (specification section 11).
 */
export interface NotificationPreferences {
  trial_reminders: boolean;
  renewal_reminders: boolean;
  price_change_alerts: boolean;
  discreet: boolean;
}

/**
 * A currency offered in the picker.
 *
 * `rate_available` is false when no exchange rate has been stored. Those are not
 * offered as a display currency, and a subscription billed in one is shown
 * unconverted with a visible marker rather than silently summed (US-4).
 */
export interface CurrencyOption {
  code: CurrencyCode;
  name: string;
  symbol: string;
  rate_available: boolean;
  /** Date of the rate being used. Shown in the picker footnote. */
  rate_as_of: DateOnly | null;
}

// ---------------------------------------------------------------------------
// Epic C — Dashboard and Expense Tracking (US-6 to US-8)
// ---------------------------------------------------------------------------

/**
 * Billing cycle as `{unit, count}` — covers weekly, monthly, annual and
 * "every 6 weeks" with one shape (specification section 4).
 */
export interface BillingCycle {
  unit: 'day' | 'week' | 'month' | 'year';
  count: number;
}

/**
 * Lifecycle status.
 *   trial     — in a free trial; excluded from totals until it converts
 *   active    — counted in every total
 *   cancelled — kept for history, excluded from totals
 */
export type SubscriptionStatus = 'trial' | 'active' | 'cancelled';

export interface TrialTerms {
  ends_on: DateOnly;
}

/** One entry in the price history shown on the detail screen. */
export interface Revision {
  changed_at: Instant;
  field: string;
  old: string | null;
  new: string | null;
}

export interface Subscription {
  id: string;
  name: string;
  /** Null renders as "Uncategorized" and uses the `other` colour triplet (US-8). */
  category: Category | null;
  /** The price as billed, in the currency it is billed in. Never converted here. */
  price: MoneyString;
  currency: CurrencyCode;
  cycle: BillingCycle;
  next_renewal_on: DateOnly;
  status: SubscriptionStatus;
  trial: TrialTerms | null;
  /**
   * Monthly-equivalent cost in the user's DISPLAY currency, computed by the
   * server (specification section 9). Null when the subscription's currency has
   * no stored exchange rate — the client then shows it unconverted and marked,
   * and it is excluded from totals.
   */
  monthly_equivalent: MoneyString | null;
  /** Whether a renewal reminder is scheduled for this subscription. */
  reminder_enabled: boolean;
  revisions: Revision[];
  created_at: Instant;
}

/** The create/edit payload. Mirrors the manual form in the prototype. */
export interface SubscriptionInput {
  name: string;
  price: MoneyString;
  currency: CurrencyCode;
  category: Category | null;
  cycle: BillingCycle;
  next_renewal_on: DateOnly;
  status?: SubscriptionStatus;
  trial?: TrialTerms | null;
  reminder_enabled: boolean;
}

/**
 * One row of the category breakdown (US-8).
 *
 * `percent` is computed server-side with the largest-remainder method so the
 * rows sum to exactly 100. The client renders it and never recomputes it —
 * re-deriving from `amount` would reintroduce the rounding error the server
 * just removed.
 */
export interface CategoryBreakdownRow {
  category: Category | null;
  amount: MoneyString;
  percent: number;
}

export interface CategoryBreakdown {
  currency: CurrencyCode;
  rows: CategoryBreakdownRow[];
}

/**
 * The Home screen payload (US-6).
 *
 * Every total is pre-computed and pre-converted by the server.
 */
export interface Dashboard {
  /** The user's display currency. All totals below are in it. */
  currency: CurrencyCode;
  monthly_total: MoneyString;
  annual_total: MoneyString;
  active_count: number;
  /**
   * Monthly total the user WOULD pay if every current trial converted. Shown as
   * a separate line; never folded into `monthly_total` (specification section 9).
   */
  trial_conversion_total: MoneyString | null;
  trial_count: number;
  category_breakdown: CategoryBreakdownRow[];
  /** Soonest-renewing subscriptions, already sorted by the server. */
  upcoming_renewals: Subscription[];
  /** Date of the exchange rates used, so the UI can say how fresh they are. */
  rates_as_of: DateOnly | null;
  /**
   * Subscriptions excluded from totals because their currency has no stored
   * rate. Present so the UI can show the marker required by US-4 rather than
   * silently dropping them.
   */
  unconverted_count: number;
  /** A notice to display in the banner slot, or null for no banner. */
  notice: DashboardNotice | null;
}

/**
 * Banner content supplied by the server. Epic H populates this with price-change
 * alerts; until then it is always null and the banner renders nothing.
 */
export interface DashboardNotice {
  code: string;
  message: string;
  subscription_id: string | null;
}

/** Insights screen (US-17 plus the largest-subscriptions list from the prototype). */
export interface Analytics {
  currency: CurrencyCode;
  monthly_total: MoneyString;
  annual_projection: MoneyString;
  category_breakdown: CategoryBreakdownRow[];
  largest_subscriptions: LargestSubscriptionRow[];
  rates_as_of: DateOnly | null;
}

export interface LargestSubscriptionRow {
  id: string;
  name: string;
  category: Category | null;
  amount: MoneyString;
  /** Share of the monthly total, server-computed like every other percentage. */
  percent: number;
}

// ---------------------------------------------------------------------------
// Seams for later epics — typed now so query keys and routes stay stable
// ---------------------------------------------------------------------------

/** Epic G (US-16). Not fetched in Phases 0–3; the type exists so the seam compiles. */
export interface BillingEvent {
  id: string;
  subscription_id: string;
  charged_on: DateOnly;
  amount: MoneyString;
  currency: CurrencyCode;
  source: 'scheduled' | 'manual';
  confirmed: boolean;
}

/** Cursor-paginated list envelope, used by the subscription and event lists. */
export interface Paginated<T> {
  results: T[];
  next: string | null;
  count: number;
}
