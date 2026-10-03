/**
 * Epic B endpoints — profile, settings, notification preferences, currencies.
 *
 * What this is for
 *   The signed-in user's own record and the lists the Settings screens need.
 *
 * Everything here is scoped to the caller by the server; there is no user id in
 * any path, which is what makes it impossible for the client to ask for someone
 * else's settings by accident.
 */

import { request } from '../client';
import type {
  CurrencyOption,
  NotificationPreferences,
  Paginated,
  UserProfile,
  UserSettings,
} from '../types';

/** The signed-in user's profile. */
export function getProfile(): Promise<UserProfile> {
  return request<UserProfile>('/me');
}

/** Updates name or email. Changing an email re-triggers verification server-side. */
export function updateProfile(
  body: Partial<Pick<UserProfile, 'name' | 'email'>>,
): Promise<UserProfile> {
  return request<UserProfile>('/me', { method: 'PATCH', body });
}

/** Display currency and time zone (US-4, US-5). */
export function getSettings(): Promise<UserSettings> {
  return request<UserSettings>('/me/settings');
}

/**
 * Changes the display currency or time zone.
 *
 * Both have consequences beyond this screen, which is why
 * `settingsWriteInvalidations` in queryKeys.ts sweeps the dashboard and the
 * subscription list too: currency re-converts every total, and the time zone
 * moves every reminder.
 *
 * A currency with no stored exchange rate is rejected with a 400 (US-4). The
 * picker already filters those out, but the server does not rely on that.
 */
export function updateSettings(body: Partial<UserSettings>): Promise<UserSettings> {
  return request<UserSettings>('/me/settings', { method: 'PATCH', body });
}

/** Per-alert-type switches, including the discreet-notifications option. */
export function getNotificationPreferences(): Promise<NotificationPreferences> {
  return request<NotificationPreferences>('/me/notification-preferences');
}

/**
 * Replaces the whole preference set.
 *
 * PUT rather than PATCH because the server owns the full set; sending a partial
 * update would make "which switches did I actually change?" ambiguous when two
 * devices write at once.
 */
export function updateNotificationPreferences(
  body: NotificationPreferences,
): Promise<NotificationPreferences> {
  return request<NotificationPreferences>('/me/notification-preferences', {
    method: 'PUT',
    body,
  });
}

/**
 * Currencies for the picker (US-4).
 *
 * The response includes currencies WITHOUT a stored rate, flagged
 * `rate_available: false`. The picker must filter those out rather than offering
 * a choice that cannot be honoured — see the Currency screen.
 */
export function listCurrencies(): Promise<CurrencyOption[]> {
  return request<Paginated<CurrencyOption>>('/currencies').then((page) => page.results);
}
