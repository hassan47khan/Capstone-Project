/**
 * GET and PATCH /me/notification-rules for the mock API (handoff 09 §5).
 *
 * Copied from the real backend (scratch database, 2026-11-03): every account
 * starts with the model's defaults below, PATCH changes only the fields it is
 * sent and ignores unknown ones, a time comes back as "HH:MM:SS", and a value
 * out of range is a 400 that names the field, with the server's own wording.
 */
import type { NotificationRules, NotificationRulesPatch } from '@/features/settings/api';

export const DEFAULT_NOTIFICATION_RULES: NotificationRules = {
  days_before_reminder: 3,
  reminder_time: '09:00:00',
  send_push: true,
  send_email: false,
  alert_on_any_price_change: true,
  price_alert_threshold: null,
  weekly_summary_enabled: false,
  monthly_report_enabled: false,
  report_delivery_day: 1,
  trial_alert_days_before: 2,
};

// The serializer's ranges (backend/notifications/serializers.py).
const RANGES = {
  days_before_reminder: [1, 30],
  report_delivery_day: [1, 28],
  trial_alert_days_before: [1, 14],
} as const;

const FIELDS = Object.keys(DEFAULT_NOTIFICATION_RULES) as (keyof NotificationRules)[];

let rulesByEmail: Record<string, NotificationRules> = {};

export function resetNotificationRules(): void {
  rulesByEmail = {};
}

export function notificationRulesFor(email: string): NotificationRules {
  return rulesByEmail[email] ?? DEFAULT_NOTIFICATION_RULES;
}

interface UpdateResult {
  rules?: NotificationRules;
  error?: { code: string; message: string; fields: Record<string, string[]> };
}

export function updateMockNotificationRules(email: string, body: unknown): UpdateResult {
  const input = (body ?? {}) as Record<string, unknown>;
  const patch: NotificationRulesPatch = {};
  for (const field of FIELDS) {
    if (field in input) Object.assign(patch, { [field]: input[field] });
  }

  for (const [field, [min, max]] of Object.entries(RANGES)) {
    const value = patch[field as keyof typeof RANGES];
    if (value === undefined) continue;
    const message =
      value > max
        ? `Ensure this value is less than or equal to ${max}.`
        : value < min
          ? `Ensure this value is greater than or equal to ${min}.`
          : null;
    if (message) {
      return {
        error: { code: 'validation_error', message, fields: { [field]: [message] } },
      };
    }
  }

  // "18:30" is stored and sent back as "18:30:00".
  if (patch.reminder_time && patch.reminder_time.length === 5) {
    patch.reminder_time = `${patch.reminder_time}:00`;
  }

  const rules = { ...notificationRulesFor(email), ...patch };
  rulesByEmail[email] = rules;
  return { rules };
}
