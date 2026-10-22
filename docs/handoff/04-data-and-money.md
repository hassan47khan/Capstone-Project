# 04 — Data Model, Money Engine & Canonical Dataset

**Prerequisites:** none (backend track; can run parallel to 01–03).
**Deliverable:** Django models, the money engine, the API, and the seed fixture.

> **This is the most important file in the handoff.** Nearly every inconsistency
> in the prototype — five different monthly totals, a member total that didn't
> match that member's subscriptions, a "Total Spent" reproducible from no start
> date — traces back to totals being typed by hand instead of computed.
>
> **The invariant:** no total is ever stored or hand-written. Every total is
> derived from the subscription set at read time.

---

## 1. Entities

### User
`email` (unique, login identifier) · `display_name` · `email_verified` ·
`created_at`

### UserSettings — one per user
`display_currency` · `timezone` · `date_format` · `theme` (light|dark|system) ·
`locale` · `has_completed_first_run`

### Category
`slug` · `display_name` · `color_token_key` · `is_system`

Seed exactly seven system categories. **One taxonomy, used everywhere** — the
prototype had Health & Wellness and Fitness & Wellness as separate things, plus
Food & Delivery and Gaming that existed only on abandoned frames.

```
entertainment · productivity · ai-tools · cloud-storage
news-media · health-wellness · other
```

### Subscription
`owner` · `name` · `billing_price` (Decimal) · `billing_currency` ·
`billing_cycle` · `custom_cycle_count` · `custom_cycle_unit` · `start_date` ·
`next_bill_date` · `category` · `notes` · `payment_label` · `status` · `is_trial` ·
`created_at` · `updated_at`

- `billing_cycle` ∈ `weekly | monthly | quarterly | yearly | custom`
- `custom_cycle_unit` ∈ `days | weeks | months | years`
- `status` ∈ `active | cancelled | deleted`
- `payment_label`: optional, ≤ 30 chars, **display only** (e.g. "Visa ••4242").
  The server rejects any value containing a run of 13–19 digits (spaces and
  dashes ignored) — we never store card numbers. Added because the Detail frame
  has a "Payment Method" row the original model did not cover.

### PriceHistoryEvent
`subscription` · `event_type` · `occurred_at` · `old_value` · `new_value`

`event_type` ∈ `created | price_change | category_change | cycle_change |
cancelled`

### NotificationRule — one per user
`days_before_reminder` · `reminder_time` · `send_push` · `send_email` ·
`alert_on_any_price_change` · `price_alert_threshold` · `weekly_summary_enabled`
· `monthly_report_enabled` · `report_delivery_day` · `trial_alert_days_before`

---

## 2. Hard requirements on the model

**Money is never a float.** Use `Decimal` with explicit precision. If
`django-mongodb-backend` cannot round-trip `Decimal` safely, store scaled
integers (minor units) and convert at the boundary. Document whichever you pick
in `CLAUDE.md` — this decision affects every downstream calculation.

**All five billing cycles coexist.** The prototype showed three different sets:
Weekly/Monthly/Quarterly/Yearly on one frame, Weekly/Monthly/Yearly/Custom on
the Add frame, and only Weekly/Monthly/Yearly on the Edit frame — silently
dropping Quarterly, and Custom in places. The model supports all five
simultaneously.

**Cancel is the default, delete is explicit.** Cancelling retains all history,
drops the subscription out of totals, and feeds a "saved per year" figure.
Delete is a **soft delete**: `status = deleted`. This matches the prototype's
own Delete sheet ("Historical billing records will be retained"); an earlier
draft of this file said delete destroys history, which contradicted it. A deleted
subscription is excluded from **every** list, total, chart, calendar day and
price alert, but its `PriceHistoryEvent`s stay. The default queryset must filter
`deleted` out so no screen can forget to. A purge job (or account deletion)
removes them for good. Required test: deleting a subscription lowers the monthly
total by exactly its normalized amount, and Undo restores it.

