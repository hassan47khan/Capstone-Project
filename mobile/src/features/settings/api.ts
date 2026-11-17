/**
 * Notification rules from the backend (handoff 09 §5, backend/schema.yml):
 * GET and PATCH /me/notification-rules.
 *
 * Kept in this folder so we don't edit src/api; the types come straight from
 * the generated schema, so a contract change is a compile error here.
 */
import { request } from '@/api/client';
import type { components } from '@/api/contract';

// Every field, as the server sends it. reminder_time is "HH:MM:SS".
export type NotificationRules = components['schemas']['NotificationRule'];

// Any subset: the screen saves one row at a time.
export type NotificationRulesPatch =
  components['schemas']['PatchedNotificationRuleUpdateRequest'];

export function getNotificationRules(): Promise<NotificationRules> {
  return request<NotificationRules>('/me/notification-rules');
}

export function updateNotificationRules(
  patch: NotificationRulesPatch,
): Promise<NotificationRules> {
  return request<NotificationRules>('/me/notification-rules', {
    method: 'PATCH',
    body: patch,
  });
}
