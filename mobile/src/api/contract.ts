/**
 * Named types for every schema in the frozen API contract (backend/schema.yml).
 *
 * What this is for
 *   `generated/schema.ts` is machine output and its types are reached through
 *   `components['schemas'][...]`. This file gives each one a plain name so a
 *   screen writes `ContractSubscription` rather than the indexed form.
 *
 * Do not edit `generated/schema.ts`. Regenerate it with `npm run api:generate`
 * whenever backend/schema.yml changes; CI fails if the committed copy is stale.
 *
 * Names
 *   Aliases that would collide with a hand-written type in `types.ts`
 *   (`Subscription`, `UserProfile`, `Money`) carry a `Contract` prefix. The
 *   hand-written ones describe an earlier guess at the API, and several are
 *   still imported by merged code, so they keep their names until their owners
 *   move across.
 */

import type { components, operations, paths } from './generated/schema';

export type { components, operations, paths };

type Schemas = components['schemas'];

// --- Money, errors, shared ---------------------------------------------------
export type ContractMoney = Schemas['Money'];
export type ContractError = Schemas['Error'];
export type ContractErrorDetail = Schemas['ErrorDetail'];
export type Cooldown = Schemas['Cooldown'];
export type Health = Schemas['Health'];
export type CategoryRef = Schemas['CategoryRef'];
export type ServiceMark = Schemas['ServiceMark'];

// --- Auth and profile --------------------------------------------------------
export type RegisterRequestBody = Schemas['RegisterRequest'];
export type RegisterResult = Schemas['RegisterResponse'];
export type LoginRequestBody = Schemas['LoginRequest'];
export type RefreshRequestBody = Schemas['RefreshRequest'];
export type EmailRequestBody = Schemas['EmailRequest'];
export type EmailTokenRequestBody = Schemas['EmailTokenRequest'];
export type PasswordResetConfirmRequestBody = Schemas['PasswordResetConfirmRequest'];
export type ContractTokenPair = Schemas['TokenPair'];
export type ContractUserProfile = Schemas['UserProfile'];
export type PatchedProfileUpdateRequest = Schemas['PatchedProfileUpdateRequest'];

// --- Subscriptions -----------------------------------------------------------
export type ContractSubscription = Schemas['Subscription'];
export type SubscriptionDetail = Schemas['SubscriptionDetail'];
export type SubscriptionList = Schemas['SubscriptionList'];
export type SubscriptionInputRequest = Schemas['SubscriptionInputRequest'];
export type PatchedSubscriptionInputRequest = Schemas['PatchedSubscriptionInputRequest'];
export type HistoryEvent = Schemas['HistoryEvent'];
export type HistoryValue = Schemas['HistoryValue'];
export type BillingCycleEnum = Schemas['BillingCycleEnum'];
export type CustomCycleUnitEnum = Schemas['CustomCycleUnitEnum'];
export type SubscriptionStatusEnum = Schemas['SubscriptionStatusEnum'];
export type SubscriptionTypeEnum = Schemas['SubscriptionTypeEnum'];
export type EventTypeEnum = Schemas['EventTypeEnum'];

// --- Analytics ---------------------------------------------------------------
export type Summary = Schemas['Summary'];
export type CategorySpend = Schemas['CategorySpend'];
export type SpendOverTime = Schemas['SpendOverTime'];
export type MonthSpend = Schemas['MonthSpend'];
export type PriceChanges = Schemas['PriceChanges'];
export type PriceChange = Schemas['PriceChange'];
export type Upcoming = Schemas['Upcoming'];
export type UpcomingBill = Schemas['UpcomingBill'];
export type AtRisk = Schemas['AtRisk'];
export type PeriodEnum = Schemas['PeriodEnum'];

// --- AI epic: extractions, trials, Gmail -------------------------------------
export type Scan = Schemas['Scan'];
export type ScanStatusEnum = Schemas['ScanStatusEnum'];
export type PendingExtraction = Schemas['PendingExtraction'];
export type PendingExtractionList = Schemas['PendingExtractionList'];
export type ExtractedFields = Schemas['ExtractedFields'];
export type ExtractionConfidence = Schemas['ExtractionConfidence'];
export type ExtractionSource = Schemas['ExtractionSource'];
export type Trial = Schemas['Trial'];
export type TrialList = Schemas['TrialList'];
export type TrialDecisionInputRequest = Schemas['TrialDecisionInputRequest'];
export type TrialDecisionEnum = Schemas['TrialDecisionEnum'];
export type UrgencyEnum = Schemas['UrgencyEnum'];
export type GmailConnection = Schemas['GmailConnection'];
export type GmailConnectInputRequest = Schemas['GmailConnectInputRequest'];
export type ProviderEnum = Schemas['ProviderEnum'];

// --- Shared plans ------------------------------------------------------------
export type SharedPlan = Schemas['SharedPlan'];
export type SharedPlanList = Schemas['SharedPlanList'];
export type SharedPlanInputRequest = Schemas['SharedPlanInputRequest'];
export type Participant = Schemas['Participant'];
export type NewParticipantRequest = Schemas['NewParticipantRequest'];
export type Reminder = Schemas['Reminder'];
export type PaymentStatusEnum = Schemas['PaymentStatusEnum'];
export type SplitModeEnum = Schemas['SplitModeEnum'];
export type ChannelEnum = Schemas['ChannelEnum'];