**Verify the dependency before you start.** `django-mongodb-backend` must match
the installed Django on major.minor (e.g. 6.1.x ↔ Django 6.1). If they don't
match, stop and report rather than working around it.

---

## 3. The money engine

Its own module, with exhaustive tests. Four responsibilities:

### 3.1 `normalize_to_monthly(price, cycle) -> Decimal`

| Cycle | Factor |
|---|---|
| weekly | × 52 / 12 |
| monthly | × 1 |
| quarterly | ÷ 3 |
| yearly | ÷ 12 |
| custom(n, days) | × 365 / (12 × n) |
| custom(n, weeks) | × 52 / (12 × n) |
| custom(n, months) | ÷ n |
| custom(n, years) | ÷ (12 × n) |

### 3.2 Aggregation
A subscription set → monthly total, per-category rollup, per-category percentage
share. Only `status = active` counts toward totals.

### 3.3 Currency conversion
Convert **for display only**. Billing amounts are immutable in their billing
currency. Stored FX rate table with a timestamp; a fixed deterministic rate in
test and seed mode.

### 3.4 Rounding
**Round only at presentation. Never round intermediate sums.**

This is not pedantry — it is load-bearing. Headspace at $12.99 every two months
normalizes to $6.495/month. Round that to $6.50 first and three of them show
$19.50 where the rule gives $19.49; round a category subtotal first and the
rollup stops summing to the total.

> ⚠️ **Corrected 2026-10-22.** An earlier draft of this paragraph said rounding
> Headspace early turns Alex's total into $129.21. It does not — $129.195 and
> $129.20 both display as $129.20, so Alex's set does not demonstrate the rule.
> The rule itself stands; use the three-Headspaces case above.

---

## 4. Canonical dataset

Every demo, screenshot, test, and fixture uses this and only this. The figures
below were computed, not transcribed.

### 4.1 Seed anchor

Pin `SEED_TODAY = 2026-10-01` in the fixture. Derive every relative date from it.
**Do not hardcode future dates** — a fixture with absolute dates silently rots
and the demo breaks on an arbitrary day.

Every subscription's `start_date` must share its day-of-month with its
`next_bill_date`. The prototype violated this (Netflix: start Mar 15, next bill
Oct 12, and a detail screen saying Oct 3), which is why its "Total Spent" was
reproducible from no start date at all.

### 4.2 Alex Kim — 8 subscriptions

| Service | Price | Cycle | Category | Next bill | Normalized /mo |
|---|---|---|---|---|---|
| Netflix | 15.49 | monthly | entertainment | 2026-10-12 | 15.49 |
| Spotify | 10.99 | monthly | entertainment | 2026-10-04 | 10.99 |
| Adobe CC | 54.99 | monthly | productivity | 2026-10-18 | 54.99 |
| iCloud+ | 2.99 | monthly | cloud-storage | 2026-10-01 | 2.99 |
| New York Times | 4.25 | monthly | news-media | 2026-10-08 | 4.25 |
| ChatGPT Plus | 20.00 | monthly | ai-tools | 2026-10-20 | 20.00 |
| YouTube Premium | 13.99 | monthly | entertainment | 2026-10-15 | 13.99 |
| Headspace | 12.99 | every 2 months | health-wellness | 2026-10-15 | 6.495 |

