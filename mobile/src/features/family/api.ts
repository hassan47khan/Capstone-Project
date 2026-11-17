/**
 * Family calls (handoff 10, backend/schema.yml `/family`, `/invitations`).
 *
 * Kept in this folder so src/api isn't touched. Every figure (the family
 * total, each member's total, each subscription's monthly amount) comes from
 * the server in the family's currency; the client only shows them.
 */
import { request } from '@/api/client';
import { ApiError } from '@/api/errors';
import type { components } from '@/api/contract';

type Schemas = components['schemas'];
export type Family = Schemas['Family'];
export type FamilyMember = Schemas['FamilyMember'];
export type FamilyMemberDetail = Schemas['FamilyMemberDetail'];
export type FamilySubscription = Schemas['FamilySubscription'];
export type FamilyRole = Schemas['FamilyRoleEnum'];
export type Invitation = Schemas['Invitation'];
export type InvitationPreview = Schemas['InvitationPreview'];
export type MemberChanges = Schemas['PatchedMemberUpdateRequest'];
export type FamilyChanges = Schemas['PatchedFamilyUpdateRequest'];

export const familyKeys = {
  all: ['family'] as const,
  dashboard: () => [...familyKeys.all, 'dashboard'] as const,
  member: (id: string) => [...familyKeys.all, 'member', id] as const,
  invitation: (token: string) => [...familyKeys.all, 'invitation', token] as const,
};

/** 404 `no_family`: show "Start a family", not an error. */
export function isNoFamily(error: unknown): boolean {
  return error instanceof ApiError && error.code === 'no_family';
}

export function getFamily(): Promise<Family> {
  return request<Family>('/family');
}

export function createFamily(name: string): Promise<Family> {
  return request<Family>('/family', { method: 'POST', body: { name } });
}

export function updateFamily(changes: FamilyChanges): Promise<Family> {
  return request<Family>('/family', { method: 'PATCH', body: changes });
}

const member = (id: string) => `/family/members/${encodeURIComponent(id)}`;

export function getMember(id: string): Promise<FamilyMemberDetail> {
  return request<FamilyMemberDetail>(member(id));
}

export function updateMember(
  id: string,
  changes: MemberChanges,
): Promise<FamilyMemberDetail> {
  return request<FamilyMemberDetail>(member(id), { method: 'PATCH', body: changes });
}

/** Removes someone (admins), or leaves when it's your own id. */
export function removeMember(id: string): Promise<void> {
  return request<void>(member(id), { method: 'DELETE' });
}

/** 409 `already_member`, `already_invited`, `seat_limit_reached`. */
export function invite(email: string, role: FamilyRole): Promise<Invitation> {
  return request<Invitation>('/family/invitations', {
    method: 'POST',
    body: { email, role },
  });
}

const invitation = (id: string) => `/family/invitations/${encodeURIComponent(id)}`;

export function resendInvitation(id: string): Promise<Invitation> {
  return request<Invitation>(`${invitation(id)}/resend`, { method: 'POST' });
}

export function revokeInvitation(id: string): Promise<void> {
  return request<void>(invitation(id), { method: 'DELETE' });
}

/** The token goes in the body, never the URL (the server logs paths). */
export function previewInvitation(token: string): Promise<InvitationPreview> {
  return request<InvitationPreview>('/invitations/preview', {
    method: 'POST',
    body: { token },
  });
}

export function acceptInvitation(token: string): Promise<Family> {
  return request<Family>('/invitations/accept', { method: 'POST', body: { token } });
}
