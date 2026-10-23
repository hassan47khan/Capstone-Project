/**
 * Wording for Home (handoff 06). Every number here comes from the API already
 * computed and rounded; these functions only choose words around it. No money
 * is added, subtracted or rounded on the client (06 §3, §9).
 */
import type { PriceChangeItem, SpendOverTime } from '@/api/analyticsTypes';
import { formatDateShort, formatMoney } from '@/api/format';

/** 06 §2.1: before 12:00 morning, before 18:00 afternoon, otherwise evening. */
export function greetingFor(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

/** Initials for the avatar: "Alex Kim" → "AK", "sam" → "S". */
export function initialsFor(nameOrEmail: string): string {
  const words = nameOrEmail
    .split('@')[0]!
    .split(/[\s._-]+/)
    .filter(Boolean);
  return words
    .slice(0, 2)
    .map((word) => word[0]!.toUpperCase())
    .join('');
}

/** The server sends a signed string ("-1.2"); the arrow carries the sign. */
export function unsigned(value: string): string {
  return value.startsWith('-') ? value.slice(1) : value;
}

export interface DeltaWords {
  /** "2.4%", or null for "No change from last month". */
  percent: string | null;
  rest: string;
  direction: 'up' | 'down' | 'flat';
}

/** 06 §2.2's delta row, or null to hide it (no previous month, or $0 spend). */
export function deltaFor(spend: SpendOverTime): DeltaWords | null {
  if (!spend.direction) return null;
  if (spend.direction === 'flat') {
    return { percent: null, rest: 'No change from last month', direction: 'flat' };
  }
  if (spend.delta_percent === null) return null;
  return {
    percent: `${unsigned(spend.delta_percent)}%`,
    rest: 'from last month',
    direction: spend.direction,
  };
}

/** "+$18.00" / "-$12.00", from a signed server amount. */
export function signedMoney(amount: string, currency: string): string {
  const { display } = formatMoney(unsigned(amount), currency);
  return `${amount.startsWith('-') ? '-' : '+'}${display}`;
}

export interface AlertWords {
  title: string;
  message: string;
  /** What a screen reader hears for the whole card (06 §8). */
  label: string;
}

function daysPhrase(days: number): string {
  if (days <= 0) return 'today';
  if (days === 1) return 'tomorrow';
  return `in ${days} days`;
}

/**
 * One Urgent attention card (06 §2.4).
 *   price change  "Netflix price increase" / "$13.99 → $15.49 · +$18.00/yr since Oct 1"
 *   trial ending  "Hulu trial ends in 2 days" / "You'll be charged $17.99 on Oct 3."
 *
 * The frame's body ends "/mo"; the contract's price-change item carries no
 * cycle, so the per-period suffix is left off and the annual figure (which is
 * right for any cycle) carries the weight.
 */
export function alertFor(item: PriceChangeItem): AlertWords {
  const date = formatDateShort(item.effective_on);
  const next = formatMoney(item.new_price.amount, item.new_price.currency).display;

  if (item.kind === 'trial_ending') {
    const when = daysPhrase(item.days_left ?? 0);
    return {
      title: `${item.name} trial ends ${when}`,
      message: `You'll be charged ${next} on ${date}.`,
      label: `${item.name} trial ends ${when}. You'll be charged ${next} on ${date}.`,
    };
  }

  const before = item.old_price
    ? formatMoney(item.old_price.amount, item.old_price.currency).display
    : null;
  const yearly = item.annual_change
    ? signedMoney(item.annual_change.amount, item.annual_change.currency)
    : null;
  const yearlySpoken = item.annual_change
    ? formatMoney(unsigned(item.annual_change.amount), item.annual_change.currency)
        .display
    : null;
  const rose = item.direction !== 'down';
  const when = item.is_upcoming ? `on ${date}` : `since ${date}`;
  const prices = before ? `${before} → ${next}` : next;

  return {
    title: `${item.name} price ${rose ? 'increase' : 'decrease'}`,
    message:
      [prices, yearly ? `${yearly}/yr` : null].filter(Boolean).join(' · ') + ` ${when}`,
    label:
      `${item.name} price ${rose ? 'increased' : 'decreased'}` +
      (before ? ` from ${before} to ${next}` : ` to ${next}`) +
      (yearlySpoken ? `, ${yearlySpoken} ${rose ? 'more' : 'less'} per year` : '') +
      `, ${when}.`,
  };
}