**Raw total: 129.195 → displayed $129.20** ✅ (matches the prototype's Home screen)

> ⚠️ **Headspace corrected 2026-10-22.** This table said `2026-12-15`. No
> every-2-months schedule on the 15th can have that as its *next* bill at
> `SEED_TODAY`: the bill before it, 2026-10-15, is itself after the anchor, so
> Oct 15 is the next bill and Dec 15 is the one after. The normalized 6.495 and
> the $129.20 total are unaffected.

### 4.3 Category rollup — derived, asserted

| Category | /mo | Share |
|---|---|---|
| Productivity | 54.99 | 42.56% |
| Entertainment | 40.47 | 31.32% |
| AI Tools | 20.00 | 15.48% |
| Health & Wellness | 6.50 | 5.03% |
| News & Media | 4.25 | 3.29% |
| Cloud Storage | 2.99 | 2.31% |

Sum of rounded category values = **129.20** ✅ — matches the displayed total.

**The Share column is the exact share, shown to two places for reading.** It is
what `category_rollup` returns, unrounded. These six add to 99.99, not 100,
which is an artefact of rounding each one on its own and **must not reach a
screen**.

What a screen displays is different: percentages are **integers that sum to
exactly 100**, by the largest-remainder method (`06 §2.3`, `08 §3`, system
design "Category breakdown (US-8)"). For Alex that is:

| Category | Exact | Displayed |
|---|---|---|
| Productivity | 42.56% | **43%** |
| Entertainment | 31.32% | **31%** |
| AI Tools | 15.48% | **16%** |
| Health & Wellness | 5.03% | **5%** |
| News & Media | 3.29% | **3%** |
| Cloud Storage | 2.31% | **2%** |

Sum = **100** ✅. The money engine supplies these integers, so Home's legend and
the Analytics breakdown cannot disagree and neither screen reimplements the
rounding — the prototype's legend summing to 88 (`06 §2.4`, defect 4) is exactly
what that duplication produces. Assert both: the exact shares, and that the
displayed integers sum to 100.

### 4.4 Netflix history — drives the chart, Edit History, and price alerts

| Date | Event | Value |
|---|---|---|
| 2024-03-12 | created | 13.99/mo, category `other` |
| 2025-06-12 | category_change | other → entertainment |
| 2026-10-01 | price_change | 13.99 → 15.49 |

**Total spent at `SEED_TODAY`: 31 bills × $13.99 = $433.69**

Derivation: monthly bills on the 12th from 2024-03-12 through 2026-09-12 =
10 (2024) + 12 (2025) + 9 (2026) = 31. The price changed 2026-10-01, so the first
bill at $15.49 is 2026-10-12 — after the seed anchor, therefore not yet spent.

> ⚠️ **Two superseded figures.** The prototype's `$278.82` is reproducible from no
> start date. An earlier review note gave `$451.69`, which wrongly assumed twelve
> bills at the new price when the price had only just changed. **$433.69 is
> correct.** Assert it in a test.

### 4.5 Family fixture

| Member | Role | Subscriptions | Total /mo |
|---|---|---|---|
| Alex Kim | admin | the 8 above | 129.20 |
| Jordan Doe | member | Hulu 17.99, Disney+ 13.99, Notion 10.00, GitHub Pro 4.00 | 45.98 |
| Sam | viewer | Apple Music 10.99, Dropbox Plus 11.99 | 22.98 |

**Family total: $198.16** (derived)

> ⚠️ The prototype showed Jordan at `$72.15` while his four subscriptions sum to
> `$45.98`, and a family total of `$247.35` that matched neither. Both are
> superseded. Assert the correct figures in tests.

### 4.6 FX

Fixed demo rate: **USD → EUR 0.9177**.

At that rate Alex's total displays as **€118.56**, and the sum of the individually
converted line items is also €118.56 — they agree to the cent.

> ⚠️ The prototype's `€126.29` came from a different nine-subscription set (it
> included Figma and dropped Headspace) at an implied rate of ~0.9171. Superseded.

A converted total must never drift from the sum of converted line items by more
than one minor unit. Assert this.

### 4.7 Service catalog

Seed a catalog for the Add Subscription picker (`07 §2`), each entry carrying
name, default price, category, brand hex, and tint hex:

```
Netflix · Spotify · Adobe CC · iCloud+ · ChatGPT Plus · YouTube Premium
Hulu · Disney+ · Notion · GitHub Pro · Headspace · Dropbox
Apple Music · New York Times · Figma
```

