/**
 * The mock server's family (handoff 10), wired into routes.ts.
 *
 * Alex runs "Kim family" with Jordan (member, $100 limit) and Sam (viewer who
 * can't see the family total), 04 §4.5's figures: $198.16 = 129.20 + 45.98 +
 * 22.98. Jordan's GitHub Pro is private here, so the admin view shows a
 * "Private subscription" row. Everyone else starts in no family.
 *
 * Invitation tokens for the accept screen:
 *   invite-kim      to Kim family for sam@subtrak.test (the empty account)
 *   invite-expired  past its 7 days
 *   invite-used     already accepted
 *   anything else   404 invitation_not_found
 *
 * A fake server, so it adds cents where the real one uses the money engine.
 */
import type { components } from '@/api/contract';

import { MOCK_EMAILS } from './fixtures';

type Schemas = components['schemas'];
type Family = Schemas['Family'];
type Detail = Schemas['FamilyMemberDetail'];
type Invitation = Schemas['Invitation'];
type Role = Schemas['FamilyRoleEnum'];
type Sub = Schemas['FamilySubscription'];

export interface FamilyResponse {
  status: number;
  body: unknown;
}

const usd = (amount: string) => ({ amount, currency: 'USD' });
const cents = (amount: string) => Math.round(Number(amount) * 100);
const dollars = (value: number) => (value / 100).toFixed(2);

function fail(
  status: number,
  code: string,
  message: string,
  field?: string,
): FamilyResponse {
  return {
    status,
    body: {
      error: { code, message, ...(field ? { fields: { [field]: [message] } } : {}) },
    },
  };
}
const ok = (body: unknown, status = 200): FamilyResponse => ({ status, body });

function sub(id: string, name: string, price: string, next: string, mark?: string): Sub {
  return {
    id,
    name,
    is_private: false,
    service_mark: mark ? { mark, brand_hex: '#1f2a24', tint_hex: '#eef1ef' } : null,
    category: null,
    next_bill_date: next,
    billing_price: usd(price),
    monthly: usd(price),
  };
}

const PRIVATE_ROW: Sub = {
  id: null,
  name: null,
  is_private: true,
  service_mark: null,
  category: null,
  next_bill_date: null,
  billing_price: null,
  monthly: usd('4.00'),
};

interface Person {
  detail: Detail;
}

function person(
  id: string,
  name: string,
  email: string,
  role: Role,
  subs: Sub[],
  total: string,
  extra: Partial<Detail> = {},
): Person {
  return {
    detail: {
      id,
      user_id: `usr-${id}`,
      name,
      email,
      role,
      is_you: false,
      can_add_subscriptions: true,
      can_edit_own_subs: true,
      can_view_family_total: true,
      joined_at: '2026-09-01T00:00:00Z',
      spending_limit: null,
      over_limit: false,
      total: usd(total),
      unconverted_count: 0,
      subscriptions: subs,
      ...extra,
    },
  };
}

interface MockFamily {
  id: string;
  name: string;
  seatLimit: number;
  people: Person[];
  invitations: Invitation[];
}

function kimFamily(): MockFamily {
  return {
    id: 'fam-kim',
    name: 'Kim family',
    seatLimit: 5,
    people: [
      person(
        'mem-alex',
        'Alex Kim',
        MOCK_EMAILS.full,
        'admin',
        [
          sub('sub-netflix', 'Netflix', '15.49', '2026-10-12', 'N'),
          sub('sub-spotify', 'Spotify', '11.99', '2026-10-04', 'S'),
          sub('sub-icloud', 'iCloud+', '2.99', '2026-10-08'),
          sub('sub-chatgpt', 'ChatGPT Plus', '20.00', '2026-10-15'),
          sub('sub-adobe', 'Adobe CC', '54.99', '2026-10-18'),
          sub('sub-youtube', 'YouTube Premium', '13.99', '2026-10-21'),
          sub('sub-nyt', 'New York Times', '4.25', '2026-10-24'),
          sub('sub-headspace', 'Headspace', '5.50', '2026-10-15'),
        ],
        '129.20',
      ),
      person(
        'mem-jordan',
        'Jordan Doe',
        'jordan.doe@example.com',
        'member',
        [
          sub('sub-hulu', 'Hulu', '17.99', '2026-10-05', 'H'),
          sub('sub-notion', 'Notion', '10.00', '2026-10-09'),
          sub('sub-disney', 'Disney+', '13.99', '2026-10-22'),
          PRIVATE_ROW,
        ],
        '45.98',
        { spending_limit: usd('100.00') },
      ),
      person(
        'mem-sam',
        'Sam',
        'sam@example.com',
        'viewer',
        [
          sub('sub-dropbox', 'Dropbox Plus', '11.99', '2026-10-03'),
          sub('sub-apple-music', 'Apple Music', '10.99', '2026-10-14'),
        ],
        '22.98',
        { can_view_family_total: false },
      ),
    ],
    invitations: [],
  };
}

