/**
 * Shared plan calls (handoff 11 §2.6, backend/schema.yml `/shared-plans`).
 *
 * Kept in this folder so src/api isn't touched. The server splits every bill
 * (largest remainder, owner first) and totals what's owed; the client only
 * shows the figures it gets back.
 *
 * Until shared plans have real storage, the backend answers create and remind
 * with 404 `shared_plans_unavailable` for every account but the demo one
 * (#172). `isSharedPlansUnavailable` lets the screen say so plainly instead of
 * showing "not found".
 */
import { request } from '@/api/client';
import { ApiError } from '@/api/errors';
import type {
  NewParticipantRequest,
  Reminder,
  SharedPlan,
  SharedPlanList,
} from '@/api/contract';

export const sharedPlanKeys = {
  all: ['shared-plans'] as const,
  list: () => [...sharedPlanKeys.all, 'list'] as const,
};

export const SHARED_PLANS_UNAVAILABLE = 'shared_plans_unavailable';

/** True for the backend's "not available yet" answer (#172). */
export function isSharedPlansUnavailable(error: unknown): boolean {
  return error instanceof ApiError && error.code === SHARED_PLANS_UNAVAILABLE;
}

/** The caller's plans and what the others still owe them. */
export function listSharedPlans(): Promise<SharedPlanList> {
  return request<SharedPlanList>('/shared-plans');
}

/** Splits one subscription equally. You are added first. 409 `already_shared`. */
export function createSharedPlan(
  subscriptionId: string,
  participants: NewParticipantRequest[],
): Promise<SharedPlan> {
  return request<SharedPlan>('/shared-plans', {
    method: 'POST',
    body: { subscription_id: subscriptionId, split_mode: 'equal', participants },
  });
}

/**
 * Reminds someone about their share. `channel: 'email'` means the server sent
 * it; `share_sheet` means open the OS share sheet with `message`.
 * 409 `already_paid`, 429 `throttled` (one a day).
 */
export function remindParticipant(planId: string, paymentId: string): Promise<Reminder> {
  return request<Reminder>(
    `/shared-plans/${encodeURIComponent(planId)}/payments/${encodeURIComponent(paymentId)}/remind`,
    { method: 'POST' },
  );
}
