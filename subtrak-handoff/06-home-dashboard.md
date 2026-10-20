# 06 — Home Dashboard (Epic B)

**Prerequisites:** `01`, `02`, `03`, `04`.
**Deliverable:** one Home screen.
**Figma frames:** 5 variants exist. Build the rich one (`4:2901`, 390w); archive the rest.
**Source-frame warning:** `4:2901` exists in the original Figma file (`kyUS7F8bg4x7GpcPEF4UDN`) but **was deleted from the newer file** (`IKYivyJtmBYzJNQ7g8qPGc`). The newer file's only Home-like frame is `113:641` ("2 - Dashboard") — an indigo-palette leftover ("Maya", $87.46, tabs Home / Trials / Split / Insights) that conflicts with this spec. **Build from `4:2901` in the original file.** Ask the designer to copy it into the newer file so there is one source of truth.
**Status:** §2 and §4 were rewritten from a node-level measurement of `4:2901`. An earlier draft of this file was written from a screenshot and was wrong in several places (spend-card fill, figure color, legend contents, alert content).

---

## 1. Which dashboard

The prototype contains five dashboard variants. Build **the rich one** — the
"Good morning, Alex" frame with Urgent Attention, a donut chart, and upcoming
renewals.

| Variant | Verdict |
|---|---|
| **Rich dashboard** ("Good morning, Alex") | ✅ **Canonical. Build this.** |
| Flat subscription list (`dashboard-user`, 402w) | ❌ Unsorted; no insight |
| Stat cards ("Your Dashboard", 393w) | ❌ Older iteration; archive |
| EUR converted (`dashboard-user-eur`) | ⚠️ Not a screen — a *state* of the canonical one |
| Family dashboard | → `10-family.md` |

Why the rich one: it is the only variant that surfaces the price-change alert,
which is the app's actual differentiator. A flat list of what the user already
knows they subscribe to is a table, not a product.

The currency-converted view is **the same screen** rendering a different
`display_currency`. Do not build a second screen for it.

---

## 2. Sections, in order

Page background `color.bg`. Content: **16 horizontal gutter, 20 vertical gap
between sections, 16 bottom padding.** The frame's status bar, home indicator and
the blurred "Aura" circle in the spend card (opacity 0) are not built.

### 2.1 Header (greeting) — measured

| Element | Spec |
|---|---|
| Left, two lines, gap 4 | "Good morning," DM Sans Medium 12/16 `textMuted`; display name DM Serif 24/32 `text` |
| Right | 40 × 40 avatar, radius 20, 1px `border`, `surface`, clips content; tap → Profile |

Greeting thresholds: before 12:00 "Good morning", before 18:00 "Good afternoon",
otherwise "Good evening" — in the user's timezone, not the device's.

**No brand mark and no Add button on Home.** (An earlier draft of this file put
a 28px mark + wordmark here; the frame has neither.) Avatar shows initials;
photo upload is not in scope.

### 2.2 Monthly recurring spend — measured

