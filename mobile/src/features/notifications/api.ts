/**
 * Devices and the in-app inbox (US-13; backend/schema.yml):
 * POST /devices, DELETE /devices/{id}, GET /notifications and
 * POST /notifications/{id}/read.
 *
 * Kept in this folder so we don't edit src/api; the types come straight from
 * the generated schema, so a contract change is a compile error here.
 */
import { request } from '@/api/client';
import type { components } from '@/api/contract';

export type Device = components['schemas']['Device'];
export type DevicePlatform = components['schemas']['PlatformEnum'];
export type InboxNotification = components['schemas']['Notification'];
export type NotificationList = components['schemas']['NotificationList'];

/**
 * The inbox's cache key. Local for now so src/api stays untouched; it belongs
 * in queryKeys.ts eventually, like `chargesKey`.
 */
export const notificationsKey = ['notifications', 'inbox'] as const;

/** Idempotent on the server: the same token again refreshes the same row. */
export function registerDevice(token: string, platform: DevicePlatform): Promise<Device> {
  return request<Device>('/devices', { method: 'POST', body: { token, platform } });
}

export function deleteDevice(id: string): Promise<void> {
  return request<void>(`/devices/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

/** Newest first. The server folds in anything already due first (spec §8). */
export function listNotifications(): Promise<NotificationList> {
  return request<NotificationList>('/notifications');
}

export function markNotificationRead(id: string): Promise<void> {
  return request<void>(`/notifications/${encodeURIComponent(id)}/read`, {
    method: 'POST',
  });
}
