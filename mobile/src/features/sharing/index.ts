/**
 * Epic F seam — shared plans and the cost splitter (US-14, US-15).
 *
 * What this is for
 *   The types Epic F will use, and nothing else. The Family tab exists in the
 *   prototype but is not registered while `FEATURE_SHARING` is false — see
 *   src/navigation/TabNavigator.tsx.
 *
 * The rule Epic F must keep (specification section 9)
 *   Splits are calculated on the SERVER, in integer minor units, with a
 *   per-currency exponent table so JPY has no decimals and leftover cents go to
 *   participants in a fixed order. The client displays shares; it never divides
 *   a total by a number of people. The same "no money math" rule as everywhere
 *   else, and the place it is most tempting to break.
 */

import type { MoneyString } from '@/api/types';

export type SplitMethod = 'equal' | 'percent' | 'fixed';

export interface Participant {
  participant_id: string;
  email: string;
  /** Null until the invited person registers and the invitation is claimed. */
  user_id: string | null;
  status: 'pending' | 'accepted';
  /** This participant's share, computed by the server. Null for a pending invite. */
  share: MoneyString | null;
}

export interface SharingConfig {
  split_method: SplitMethod;
  /** Capped at 20 by the server (specification section 4). */
  participants: Participant[];
}

/**
 * What a participant sees on `/shared-with-me`.
 *
 * Deliberately narrow: the plan name, its cycle and total, and the caller's own
 * share. It carries neither the other participants' emails nor the owner's other
 * subscriptions, because a participant is not entitled to either
 * (specification section 5).
 */
export interface SharedWithMeEntry {
  subscription_id: string;
  name: string;
  total_price: MoneyString;
  currency: MoneyString;
  next_renewal_on: string;
  my_share: MoneyString;
}