| Element | Spec |
|---|---|
| Container | `Card`: `surface` fill (**not** `successSurface`), 1px `border`, radius 6, padding 20, gap 16 |
| Header row | `space-between` |
| — label | "MONTHLY RECURRING SPEND": DM Sans Medium 12/16, tracking 0.5, `textMuted` |
| — badge | `Badge success`: "{n} active", Bold **12** (prototype 10) |
| Figure row | baseline-aligned, gap 4 |
| — amount | DM Serif **32**/40, **`color.text`** (not `success`) |
| — suffix | "/mo" DM Sans Medium 16/24 `textMuted` |
| Delta row | gap 6: 12px arrow icon, then "2.4% " (Medium 12, `success`) + "from last month" (12, **`textMuted`** — the prototype's `textSubtle` fails AA) |
| Currency chip | Only when display currency ≠ USD: `surface2`, 12px, after the suffix |

Delta rule (**Decision**): a *decrease* → ↘ in `color.success`; an *increase* →
↗ in `color.text`; no change → "No change from last month". The prototype drew
an increase in green, which reads as good news. **Never `color.danger`** — a
spending increase is information, not an error.

### 2.3 Spending by category — measured

| Element | Spec |
|---|---|
| Section header | DM Serif 18/24 `text` — "Spending by category" |
| Card | `surface`, 1px `border`, radius 6, padding 16, gap 16, items centered |
| Donut | 90px graphic centered in a 100 × 100 wrapper (stroke width inferred 14 — the frame is a flattened SVG) |
| Legend | flex 1, gap 6. One row per category, `space-between` |
| — left | 8 × 8 square (radius 4) in category color, gap 6, name DM Sans Medium 12/16 `textMuted` |
| — right | **percentage** DM Sans Medium 12/16 `text` |

The legend shows **names and percentages only**, no amounts (amounts are on
Analytics, `08 §2.2`). Percentages are integers that **sum to exactly 100**
(largest-remainder rounding) — the prototype's 35 / 22 / 19 / 12 summed to 88.
Never abbreviate a name ("Cloud" in the prototype) — truncate with ellipsis
instead. Largest first; more than 5 categories → tail grouped into "Other".
See `08 §3` for the shared chart contract.

### 2.4 Urgent attention — measured

| Element | Spec |
|---|---|
| Section header | DM Serif 18/24 — "Urgent attention" |
| Card | `AlertCard` `warning` (`02 §20`): `warningSurface`, 1px `warningBorder`, radius 6, padding 16, gap 12 |
| Icon | 40px circle `warningIconBg`, 20px alert-triangle `color.warning` — **an icon, not the service mark** |
| Title | DM Sans Bold 14/20 `text` — "{Service} price increase" |
| Body | DM Sans Medium 12/16, **`color.text`** — "$13.99 → $15.49/mo · +$18.00/yr" |

The frame's body reads "$15.49 → $17.99/mo on Nov 1". The annualized "+$18.00/yr"
is an addition (**Decision**) because it is the number a user actually weighs.
Date wording: future change → "on Nov 1"; change within the last 30 days →
"since Oct 1".

**Trial alerts share this section.** A trial inside the alert window renders the same
`AlertCard`: title "{Service} trial ends in {n} days", body "You'll be charged $17.99 on {date}", trailing "Review" link → TrialShield (`11 §2.5`). Price changes and trials sort together by date; max 3 cards.

One card per change, newest first, max 3. Tap → that subscription's detail.
**Show only changes effective within the last 30 days or in the future** — the
endpoint is called with `since=-30d&include_upcoming=true` (`04 §5`), not the
12-month window the Detail screen uses.

**Hide the entire section when empty** — no header, no empty state. An
always-present "Nothing urgent" block trains users to ignore the region.
Accent is `color.warning`, **never `color.danger`**.

### 2.5 Upcoming renewals — measured

| Element | Spec |
|---|---|
| Section header row | `space-between`: "Upcoming renewals" DM Serif 18/24; "View all" |
| "View all" | 12px Medium. Prototype: `textMuted` (no link affordance). **Decision:** `color.accent`, 44pt hit area → Calendar |
| List | gap 10 |
| Row | `ListRow compact` (`02 §9`): `surface`, 1px `border`, radius 6, padding 12 |
| — left | `ServiceMark` 36, gap 12; name DM Sans SemiBold 14/20 `text`; relative date DM Sans Medium 12/16 `textMuted`, gap 2 |
| — right | amount DM Sans Medium 14/18 `text` |

Relative date: 0 → "today", 1 → "tomorrow", otherwise "in {n} days" — days
computed server-side in the user's timezone. The amount is what will be
**charged** (billing price in display currency), not the monthly equivalent.
Max 4 rows, **sorted by date ascending**, then "View all".

> The prototype's flat list rendered Oct 12, Oct 04, Oct 18, Oct 01… in no order
> at all. Sort order is the entire value of this section.

### 2.6 Tab bar on Home
The Home frame's tab bar has four tabs and **no center add button**; every other
frame has the FAB. That is prototype drift. Home uses the shared tab bar with the
FAB (`03 §2`).

### Departures from the frame (all deliberate)

| # | Frame | Spec |
|---|---|---|
| 1 | Increase shown green | Increase `text`, decrease `success` |
| 2 | Badge 10px, "from last month" `textSubtle` | 12px, `textMuted` (AA) |
| 3 | Alert body `textMuted` on tint (4.22:1) | `color.text` |
| 4 | Legend percentages sum to 88 | Sum to 100 |
| 5 | "View all" muted | Accent, 44pt |
| 6 | Alert lists any change | Last 30 days / upcoming only |
| 7 | Sample figures ($212.42, 12 active, …) | Canonical dataset ($129.20, 8 active) |

---

## 3. Data

Every figure comes from the API. **The screen computes nothing.**

| Section | Endpoint |
|---|---|
| Monthly spend + delta | `/analytics/spend-over-time?months=2` |
| Category donut | `/analytics/summary?period=current_month` |
| Urgent Attention | `/analytics/price-changes?since=-30d&include_upcoming=true` |
| Upcoming Renewals | `/analytics/upcoming?days=30` |

Fetch in parallel; render each section as it resolves rather than blocking the
whole screen on the slowest call.

---

## 4. Chrome that is not built

Status bar (9:41, signal, battery), home indicator, and the decorative Aura circle
exist in every frame as device chrome. Use the real OS status bar and safe areas;
do not draw them.

---

## 5. States

| State | Behavior |
|---|---|
| Loading | Per-section `Skeleton`. Never a full-screen spinner. |
| Loaded | As specified |
| Empty (0 subscriptions) | Full-screen `EmptyState` per `05 §6`; no sections render |
| Partial failure | The failed section shows an inline retry; others still render |
| Total failure | Full-screen error with retry; preserves last-cached data if present |
| Offline | Last-cached data + a stale banner: "Showing data from {time}". **Never a blank screen.** |
| Refreshing | Pull-to-refresh spinner; existing content stays visible |

---

## 6. Edge cases

| Case | Handling |
|---|---|
| 1 subscription | All sections render; donut is a single full ring |
| 50+ subscriptions | Upcoming capped at 4 + "View all"; donut groups the tail into "Other" |
| All in one category | Donut renders as a full ring with one legend row |
| No price changes ever | Urgent Attention section absent entirely |
| No renewals in 30 days | Section shows "No renewals in the next 30 days" + link to Calendar |
| Very long service name | Truncate to one line; price never truncates |
| Display currency ≠ billing currency | Figures converted; currency chip appears; `caption` notes "Converted at today's rate" |
| Spend is $0 (all cancelled) | Figure shows $0.00; delta hidden; prompt to reactivate or add |
| Largest OS font size | Sections stack; figure may wrap; nothing clips or overlaps |

---

## 7. Motion

| Element | Trigger | Animation | Duration | Easing |
|---|---|---|---|---|
| Donut | First render | Arcs sweep from 0 | 600ms | ease-out |
| Section | Load complete | Skeleton cross-fades to content | 200ms | ease-out |
| Urgent row | Press | Fill → `surface2` | 100ms | ease-out |
| Pull-to-refresh | Release | Standard platform indicator | — | — |

Donut sweep is **skipped entirely** under reduced motion — render final state.

---

## 8. Accessibility

- **Focus order:** greeting → spend figure → category legend → urgent rows →
  upcoming rows → "View all".
- Spend card announces as one unit: `"Monthly recurring spend, $129.20, down 1.4%
  from last month, 8 active subscriptions."`
- The donut is decorative: `accessibilityElementsHidden`. The legend carries the
  data and is the accessible representation.
- Each legend row: `"Productivity, 43 percent."` (matches what is shown)
- Each urgent row: `"Netflix price increased from $13.99 to $15.49, $18.00 more
  per year."`
- Each upcoming row: `"Netflix, $15.49, due October 12."`
- Pull-to-refresh has an accessible alternative — a refresh action in the
  accessibility actions menu.

---

## 9. Definition of done

- [ ] Only one Home screen exists; the other 3 variants are not in the codebase.
- [ ] Every figure comes from the API; the screen performs no arithmetic.
- [ ] Upcoming Renewals sorted by date ascending — verified with seed data.
- [ ] Urgent Attention hidden entirely when empty.
- [ ] No add button and no brand mark in the header (greeting + avatar only).
- [ ] Legend percentages sum to exactly 100.
- [ ] Spend figure is `color.text`; card fill is `surface`.
- [ ] Donut colors match Analytics exactly (`08 §3`).
- [ ] Skeleton, empty, offline, partial-failure states all verified.
- [ ] Currency switch re-renders this screen; no second screen was built.
- [ ] Seed data renders $129.20 with the `04 §4.3` category breakdown.
