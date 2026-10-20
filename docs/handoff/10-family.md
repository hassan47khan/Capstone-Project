# 10 — Family Plan (Epic F) — STRETCH

**Prerequisites:** `01`, `02`, `03`, `04`, `09`.
**Deliverable:** 6 screens + multi-tenant permissions.
**Figma frames:** 4 designed, 2 missing.

---

## ⚠️ Read this before starting

**Do not start this file until Phases 0–6 are complete**, including the AI epic
in `11 §2`.

Family is the largest backend surface in the project: a second ownership model,
role-based permissions on every subscription query, an invitation lifecycle, and
per-member currency overrides. It touches every endpoint written in `04`.

It is also **not graded**. The capstone requires an AI/LLM feature, real named
users, meaningful data correctness, and multiple interacting workflows — all of
which Phases 0–6 already satisfy.

**Recommendation: cut this and spend the time on `11 §2`.** If the schedule is
healthy and you want it, this spec is complete and ready.

---

## 1. Models

### Family
`name` · `plan` (free | premium) · `seat_limit` · `owner` · `display_currency` ·
`shared_timezone` · `fiscal_year_start` · `created_at`

### Membership
`family` · `user` · `role` (admin | member | viewer) · `spending_limit` ·
`display_currency_override` · `joined_at`

### Permissions — per membership
`can_add_subscriptions` · `can_edit_own_subs` · `can_view_family_total`

### Invitation
`family` · `email` · `role` · `token` · `status` (pending | accepted | expired |
revoked) · `expires_at` · `invited_by`

### Roles

| Role | Can do |
|---|---|
| admin | Everything: manage members, permissions, plan, family settings |
| member | Add and edit their own subscriptions, per their permission flags |
| viewer | Read-only; may be blocked from the family total |

---

## 2. Privacy — unresolved in the prototype

**A family admin can currently see every member's complete subscription list.**
The Member Detail frame shows Jordan's Hulu, Disney+, Notion, and GitHub Pro to
the admin, with no indication Jordan knows or consented.

That is a real privacy problem, not a polish item. Subscriptions reveal a lot:
therapy apps, dating services, medical services, job-hunting tools.

**Pick one and document the choice:**

| Option | Mechanism | Trade-off |
|---|---|---|
| **A — Per-subscription private flag** *(recommended)* | A "private" toggle on each subscription. Private subs count toward the family total but are shown to the admin as "Private subscription" with no name. | Preserves the useful aggregate; hides the sensitive detail. |
| B — Disclosure at invite time | Invitation states plainly that the admin sees all subscriptions. | Simpler to build; relies on the invitee reading it. |
| C — Aggregates only | Admin sees per-member totals, never individual rows. | Most private; removes most of the admin screens' value. |

Whichever you choose, write the decision and its reasoning into `CLAUDE.md`.
This is the kind of design judgment a capstone review will ask about.

---

## 3. Screens

### 3.1 Family dashboard
Family total card · member breakdown rows (avatar, name, role badge, subscription
count, total) · tapping a member → Member Detail.

The family total is the sum of members' normalized monthly totals, **computed
server-side**. With seed data: **$198.16** (`04 §4.5`).

> The prototype showed Jordan at `$72.15` while his four subscriptions summed to
> `$45.98`, and a family total of `$247.35` matching neither. **Assert the correct
> figures in a test** — this is exactly the class of bug `04` exists to prevent.

### 3.2 Family settings (admin)
Plan · members (`3 of 5 seats filled`) · default currency · shared timezone ·
family notification toggles.

### 3.3 Family members list
Member rows + "Invite member" primary button.

**Measured (`3:2463`):** header title "Family Members (3 of 5)" (seat count in the
title; 5 seats). Content gutter 24, rows 10 apart. Row: `surface`, 1px `border`,
radius 6, height 72, padding 16, gap 12: 40px avatar (tint + 15 Bold initials), then
name (15 SemiBold) with a role badge beside it, then "$X/mo · N subscriptions" (13
`textMuted`), then a 16px chevron. Role badges: **Admin** = `accent` @ 10% / `accent`
text; **Member** and **Viewer** = `surface2` + 1px `border` / `textMuted`. The frame
sets them in 9px uppercase — **use `Badge`, 12px** (`02 §19`). Invite button:
`primary`, full width, 16 padding.

The frame paints Jordan's avatar initials in `color.danger` (`#b44735`). Danger is
reserved for errors and destructive actions — derive avatar tints from the name
hash within the muted palette, like `ServiceMark` (`01 §3`).

### 3.4 Member detail

