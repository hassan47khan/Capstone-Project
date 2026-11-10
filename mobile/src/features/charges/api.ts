/**
 * Charges from the backend (US-16, US-19; backend/schema.yml):
 * GET /charges and POST /charges/{id}/confirm.
 *
 * When a bill date passes, the server records the charge at the price on
 * file, unconfirmed. "Was the charge different?" lets the user confirm it or
 * enter what they were really charged. Only a confirmed charge can raise a
 * price-increase alert; the server decides that, not the app.
 *
 * Kept in this folder so we don't edit src/api; the types come straight from
 * the generated schema, so a contract change is a compile error here.
 */
import { request } from '@/api/client';
import type { components } from '@/api/contract';
import type { MoneyString } from '@/api/types';

export type Charge = components['schemas']['Charge'];
export type ChargeList = components['schemas']['ChargeList'];
export type ChargeOutcome = components['schemas']['ChargeOutcomeEnum'];

/**
 * The cache key for the unconfirmed list. Local for now so src/api stays
 * untouched; it belongs in queryKeys.ts beside `billingEvents` eventually.
 */
export const chargesKey = ['charges', 'unconfirmed'] as const;

export function listCharges(): Promise<ChargeList> {
  return request<ChargeList>('/charges');
}

/** No amount confirms the expected one. The amount is in the charge's currency. */
export function confirmCharge(id: string, amount?: MoneyString): Promise<Charge> {
  return request<Charge>(`/charges/${encodeURIComponent(id)}/confirm`, {
    method: 'POST',
    body: amount === undefined ? {} : { amount },
  });
}
