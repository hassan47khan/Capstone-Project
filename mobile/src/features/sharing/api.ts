/**
 * Shared plan calls (handoff 11 §2.6, backend/schema.yml `/shared-plans`).
 *
 * Kept in this folder so src/api isn't touched. The server splits every bill
 * (largest remainder, owner first) and totals what's owed; the client only
 * shows the figures it gets back.
 *
 * Mark paid (`.../paid`) is newer than the generated client (#174), so its
 * body is typed here; it answers with the same `SharedPlan` as the list.
 */
import { request } from '@/api/client';
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

/**
 * Records that someone paid you back this month, or undoes it with
 * `paid: false`. Returns the plan with its counts redone by the server.
 * 409 `owner_share`: your own share is always paid.
 */
export function markPaid(
  planId: string,
  paymentId: string,
  paid: boolean,
): Promise<SharedPlan> {
  return request<SharedPlan>(
    `/shared-plans/${encodeURIComponent(planId)}/payments/${encodeURIComponent(paymentId)}/paid`,
    { method: 'POST', body: { paid } },
  );
}
