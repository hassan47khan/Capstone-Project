/**
 * The /analytics payloads of the frozen API contract (backend/schema.yml,
 * handoff 04 §5).
 *
 * Now generated: every type here is an alias of the generated schema in
 * `generated/schema.ts`, so a change to the contract is a compile error here
 * instead of a surprise on a device. The old names are kept so imports in Home
 * and the subscriptions screens did not have to change; new code can import
 * from `@/api/contract` directly.
 *
 * Every amount is a decimal string with its currency, already converted to the
 * display currency and rounded by the server. Nothing here is summed on the
 * client.
 */
import type {
  CategoryRef as ContractCategoryRef,
  CategorySpend as ContractCategorySpend,
  ContractMoney as Money,
  PriceChange,
  PriceChanges as ContractPriceChanges,
  ServiceMark,
  SpendOverTime as ContractSpendOverTime,
  Summary,
  Upcoming as ContractUpcoming,
  UpcomingBill as ContractUpcomingBill,
} from './contract';

export type ContractMoney = Money;
export type CategoryRef = ContractCategoryRef;
export type ServiceMarkRef = ServiceMark;
export type CategorySpend = ContractCategorySpend;

/** GET /analytics/summary?period=current_month */
export type AnalyticsSummary = Summary;

/** GET /analytics/spend-over-time?months=n */
export type SpendOverTime = ContractSpendOverTime;

export type PriceChangeItem = PriceChange;

/** GET /analytics/price-changes */
export type PriceChanges = ContractPriceChanges;

export type UpcomingBill = ContractUpcomingBill;

/** GET /analytics/upcoming?days=n */
export type Upcoming = ContractUpcoming;
