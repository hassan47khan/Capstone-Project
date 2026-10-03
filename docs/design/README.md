# Design notes

How the visual prototype maps onto the app, where it deliberately differs from
the specification, and what it does not cover.

## Sources of truth

Two documents govern the client. **Neither is in the repository yet** — Hassan is
adding them at these paths:

| Document | Path | What it governs |
| --- | --- | --- |
| **SubTrak prototype** (PDF, 12 pages) | `docs/design/SubTrak prototype.pdf` | Layout, hierarchy, copy tone, spacing, colour, type |
| **SubTrak — System Design Specification** | `docs/SubTrak — System Design Specification.md` | Architecture, data model, API contract, business rules |

Where they disagree: the specification wins on **behaviour**, the prototype wins
on **appearance**. The three cases where that mattered are listed below.

## Page map

| Page | Screen | Epic | Phase | Status |
| --- | --- | --- | --- | --- |
| 1 | Visual language (tokens, type, components) | — | 0 | **Built** — `src/theme/tokens.ts`, `src/components/` |
| 2 | Welcome | A | 1 | Placeholder |
| 3 | Create your account | A (US-1) | 1 | Placeholder |
| 4 | Welcome back (Log in) | A (US-2) | 1 | Placeholder |
| 5 | Overview (Home) | C (US-6, US-8) | 2 | Placeholder |
| 6 | Subscriptions list | C (US-6, US-7) | 2 | Placeholder |
| 7 | Subscription detail | C (US-7) + H (US-19) | 2 | Placeholder |
| 8 | New subscription | C (US-7) | 2 | Placeholder |
| 9 | Insights | C (US-8) + G (US-17) | 2 | Placeholder |
| 10 | Family (shared plan) | F (US-14, US-15) | — | **Out of scope.** Behind `FEATURE_SHARING` |
| 11 | Settings | B (US-4, US-5) | 3 | Placeholder |
| 12 | Currency picker | B (US-4) | 3 | Placeholder |

Three screens the app needs are **not in the prototype** and are designed in the
same system: **Confirm email**, **Forgot password**, **Reset password** — all
required by US-1 and US-3.

## Where the design and the specification disagree

Three deliberate overrides. Each follows section 7 of the build prompt.

### 1. Settings has three rows that do not exist

The prototype's Settings screen shows **Date format**, **Weekly summary** and
**Export data**. None appears in the specification.

**All three are omitted.** Date format has no API field and the app formats dates
from the user's time zone instead. Weekly summary is not among the reminder kinds
in specification section 8. Data export is an *open decision* in section 15 —
shipping a button for an undecided feature would be worse than not having it.

### 2. The demo categories are replaced

The prototype uses Entertainment, Productivity, AI Tools and Cloud. Those are
illustrative. The specification's enum is fixed:

> streaming, software, fitness, cloud storage, insurance, utilities, other

A missing category renders as **"Uncategorized"**. Each gets a colour triplet in
`src/theme/tokens.ts` — a bar colour at 3:1 on white, a tile tint, and an ink
that meets 4.5:1 on that tint. All verified by `src/theme/tokens.test.ts`.

### 3. The price-increase banner is Epic H

The prototype shows "Netflix is going up to $17.99 on Oct 3" on Home and on the
detail screen. Price-change detection is **US-19, Epic H** and is not built.

`NoticeBanner` exists and renders **only when the API supplies a notice**
(`Dashboard.notice`, currently always null). Hard-coding the banner would put a
permanent fictional warning in front of every user.

## What the design omitted

The graded critique required by section 10 of the prompt, checked against the
state inventory in specification section 10.

The prototype draws **twelve happy paths and nothing else**. That is normal for a
visual prototype and is exactly the gap a wireframe critique is meant to find:
loading, empty, error, offline, lockout, expired-link and permission-denied
states are where a real app spends a surprising share of its time, and none of
them is drawn.

### Missing across every screen

| State | Drawn? | How it is handled |
| --- | --- | --- |
| **Loading** | No | `Skeleton` / `SkeletonRow`, shaped like the eventual content so the layout does not jump. One "Loading" announcement per group, not per block. |
| **Empty** | No | `EmptyState` — title, one sentence, and a call to action only where one makes sense. |
| **Error with retry** | No | `ErrorState`, variant `error`. |
| **Offline** | No | `ErrorState`, variant `offline`. Deliberately distinct: a Retry button that fails instantly is worse than useless, so the copy differs. |
| **Not found / not yours** | No | `ErrorState`, variant `notFound`. Copy never mentions permission — that would confirm the record exists. |

### Missing per screen

| Screen | What is not drawn | Resolution |
| --- | --- | --- |
| Create account | Inline password-rule failures; duplicate email (409) | `TextField` error state; the API returns the unmet rule, shown under the field |
| Log in | Generic 401; **lockout (423)**; unverified account | Three distinct messages. Lockout is its own path — it is not a wrong password |
| Confirm email | Screen absent entirely | Designed in-system: address, Resend with a cooldown, expired-link path |
| Forgot / Reset password | Screens absent entirely | Designed in-system. Reset always shows the generic confirmation, so the endpoint reveals nothing about who has an account |
| Home | Empty state; trial badge; **"if trials convert" line**; missing exchange rate | Specification section 9 keeps trials out of totals, on their own line. `Dashboard.trial_conversion_total` |
| Subscriptions | Empty state; a search matching nothing; long names | `EmptyState`; rows wrap to two lines rather than truncating a name |
| Detail | Delete confirmation; no billing history yet | Confirmation before a destructive action; the history list is Epic G |
| New subscription | Field errors; disabled Save while submitting; **custom cycle** | `Button` blocks presses while `loading`. The prototype shows only Weekly/Monthly/Quarterly/Yearly, but specification section 4 requires `{unit, count}` — so a Custom option is added |
| Insights | No data yet; the note that trials are excluded | `EmptyState`; footnote |
| Settings | **Currency with no exchange rate**; **time zone not set** | US-4: a currency with no rate is not offered. US-5: an unset zone is treated as UTC and said so |
| Currency | Search matching nothing; the rate's as-of date | Footnote carries `rate_as_of` so the user knows how fresh a conversion is |

### Two things the prototype shows that the data model does not support

- **"Payment method — Visa ····4242"** on the detail screen (page 7). SubTrak's
  privacy promise is that it never asks for card details, and there is no such
  field in specification section 4. **Not built.** This is worth raising with the
  Product Owner, because it appears in a design someone may have signed off.
- **A monthly spending limit** ("$30.61 left of your $250.00 limit", page 10).
  No budget feature exists in any epic. Part of the out-of-scope Family screen.

### Accessibility gaps in the prototype

- Several figures are communicated by **colour position alone** — the stacked bar
  and its legend. Every chart in the app now carries the same numbers as text.
- The prototype shows no **focus or pressed states**. Added via `opacity.pressed`.
- Contrast was not stated. Every pair is now computed from the tokens and
  asserted in `src/theme/tokens.test.ts` — 21 pairs, all passing, tightest being
  the `fitness` bar at 3.53:1 (needs 3.0) and `ink3` on paper at 4.84:1 (needs 4.5).