Each entry also carries a `mark` (the 1–2 letters drawn in the tile). Values
measured from Figma (the rest: derive per `01 §3`):

| Service | Brand | Tint | Mark |
|---|---|---|---|
| Netflix | `#e50914` | `#ffecee` | N |
| Spotify | `#1db954` | `#e3f9ed` | S |
| iCloud+ | `#007aff` | `#e6f0fa` | iC |
| ChatGPT Plus | `#10a37f` | `#e1f7f4` | GP |
| Adobe CC | `#b38b35` | `#fff7cc` | A |
| Headspace | `#a259ff` | `#f4ecff` | H |

---

## 5. API

### Auth
```
POST /auth/register                 email + password → unverified user, sends mail
POST /auth/verify-email             token
POST /auth/resend-verification      rate limited; returns cooldown seconds
POST /auth/login                    → access + refresh
POST /auth/refresh
POST /auth/logout
POST /auth/password-reset/request   always 200 — no account enumeration
POST /auth/password-reset/confirm   token + new password
GET  /auth/me
```

- Password policy: **minimum length only**, enforced identically client and
  server. Do not implement the prototype's five-rule checklist.
- Short-lived access token; rotating refresh stored in `expo-secure-store`,
  never `AsyncStorage`.
- Rate limit login, register, and both resend endpoints.
- Verification and reset tokens: single-use, time-limited, constant-time compared.
- `resend-verification` returns the cooldown so the client can disable the button
  with a visible countdown (`05 §4`).

### Subscriptions
```
GET    /subscriptions              filter by category/status; default sort next_bill_date ASC
POST   /subscriptions
GET    /subscriptions/{id}         + normalized_monthly, total_spent_to_date, history
PATCH  /subscriptions/{id}         price/category/cycle change auto-writes a history event
POST   /subscriptions/{id}/cancel
DELETE /subscriptions/{id}         soft delete: status=deleted, history kept (§2)
POST   /subscriptions/{id}/restore restores the previous status — powers the Undo toast
GET    /subscriptions/{id}/history
```

`next_bill_date` is recomputed from `start_date` + cycle, never stored blindly.
Validate it is in the future on create.

Validation: price > 0 with message `Enter a valid price greater than $0.`; name
required and trimmed; category must exist.

### Analytics
```
GET /analytics/summary?period=current_month
GET /analytics/spend-over-time?months=12
GET /analytics/upcoming?days=30
GET /analytics/price-changes?months=12            Detail screen / history
GET /analytics/price-changes?since=-30d&include_upcoming=true     Home "Urgent attention"
```

Backed by MongoDB aggregation pipelines, not Python loops over querysets. Add
index definitions for every field these pipelines sort or filter on. All amounts
respect the user's display currency; all totals come from the money engine.

### Contract
Generate an OpenAPI 3.1 schema (`drf-spectacular`) and a committed TypeScript
client. Add an npm script to regenerate it and a CI check that fails on drift.
Wrap it with auth-token injection and a 401 → refresh → retry-once policy.
**After this task, no screen calls `fetch()` directly.**

---

## 6. Required tests

```
✓ Alex's 8 subscriptions          → 129.20
✓ Category rollup                 → 54.99 / 40.47 / 20.00 / 6.50 / 4.25 / 2.99
✓ Rounded categories sum          → 129.20
✓ Displayed category percentages  → integers summing to exactly 100 (43/31/16/5/3/2)
✓ Jordan → 45.98 · Sam → 22.98 · Family → 198.16
✓ Netflix total_spent at SEED_TODAY → 433.69
✓ EUR total @ 0.9177              → 118.56, agreeing with summed line items
✓ Headspace normalizes to          → 6.495 unrounded, 6.50 displayed
✓ Cancelled subscriptions drop out of totals, keep their history
✓ PATCH of price / category / cycle each writes exactly one history event
✓ Leap year handling
✓ Monthly subscription starting on the 31st
✓ Cycle change mid-life recomputes next_bill_date correctly
✓ Converted total never drifts >1 minor unit from summed converted line items
✓ Expired token · reused token · unverified login · rate-limit trip
✓ Password reset is enumeration-resistant
```

