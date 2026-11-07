/**
 * Mock data for the AI epic screens (handoff 11 §2): Trial Shield, Shared
 * plans, and what a Gmail scan finds. Shaped exactly like backend/schema.yml.
 *
 * The figures are the seed's (04 §4) on SEED_TODAY, 2026-10-01: the three
 * trials match the TrialShield frame (29/31, 21/30, 9/30 days elapsed), and
 * Netflix split three ways is $5.17 + $5.16 + $5.16 with Sam still owing. Every
 * figure was copied from the server's answers, not worked out here.
 */
import type {
  components,
  PendingExtraction,
  SharedPlanList,
  Trial,
  TrialList,
} from '@/api/contract';

import { CATEGORIES, MARKS } from './contractFixtures';

const usd = (amount: string) => ({ amount, currency: 'USD' });
const monthly = {
  billing_cycle: 'monthly' as const,
  custom_cycle_count: null,
  custom_cycle_unit: null,
};

function trial(
  id: string,
  name: string,
  price: string,
  endsOn: string,
  length: number,
  elapsed: number,
  urgency: Trial['urgency'],
  category: Trial['category'],
): Trial {
  return {
    ...monthly,
    subscription_id: id,
    name,
    category,
    service_mark: MARKS[name as keyof typeof MARKS] ?? null,
    price: usd(price),
    trial_ends_on: endsOn,
    trial_length_days: length,
    days_left: length - elapsed,
    elapsed_days: elapsed,
    progress: Number((elapsed / length).toFixed(3)),
    urgency,
    at_risk: urgency === 'soon',
    decision: 'none',
    reminder_enabled: true,
    reminder_on: endsOn,
  };
}

export const alexTrials: TrialList = {
  display_currency: 'USD',
  alert_days_before: 3,
  at_risk: { count: 1, amount: usd('17.99') },
  results: [
    trial(
      'sub-hulu',
      'Hulu',
      '17.99',
      '2026-10-03',
      31,
      29,
      'soon',
      CATEGORIES.entertainment,
    ),
    trial(
      'sub-notion-ai',
      'Notion AI',
      '10.00',
      '2026-10-10',
      30,
      21,
      'later',
      CATEGORIES.productivity,
    ),
    trial(
      'sub-duolingo-max',
      'Duolingo Max',
      '13.99',
      '2026-10-22',
      30,
      9,
      'far',
      CATEGORIES.other,
    ),
  ],
};

export const noTrials: TrialList = {
  display_currency: 'USD',
  alert_days_before: 3,
  at_risk: { count: 0, amount: usd('0.00') },
  results: [],
};

export const SHARED_PLAN_ID = 'plan-netflix';

export const alexSharedPlans: SharedPlanList = {
  display_currency: 'USD',
  outstanding: usd('5.16'),
  results: [
    {
      ...monthly,
      id: SHARED_PLAN_ID,
      subscription_id: 'sub-netflix',
      name: 'Netflix',
      service_mark: MARKS.Netflix!,
      price: usd('15.49'),
      split_mode: 'equal',
      period: '2026-10',
      participant_count: 3,
      paid_count: 2,
      your_share: usd('5.17'),
      participants: [
        {
          id: 'part-alex',
          payment_id: 'pay-alex',
          display_name: 'Alex Kim',
          email: 'alex@subtrak.test',
          position: 0,
          is_owner: true,
          share: usd('5.17'),
          status: 'paid',
          paid_at: '2026-10-01T00:00:00Z',
          last_reminded_at: null,
        },
        {
          id: 'part-jordan',
          payment_id: 'pay-jordan',
          display_name: 'Jordan Kim',
          email: 'jordan@subtrak.test',
          position: 1,
          is_owner: false,
          share: usd('5.16'),
          status: 'paid',
          paid_at: '2026-10-01T00:00:00Z',
          last_reminded_at: null,
        },
        {
          id: 'part-sam',
          payment_id: 'pay-sam',
          display_name: 'Sam Kim',
          email: null,
          position: 2,
          is_owner: false,
          share: usd('5.16'),
          status: 'pending',
          paid_at: null,
          last_reminded_at: null,
        },
      ],
    },
  ],
};

export const noSharedPlans: SharedPlanList = {
  display_currency: 'USD',
  outstanding: usd('0.00'),
  results: [],
};

const confidence = (
  values: Partial<PendingExtraction['confidence']>,
): PendingExtraction['confidence'] => ({
  service_name: null,
  plan_name: null,
  price: null,
  currency: null,
  billing_cycle: null,
  subscription_type: null,
  trial_ends_on: null,
  start_date: null,
  category: null,
  ...values,
});

/**
 * Hulu's trial email, with Hulu's exact wording from the frame (11 §2.7). The
 * end date scored 54%, so it's flagged: the low-confidence frame `110:432`.
 */
export const huluExtraction: PendingExtraction = {
  id: 'ext-hulu',
  source: {
    sender: 'Hulu <account@hulumail.com>',
    subject: 'Your Hulu free trial has started',
    snippet:
      'Your free trial ends on Oct 19, 2026. After that, you will be charged $17.99 per month.',
  },
  fields: {
    service_name: 'Hulu',
    plan_name: null,
    price: '17.99',
    currency: 'USD',
    ...monthly,
    subscription_type: 'trial',
    trial_ends_on: '2026-10-19',
    start_date: '2026-09-19',
    category: 'entertainment',
  },
  confidence: confidence({
    service_name: 0.98,
    price: 0.96,
    currency: 0.95,
    billing_cycle: 0.92,
    subscription_type: 0.94,
    trial_ends_on: 0.54,
    start_date: 0.72,
    category: 0.9,
  }),
  flagged: ['trial_ends_on'],
  duplicate_of: null,
  created_at: '2026-10-01T09:00:00Z',
  expires_at: '2026-10-02T09:00:00Z',
};

/** A clean receipt: everything above 90%, nothing flagged (frame `110:125`). */
export const spotifyExtraction: PendingExtraction = {
  id: 'ext-spotify',
  source: {
    sender: 'Spotify <no-reply@spotify.com>',
    subject: 'Your receipt from Spotify',
    snippet: 'Thanks for your payment of $11.99 for Spotify Premium Individual.',
  },
  fields: {
    service_name: 'Spotify',
    plan_name: 'Premium Individual',
    price: '11.99',
    currency: 'USD',
    ...monthly,
    subscription_type: 'paid',
    trial_ends_on: null,
    start_date: '2026-09-28',
    category: 'entertainment',
  },
  confidence: confidence({
    service_name: 0.99,
    plan_name: 0.95,
    price: 0.98,
    currency: 0.97,
    billing_cycle: 0.93,
    subscription_type: 0.95,
    start_date: 0.91,
    category: 0.9,
  }),
  flagged: [],
  duplicate_of: null,
  created_at: '2026-10-01T09:00:00Z',
  expires_at: '2026-10-02T09:00:00Z',
};

export const mockScanResults: PendingExtraction[] = [huluExtraction, spotifyExtraction];

export const mockNotificationRule: components['schemas']['NotificationRule'] = {
  days_before_reminder: 3,
  reminder_time: '09:00:00',
  send_push: true,
  send_email: false,
  alert_on_any_price_change: true,
  price_alert_threshold: null,
  weekly_summary_enabled: false,
  monthly_report_enabled: false,
  report_delivery_day: 1,
  trial_alert_days_before: 3,
};
