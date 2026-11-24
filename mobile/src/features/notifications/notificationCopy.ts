/**
 * Words for push and the Notifications inbox (US-13; spec §10's states:
 * missed-alert banner, permission-denied explanation).
 */
import { formatDateShort, formatDateSpoken } from '@/api/format';

import type { InboxNotification } from './api';

export const PUSH_COPY = {
  deniedTitle: 'Alerts will stay in the app',
  deniedBody:
    "Push is off, so SubTrak can't warn you on your lock screen. Trial and renewal alerts will still show up in Notifications, under the bell on Home.",
  deniedOk: 'Got it',
} as const;

export const INBOX_COPY = {
  title: 'Notifications',
  loading: 'Loading notifications',
  emptyTitle: 'No alerts yet',
  emptyBody:
    "We'll let you know here before a trial ends, a subscription renews, or a price goes up.",
  blockedTitle: 'Push is off for SubTrak',
  blockedBody: 'Alerts only show up here until you turn notifications on.',
  blockedAction: 'Open Settings',
  unread: 'Unread',
} as const;

/** "2 alerts didn't reach your phone" (US-13's missed-alert banner). */
export function missedTitle(count: number): string {
  return count === 1
    ? "1 alert didn't reach your phone"
    : `${count} alerts didn't reach your phone`;
}

export const MISSED_BODY = "We couldn't deliver the push, so it's listed below.";

/** The bell's spoken name, with the count when there is one. */
export function bellLabel(unread: number): string {
  if (unread <= 0) return 'Notifications';
  return `Notifications, ${unread} unread`;
}

/** The bell's badge: a count, capped so it fits. */
export function badgeText(unread: number): string {
  return unread > 9 ? '9+' : String(unread);
}

/** The user's local calendar date of an ISO timestamp, as YYYY-MM-DD. */
function localDate(iso: string): string | null {
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return null;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}`;
}

export function receivedOn(row: InboxNotification): string {
  const date = localDate(row.created_at);
  return date ? formatDateShort(date) : '';
}

/** One row, read as a sentence. */
export function rowLabel(row: InboxNotification): string {
  const date = localDate(row.created_at);
  const parts = [row.read ? null : INBOX_COPY.unread, row.title, row.body];
  if (date) parts.push(formatDateSpoken(date));
  return parts.filter(Boolean).join('. ');
}
