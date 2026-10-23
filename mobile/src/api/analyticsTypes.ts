/**
 * The /analytics payloads of the frozen API contract (backend/schema.yml,
 * handoff 04 §5), written by hand so Home can be built now.
 *
 * TODO(generated client): delete this file when src/api is generated from
 * schema.yml. Field names and nullability here mirror the schema exactly, so
 * the swap is an import change.
 *
 * Every amount is a decimal string with its currency, already converted to the
 * display currency and rounded by the server. Nothing here is summed on the
 * client.
 */
import type { CurrencyCode, DateOnly, MoneyString } from './types';

export interface ContractMoney {
  amount: MoneyString;
  currency: CurrencyCode;
}

export interface CategoryRef {
  slug: string;
  display_name: string;
  /** Key into the theme's category colours, e.g. "aiTools". */
  color_token_key: string;
}

export interface ServiceMarkRef {
  mark: string;
  brand_hex: string;
  tint_hex: string;
}

export interface CategorySpend {
  category: CategoryRef | null;
  /** Rounded so the rows sum to monthly_total exactly. */
  amount: ContractMoney;
  /** Whole percent; the rows sum to exactly 100. */
  percent: number;
  /** Exact share to two places, e.g. "42.56". */
  share: string;
}

/** GET /analytics/summary?period=current_month */
export interface AnalyticsSummary {
  period: 'current_month';
  display_currency: CurrencyCode;
  monthly_total: ContractMoney;
  annual_total: ContractMoney;
  active_count: number;
  trial_count: number;
  pending_trials_monthly: ContractMoney;
  unconverted_count: number;
  rates_as_of: DateOnly | null;
  /** Largest first. */
  categories: CategorySpend[];
}

/** GET /analytics/spend-over-time?months=n */
export interface SpendOverTime {
  display_currency: CurrencyCode;
  months: { month: string; amount: ContractMoney }[];
  current: ContractMoney;
  previous: ContractMoney | null;
  /** Signed, one place, e.g. "1.2". */
  delta_percent: string | null;
  direction: 'up' | 'down' | 'flat' | null;
  enough_history: boolean;
}

export interface PriceChangeItem {
  kind: 'price_change' | 'trial_ending';
  subscription_id: string;
  name: string;
  service_mark: ServiceMarkRef | null;
  effective_on: DateOnly;
  is_upcoming: boolean;
  old_price: ContractMoney | null;
  new_price: ContractMoney;
  monthly_change: ContractMoney | null;
  annual_change: ContractMoney | null;
  direction: 'up' | 'down' | null;
  days_left: number | null;
}

/** GET /analytics/price-changes */
export interface PriceChanges {
  display_currency: CurrencyCode;
  /** Newest effective date first. */
  items: PriceChangeItem[];
}

export interface UpcomingBill {
  subscription_id: string;
  name: string;
  category: CategoryRef | null;
  service_mark: ServiceMarkRef | null;
  bill_date: DateOnly;
  /** 0 is today; negative is in the past. */
  days_until: number;
  /** What is charged, in the display currency. Null without an FX rate. */
  amount: ContractMoney | null;
  billing_amount: ContractMoney;
  is_trial: boolean;
}

/** GET /analytics/upcoming?days=n */
export interface Upcoming {
  display_currency: CurrencyCode;
  start: DateOnly;
  end: DateOnly;
  /** Soonest first. */
  items: UpcomingBill[];
}