**Measured (`3:2537`):** profile card (56px avatar, name DM Serif 18, email) with
the role control inside it — a three-segment control (Admin / Member / Viewer) on a
`bg` track, 4 padding, radius 6; the selected segment is `accent` @ 10% with a 1px
`accent` border and `accent` 13px SemiBold text. Then a "{Name}'s permissions"
group: *Can add subscriptions* (toggle), *Can edit own subs* (toggle), *Can view
family total* (toggle), *Spending limit* (`$100 / mo`, `accent` Bold) — rows padding
14. Then "{Name}'s subscriptions": dense rows — 28px **square** `ServiceMark`
(`shape="square"`), name 14 SemiBold, "Next: Oct 03" at 11px (→ 12px), price 14
Bold `text`. Last: the destructive trigger, `destructiveOutline` (`02 §1`), "Remove
{Name} from family". The frame's tinted fill on that button fails AA (4.29:1).

Jordan's four subscriptions in this frame sum to $45.98, matching `04 §4.5`; the
Family *list* frame (`3:2463`) says $72.15 for the same person — the list is wrong.
Avatar, name, email · role `SegmentedControl` (Admin / Member / Viewer) ·
permission toggles · spending limit · their subscriptions (subject to §2) ·
"Remove from family" destructive button.

### 3.5 Invite member — **not designed**
The prototype has the button and no destination. Build:

| Step | Screen |
|---|---|
| 1 | Email field + role select + send |
| 2 | Pending state with resend and revoke |
| 3 | Invitee's accept screen (deep link) |
| 4 | Expired / already-accepted / wrong-account error states |

Invitations expire after 7 days. Inviting someone already in the family shows a
clear error. Inviting past the seat limit prompts a plan upgrade.

### 3.6 Remove from family — **confirm state not designed**
Destructive `BottomSheet`. State plainly what happens to the removed member's
subscriptions: they leave the family total and return to that member's personal
account. They are **not** deleted.

### 3.7 Currency & billing (admin)
Family display currency · per-member overrides · aggregate by Monthly/Annual ·
fiscal year start · exchange-rate info.

**Two label fixes:**
- "Fiscal month start: January" → **"Fiscal year start"**. A month doesn't start
  in January; a fiscal year does.
- Reconcile "live exchange rates" with "auto-refresh: daily" — one claim, stated
  the same way here and in `09 §2`.

---

## 4. Backend impact

Every subscription endpoint from `04 §5` gains family scoping:

- List queries filter by visibility: own subscriptions always; others' per role
  and the §2 privacy decision.
- Write operations check `can_add_subscriptions` / `can_edit_own_subs`.
- The family total endpoint checks `can_view_family_total` per requester.
- Removing a member re-scopes their subscriptions without deleting them.
- Deleting a family must not orphan subscriptions.

**Add an authorization test per role per endpoint.** A viewer must not be able to
POST a subscription by calling the API directly — permission flags that only
exist in the UI are not permissions.

---

## 5. Edge cases

| Case | Handling |
|---|---|
| Admin removes themselves | Blocked unless another admin exists |
| Last admin leaves | Blocked; must promote someone first |
| Member already in another family | Blocked with a clear message |
| Invite to an existing SubTrak account | Accept flow links the existing account |
| Invite to an unregistered email | Accept flow routes through registration first |
| Seat limit reached | Invite blocked, upgrade prompt shown |
| Member exceeds spending limit | Admin notified per family notification settings |
| Member's currency override ≠ family currency | Their view uses theirs; the family total uses the family's |
| Member removed with queued offline writes | Writes reconcile to their personal account |

---

## 6. Motion & states

Family screens introduce no new motion. Reuse the patterns already defined:
member rows follow `ListRow` press (`02 §15`), confirm sheets follow
`BottomSheet` (`02 §15`), role changes follow `SegmentedControl`, and the family
dashboard follows Home's section loading (`06 §7`).

States follow the same shape as `06 §5`: per-section skeletons, inline retry on
partial failure, cached data plus a stale banner when offline. Two additions:

| State | Behavior |
|---|---|
| Invitation pending | Member row shows "Invited" with resend and revoke actions |
| Seat limit reached | Invite button disabled with an upgrade prompt, not hidden |

---

## 7. Accessibility

- Role segmented control announces position and consequence: *"Member, 2 of 3.
  Can add and edit their own subscriptions."*
- Permission toggles announce what they grant, not just on/off.
- Member rows announce role and total: *"Jordan Doe, member, 4 subscriptions,
  $45.98 per month."*
- Private subscriptions (option A) announce as *"Private subscription, details
  hidden"* — never silently omitted, which would misrepresent the count.
- Remove-member confirm announces the consequence before the action.

---

## 8. Definition of done

- [ ] Privacy option chosen, implemented, and documented in `CLAUDE.md`.
- [ ] Family total computed server-side; seed data asserts **$198.16**.
- [ ] Jordan's total asserts **$45.98**, Sam's **$22.98**.
- [ ] Full invitation lifecycle built, including all four error states.
- [ ] Remove-member confirm explains what happens to the subscriptions.
- [ ] "Fiscal year start" label corrected.
- [ ] FX wording consistent with `09 §2`.
- [ ] Authorization test per role per endpoint — no UI-only permissions.
- [ ] Last-admin and self-removal guards verified.