let families: MockFamily[] = [];
let accepted = new Set<string>();

export function resetFamilyMock(): void {
  families = [kimFamily()];
  accepted = new Set();
}
resetFamilyMock();

function familyOf(email: string): { family: MockFamily; me: Person } | null {
  for (const family of families) {
    const me = family.people.find((p) => p.detail.email === email);
    if (me) return { family, me };
  }
  return null;
}

const isAdmin = (p: Person) => p.detail.role === 'admin';
const seesAll = (p: Person) => isAdmin(p) || p.detail.can_view_family_total;
const pending = (family: MockFamily) =>
  family.invitations.filter((i) => i.status === 'pending');

function view(family: MockFamily, me: Person): Family {
  const all = seesAll(me);
  const total = family.people.reduce((sum, p) => sum + cents(p.detail.total.amount), 0);
  const taken = family.people.length + pending(family).length;
  return {
    id: family.id,
    name: family.name,
    plan: 'free',
    seat_limit: family.seatLimit,
    seats_used: family.people.length,
    seats_taken: taken,
    can_invite: isAdmin(me) && taken < family.seatLimit,
    invitations: isAdmin(me)
      ? family.invitations.filter((i) => i.status !== 'revoked')
      : [],
    display_currency: 'USD',
    shared_timezone: '',
    fiscal_year_start: 1,
    you: {
      membership_id: me.detail.id,
      role: me.detail.role,
      may_add_subscriptions: me.detail.role !== 'viewer',
      may_edit_subscriptions: me.detail.role !== 'viewer',
      may_view_family_total: all,
    },
    total: all ? usd(dollars(total)) : null,
    unconverted_count: all ? 0 : null,
    members: family.people.map((p) => {
      const visible = all || p === me;
      return {
        id: p.detail.id,
        user_id: p.detail.user_id,
        name: p.detail.name,
        email: p.detail.email,
        role: p.detail.role,
        is_you: p === me,
        subscription_count: p.detail.subscriptions.length,
        total: visible ? p.detail.total : null,
        spending_limit: p.detail.spending_limit,
        over_limit: visible ? p.detail.over_limit : null,
      };
    }),
  };
}

const NO_FAMILY = fail(404, 'no_family', "You're not in a family yet.");
const ADMIN_ONLY = fail(403, 'family_admin_only', 'Only a family admin can do that.');
const LAST_ADMIN = fail(
  409,
  'last_admin',
  'A family needs an admin. Make someone else an admin first.',
);

const ONLY_MEMBER = fail(
  409,
  'only_member',
  "You're the only one in this family. Delete the family instead.",
);

export function getFamily(email: string): FamilyResponse {
  const found = familyOf(email);
  return found ? ok(view(found.family, found.me)) : NO_FAMILY;
}

export function createFamily(
  email: string,
  name: string,
  displayName: string,
): FamilyResponse {
  if (familyOf(email)) {
    return fail(409, 'already_in_family', "You're already in a family. Leave it first.");
  }
  const family: MockFamily = {
    id: `fam-${families.length + 1}`,
    name: name.trim(),
    seatLimit: 5,
    people: [person(`mem-${email}`, displayName, email, 'admin', [], '0.00')],
    invitations: [],
  };
  families.push(family);
  return ok(view(family, family.people[0]!), 201);
}

function target(email: string, id: string) {
  const found = familyOf(email);
  if (!found) return { error: NO_FAMILY };
  const who = found.family.people.find((p) => p.detail.id === id);
  if (!who) return { error: fail(404, 'not_found', 'Not found.') };
  return { ...found, who };
}

function detailFor(who: Person, me: Person): Detail {
  return { ...who.detail, is_you: who === me };
}

export function getMember(email: string, id: string): FamilyResponse {
  const found = target(email, id);
  if ('error' in found) return found.error!;
  if (!isAdmin(found.me) && found.who !== found.me)
    return fail(404, 'not_found', 'Not found.');
  return ok(detailFor(found.who, found.me));
}

export function updateMember(email: string, id: string, body: unknown): FamilyResponse {
  const found = target(email, id);
  if ('error' in found) return found.error!;
  if (!isAdmin(found.me)) return ADMIN_ONLY;
  const changes = (body ?? {}) as Partial<Detail> & { spending_limit?: string | null };
  const admins = found.family.people.filter(isAdmin).length;
  if (isAdmin(found.who) && changes.role && changes.role !== 'admin' && admins === 1) {
    return LAST_ADMIN;
  }
  const { spending_limit, ...rest } = changes;
  Object.assign(found.who.detail, rest);
  if (spending_limit !== undefined) {
    found.who.detail.spending_limit =
      spending_limit === null ? null : usd(spending_limit);
    found.who.detail.over_limit =
      spending_limit !== null &&
      cents(found.who.detail.total.amount) > cents(spending_limit);
  }
  return ok(detailFor(found.who, found.me));
}