---

## 6a. Additions required by the AI-epic frames (`11 §2`)

**Subscription** gains: `trial_ends_on` · `trial_length_days` ·
`trial_reminder_enabled` · `trial_decision` (`none | keep | remind`).

- `is_trial` plus `trial_ends_on >= today` ⇒ **excluded from every monthly and
  annual total** (nothing has been charged yet). `billing_price` holds the
  post-trial price. On `trial_ends_on` a scheduled job flips `is_trial` off and the
  subscription starts counting. Cancelled trials never count.
- Trial progress is `elapsed_days / trial_length_days`, computed server-side.
- Seed three trials **relative to `SEED_TODAY`**: Hulu ($17.99, ends +2 days, 31-day
  trial), Notion AI ($10.00, +9, 30-day), Duolingo Max ($13.99, +21, 30-day).
  The Figma frames use calendar dates (Oct 19) that do not match `SEED_TODAY`
  (2026-10-01); derive, don't hardcode. They do **not** change Alex's $129.20.

**PendingExtraction** — `owner` · `source_hash` · `snippet` (≤ 300 chars) ·
`fields` (JSON) · `confidence` (JSON) · `status` · `expires_at` (TTL index).

**SharedPlan** — `owner` · `subscription` · `split_mode` (`equal`) · `created_at`.
**SharedPlanParticipant** — `plan` · `display_name` · `email` (optional) · `position` ·
`is_owner`. **SharedPlanPayment** — `participant` · `period` · `status`
(`paid | pending`) · `paid_at` · `last_reminded_at`.

- `split_shares(price, n) -> list[Decimal]` lives in the money engine and uses the
  largest-remainder method so shares sum to the price exactly ($15.49 / 3 →
  5.17, 5.16, 5.16). Round at presentation only.
- Shared plans never alter a user's totals (`11 §2.6`).

**Endpoints (add to §5 and the OpenAPI schema):**
`POST /extractions/scan` · `GET /extractions/pending` ·
`POST /extractions/{id}/confirm` · `DELETE /extractions/{id}` ·
`GET /trials` · `POST /trials/{id}/decision` ·
`GET|POST /shared-plans` · `POST /shared-plans/{id}/payments/{pid}/remind` ·
`POST /integrations/gmail/connect` · `DELETE /integrations/gmail`.

**Ownership:** the Subscription trial fields, the engine exclusion, `split_shares` and
the seed trials belong to the 04 owner. `PendingExtraction`, the shared-plan models,
the extraction/trial/shared-plan/Gmail endpoints and their tests belong to the 11
owner, following the conventions in this file. The 04 owner freezes the OpenAPI
shapes for these first so the mobile work can start against mocks.

**Required tests:** trials excluded from totals until they convert; trial-conversion
job; `split_shares` sums exactly for random prices and 2–6 participants; a shared
plan does not change `/analytics/summary`.

---

## 7. Definition of done

- [ ] `django-mongodb-backend` / Django versions verified matching.
- [ ] Decimal storage strategy chosen and documented in `CLAUDE.md`.
- [ ] All seven categories seeded; no duplicate taxonomy anywhere.
- [ ] Money engine passes every assertion in §6.
- [ ] Seed fixture loads via a management command and resets cleanly.
- [ ] Fixture dates derive from `SEED_TODAY`; no hardcoded future dates.
- [ ] OpenAPI schema generated; TS client committed; CI drift check passing.
- [ ] No endpoint returns a total the client has to compute.
- [ ] §6a models, endpoints and tests in place (trials excluded from totals; `split_shares` exact).
