/**
 * Gmail and extraction calls (handoff 11 §2.3–2.4, backend/schema.yml).
 *
 * Kept in this folder, like features/subscriptions/api.ts, so src/api (Hassan's)
 * isn't touched. Every type comes from the generated contract.
 *
 * Nothing here creates a subscription except `confirmExtraction`, which is
 * the "Confirm and track" button (11 §2.7 rule 1).
 */
import { request } from '@/api/client';
import type {
  components,
  GmailConnection,
  PendingExtractionList,
  Scan,
  SubscriptionDetail,
  SubscriptionInputRequest,
} from '@/api/contract';

export type NotificationRule = components['schemas']['NotificationRule'];

/** Cache keys for this feature. Pending is read by ConnectEmail and Review. */
export const extractionKeys = {
  all: ['extractions'] as const,
  pending: () => [...extractionKeys.all, 'pending'] as const,
  rules: () => ['notification-rules'] as const,
};

/** Trades the OAuth code for read-only Gmail access. 400 `gmail_denied`. */
export function connectGmail(input: {
  code: string;
  codeVerifier: string;
  redirectUri: string;
}): Promise<GmailConnection> {
  return request<GmailConnection>('/integrations/gmail/connect', {
    method: 'POST',
    body: {
      code: input.code,
      code_verifier: input.codeVerifier,
      redirect_uri: input.redirectUri,
    },
  });
}

/** Revokes Gmail at Google and deletes every pending extraction. */
export function disconnectGmail(): Promise<void> {
  return request<void>('/integrations/gmail', { method: 'DELETE' });
}

/**
 * Starts a scan; results arrive in `listPending`.
 * 409 `gmail_not_connected`, 429 `throttled`, 503 `extraction_unavailable`.
 */
export function startScan(): Promise<Scan> {
  return request<Scan>('/extractions/scan', { method: 'POST' });
}

/** What the scan found, waiting for review. `scanning` is true while it runs. */
export function listPending(): Promise<PendingExtractionList> {
  return request<PendingExtractionList>('/extractions/pending');
}

/** "Confirm and track": the only call that turns a review into a subscription. */
export function confirmExtraction(
  id: string,
  input: SubscriptionInputRequest,
): Promise<SubscriptionDetail> {
  return request<SubscriptionDetail>(`/extractions/${encodeURIComponent(id)}/confirm`, {
    method: 'POST',
    body: input,
  });
}

/** Throws the review away, snippet included. */
export function discardExtraction(id: string): Promise<void> {
  return request<void>(`/extractions/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

/** The user's reminder rules; Review reads `trial_alert_days_before`. */
export function getNotificationRules(): Promise<NotificationRule> {
  return request<NotificationRule>('/me/notification-rules');
}
