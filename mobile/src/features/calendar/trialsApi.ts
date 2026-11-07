/**
 * Trial Shield calls (handoff 11 §2.5, backend/schema.yml `/trials`).
 *
 * Kept in this folder so src/api isn't touched. The server sorts the trials,
 * works out days left, progress and urgency, and totals what's at risk; the
 * screen only draws them.
 */
import { request } from '@/api/client';
import type { Trial, TrialDecisionEnum, TrialList } from '@/api/contract';

export const trialKeys = {
  all: ['trials'] as const,
  list: () => [...trialKeys.all, 'list'] as const,
};

/** Trials that haven't converted, fewest days left first. */
export function listTrials(): Promise<TrialList> {
  return request<TrialList>('/trials');
}

/** "Keep it" (stop nagging) or "Remind me". */
export function decideTrial(
  subscriptionId: string,
  decision: TrialDecisionEnum,
): Promise<Trial> {
  return request<Trial>(`/trials/${encodeURIComponent(subscriptionId)}/decision`, {
    method: 'POST',
    body: { decision },
  });
}
