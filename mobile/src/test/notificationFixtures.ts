/**
 * The in-app inbox and /devices for the mock API (US-13).
 *
 * Shaped like the real views (backend/notifications/views.py): newest first,
 * `unread_count` and `missed_count` count unread rows only, reading an alert
 * is idempotent, another account's id is a 404, and registering the same
 * token twice returns the same device.
 *
 * Alex has three alerts: a trial warning whose push never arrived (missed),
 * an unread renewal, and a read price increase. Everyone else has none.
 */
import type {
  Device,
  InboxNotification,
  NotificationList,
} from '@/features/notifications/api';

import { MOCK_EMAILS } from './fixtures';

/** An hour apart, fixed so tests and screenshots don't drift. */
const ALEX_INBOX: InboxNotification[] = [
  {
    id: 'ntf-hulu-trial',
    kind: 'trial_ending',
    title: 'Hulu trial ends soon',
    body: 'Your Hulu trial ends on 2026-10-04. Cancel before then to avoid the charge.',
    subscription_id: 'sub-hulu',
    created_at: '2026-10-01T13:00:00Z',
    read: false,
    missed: true,
    push_status: 'failed',
  },
  {
    id: 'ntf-spotify-renewal',
    kind: 'renewal',
    title: 'Spotify renews soon',
    body: 'Spotify renews on 2026-10-05.',
    subscription_id: 'sub-spotify',
    created_at: '2026-10-01T12:00:00Z',
    read: false,
    missed: false,
    push_status: 'sent',
  },
  {
    id: 'ntf-youtube-price',
    kind: 'price_increase',
    title: 'YouTube Premium went up',
    body: 'YouTube Premium charged $15.99, up from $13.99.',
    subscription_id: 'sub-youtube-premium',
    created_at: '2026-09-28T13:00:00Z',
    read: true,
    missed: false,
    push_status: 'sent',
  },
];

let readIds = new Set<string>();
let devices: Record<string, { device: Device; email: string }> = {};

export function resetNotifications(): void {
  readIds = new Set();
  devices = {};
}

function rowsFor(email: string): InboxNotification[] {
  const rows = email === MOCK_EMAILS.full ? ALEX_INBOX : [];
  return rows.map((row) => (readIds.has(row.id) ? { ...row, read: true } : row));
}

export function inboxFor(email: string): NotificationList {
  const results = rowsFor(email);
  const unread = results.filter((row) => !row.read);
  return {
    unread_count: unread.length,
    missed_count: unread.filter((row) => row.missed).length,
    results,
  };
}

/** False when the id isn't one of this account's (the server's 404). */
export function markMockRead(email: string, id: string): boolean {
  if (!rowsFor(email).some((row) => row.id === id)) return false;
  readIds.add(id);
  return true;
}

/** Same token, same device; it moves to whoever registered it last. */
export function registerMockDevice(
  email: string,
  token: string,
  platform: string,
): Device {
  const existing = devices[token];
  const device: Device = existing?.device ?? {
    id: `dev-${Object.keys(devices).length + 1}`,
    platform: platform === 'android' ? 'android' : 'ios',
    active: true,
    last_seen_at: '2026-10-01T12:00:00Z',
  };
  devices[token] = { device, email };
  return device;
}

/** False when the id isn't one of this account's devices. */
export function deleteMockDevice(email: string, id: string): boolean {
  const entry = Object.entries(devices).find(
    ([, value]) => value.device.id === id && value.email === email,
  );
  if (!entry) return false;
  delete devices[entry[0]];
  return true;
}

/** Test helper: the devices currently registered to an account. */
export function mockDevicesFor(email: string): Device[] {
  return Object.values(devices)
    .filter((value) => value.email === email)
    .map((value) => value.device);
}