export function removeMember(email: string, id: string): FamilyResponse {
  const found = target(email, id);
  if ('error' in found) return found.error!;
  if (found.who !== found.me && !isAdmin(found.me)) return ADMIN_ONLY;
  if (isAdmin(found.who) && found.family.people.filter(isAdmin).length === 1) {
    if (found.family.people.length === 1) return ONLY_MEMBER;
    return LAST_ADMIN;
  }
  found.family.people = found.family.people.filter((p) => p !== found.who);
  return ok(null, 204);
}

export function invite(email: string, body: unknown): FamilyResponse {
  const found = familyOf(email);
  if (!found) return NO_FAMILY;
  if (!isAdmin(found.me)) return ADMIN_ONLY;
  const { email: to = '', role = 'member' } = (body ?? {}) as {
    email?: string;
    role?: Role;
  };
  const address = to.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address)) {
    return {
      status: 400,
      body: {
        error: {
          code: 'validation_error',
          message: 'Enter a valid email.',
          fields: { email: ['Enter a valid email.'] },
        },
      },
    };
  }
  const { family } = found;
  if (family.people.some((p) => p.detail.email === address)) {
    return fail(409, 'already_member', "They're already in this family.", 'email');
  }
  if (pending(family).some((i) => i.email === address)) {
    return fail(
      409,
      'already_invited',
      'They already have an invitation. Resend it instead.',
      'email',
    );
  }
  if (family.people.length + pending(family).length >= family.seatLimit) {
    return fail(
      409,
      'seat_limit_reached',
      `${family.name} has all ${family.seatLimit} seats taken. Upgrade the plan to add more.`,
    );
  }
  const invitation: Invitation = {
    id: `inv-${family.invitations.length + 1}`,
    email: address,
    role,
    status: 'pending',
    expires_at: '2026-10-08T09:00:00Z',
    sent_at: '2026-10-01T09:00:00Z',
  };
  family.invitations.push(invitation);
  return ok(invitation, 201);
}

function invitationOf(email: string, id: string) {
  const found = familyOf(email);
  if (!found) return { error: NO_FAMILY };
  if (!isAdmin(found.me)) return { error: ADMIN_ONLY };
  const invitation = found.family.invitations.find((i) => i.id === id);
  if (!invitation) return { error: fail(404, 'not_found', 'Not found.') };
  return { invitation };
}

export function resend(email: string, id: string): FamilyResponse {
  const found = invitationOf(email, id);
  if ('error' in found) return found.error!;
  found.invitation.status = 'pending';
  found.invitation.expires_at = '2026-10-08T10:00:00Z';
  return ok(found.invitation);
}

export function revoke(email: string, id: string): FamilyResponse {
  const found = invitationOf(email, id);
  if ('error' in found) return found.error!;
  found.invitation.status = 'revoked';
  return ok(null, 204);
}

const INVITE_FOR = MOCK_EMAILS.empty;
const NOT_FOUND = fail(404, 'invitation_not_found', "This invitation link isn't valid.");

export function preview(email: string, body: unknown): FamilyResponse {
  const { token = '' } = (body ?? {}) as { token?: string };
  const base = {
    family_name: 'Kim family',
    invited_by: 'Alex Kim',
    email: INVITE_FOR,
    role: 'member' as Role,
    expires_at: '2026-10-08T09:00:00Z',
  };
  if (token === 'invite-expired')
    return ok({ ...base, status: 'expired', problem: 'expired' });
  if (token === 'invite-used' || (token === 'invite-kim' && accepted.has(token))) {
    return ok({ ...base, status: 'accepted', problem: 'accepted' });
  }
  if (token !== 'invite-kim') return NOT_FOUND;
  const mine = familyOf(email);
  let problem: string | null = null;
  if (email !== INVITE_FOR) {
    problem = mine?.family.id === 'fam-kim' ? 'already_member' : 'wrong_account';
  } else if (mine) {
    problem = mine.family.id === 'fam-kim' ? 'already_member' : 'in_another_family';
  }
  return ok({ ...base, status: 'pending', problem });
}

export function accept(
  email: string,
  body: unknown,
  displayName: string,
): FamilyResponse {
  const { token = '' } = (body ?? {}) as { token?: string };
  if (token === 'invite-expired') {
    return fail(
      410,
      'invitation_expired',
      'This invitation has expired. Ask for a new one.',
    );
  }
  if (token === 'invite-used' || accepted.has(token)) {
    return fail(409, 'invitation_accepted', 'This invitation has already been used.');
  }
  if (token !== 'invite-kim') return NOT_FOUND;
  if (email !== INVITE_FOR) {
    return fail(
      403,
      'wrong_account',
      `This invitation is for ${INVITE_FOR}. Sign in with that account to accept it.`,
    );
  }
  if (familyOf(email)) {
    return fail(409, 'already_in_family', "You're already in a family. Leave it first.");
  }
  const kim = families.find((f) => f.id === 'fam-kim')!;
  const me = person(`mem-${email}`, displayName, email, 'member', [], '0.00');
  kim.people.push(me);
  accepted.add(token);
  return ok(view(kim, me));
}
