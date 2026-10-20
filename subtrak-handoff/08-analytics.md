# 08 — Analytics (Epic D)

**Prerequisites:** `01`, `02`, `03`, `04`, `06` (shares the chart contract).
**Deliverable:** one Analytics screen.
**Figma frames:** 1 — the least-developed screen in the prototype.

---

## 1. What changes

The prototype's Analytics screen was a searchable subscription list with a
category bar chart appended at the bottom. That is a list view wearing an
analytics label.

**Invert it. Insight first, list second.** The user opens this tab to learn
something they didn't already know — not to re-read the subscriptions they just
saw on Home.

It also showed only 4 of the user's 8 subscriptions and 4 of 6 categories, with
a $93.47 total that contradicted Home's $129.20. With the canonical dataset and
server-derived totals (`04`), that class of bug cannot recur.

---

## 2. Sections, in order

**Header (measured `4:3036`):** the frame shows a 28px brand mark + "Analytics"
(DM Serif 20) on the left and an **Add Subscription button** on the right. Keep the
left-aligned title; **drop the button** — the FAB is the only add path (`03 §2`).
The frame's card also runs edge-to-edge with no side gutter; keep the 16px gutter.

### 2.0 AI insight card — new in the newer Figma file (`4:3036`)

The frame now ends with a card: a lightbulb icon, an "AI insight" label in `accent`,
and one sentence — *"Cancel Duolingo Max to save $13.99 per month. It has not been
used in 30 days."* The card is edge-to-edge like the category card, and sits last in
the frame. **Build it first on the screen** (insight first, per §1), as a single
`Card` (`02 §8`) with the 16px gutter.

**The sentence in the frame cannot be shipped.**
- "Not been used in 30 days" needs usage data SubTrak does not have.
- Duolingo Max is a **trial** in this dataset — nothing is charged, so "save
  $13.99" is wrong.

Insight text is generated from computed aggregates only, and a test asserts every
number in it appears in the input (`11 §2.7`). Supported examples: a price
increase (*"Netflix rose $1.50 on Oct 1 — $18.00 a year."*), the largest category
(*"Productivity is 43% of your spend."*), a trial about to convert
(*"Hulu's trial converts to $17.99 on Oct 3."*). One insight at a time; hide the card when there is none.

**Other drift in this frame (vs the older copy):** Adobe CC is now **$59.99**
(canonical `04 §4.2` is **$54.99**), the category card shows 4 categories and a
$98.47 total (canonical: 6 categories, $129.20 — superseded, do not copy), and the
tab bar now includes the FAB. Confirm with the designer whether Adobe's price
really changed before touching the fixture.

### 2.1 Spend over time — new, the headline
12-month line or area chart from `/analytics/spend-over-time?months=12`.

| Property | Spec |
|---|---|
| Line | `color.accent`, 2px |
| Fill | `color.accent` at 8% opacity, to baseline |
| Current month | Emphasized point + label |
| Y axis | Starts at 0; max is the series max rounded up |
| X axis | Month initials; every 2nd label on narrow screens |
| Callout above | `display.lg` current figure + delta vs last month |

A user with under 2 months of history gets an informative placeholder instead:
"Your spending trend appears once you've been tracking for a couple of months."
Do not render a one-point chart.

### 2.2 Spending by category
Horizontal bars, structure from Figma frame `4:3036`, node `3:1275` ("Monthly spending by category"):

| Element | Spec |
|---|---|
| Card | `color.surface`, 1px `color.border`, radius 6, padding 24, gap 20 |
| Title | `display.md` — "Spending by category" |
| Subtitle | `body.md`, `color.textMuted` — "Current month" |
| Row gap | 18 |
| Row structure | Name (`label.semibold` 14) + amount (`label.bold` 14), then bar |
| Label-to-bar gap | 8 |
| Bar track | Full width, 12 tall, radius 6, `color.surface2` |
| Bar fill | Category color, radius `pill` |
| Bar width | Track width × (amount ÷ largest amount): the largest category fills 100% of the track |

> The prototype's bar widths were linear at about 4.9px per dollar, which left the
> largest bar at roughly 79% of the track. No rule in the file reproduces that, so
> it is not copied.

**All categories with a non-zero total appear.** Sorted descending.

### 2.3 Monthly total
Summary row inside the category card, below a 1px divider:

| Property | Value |
|---|---|
| Container | `color.successSurface`, radius 6, padding 20h / 18v |
| Label | `label.semibold`, `color.text` — "Monthly total" |
| Figure | `display.lg` (28px serif), `color.success` |

### 2.4 Subscriptions — demoted to last
Search field + category filter chips + the list, grouped by category.

| Element | Spec |
|---|---|
| Search | `TextField` with leading 16px search icon, placeholder "Search subscriptions…" |
| Chips | Horizontally scrollable; "All" + one per category |
| Chip selected | `color.accent` fill, `color.onAccent` label |
| Chip unselected | `color.surface` fill, 1px `color.border`, `color.textMuted` label |
| Chip | `FilterChip` (`02 §17`): 28 tall visually (measured), **44 touch target**, radius 4 |
| Group header | `SectionHeader` with the 8 × 8 color square (`02 §14`): uppercase Bold 12, tracking 0.5, `textMuted`; 10 gap to the first row, 16 between groups |
| Rows | `ListRow` (`02 §9`) |

---

## 3. Chart contract — shared with Home

Home's donut and this screen's bars show the same data. They must agree exactly.

1. **Same source:** `/analytics/summary?period=current_month`. Neither screen
   computes anything.
2. **Same colors:** `category.*` tokens from `01 §2`. A category is the same
   color in both places, always.
3. **Same rounding:** values rounded once, at presentation, by the same helper.
4. **Same ordering:** descending by amount.
5. **Same tail handling:** if Home groups small categories into "Other", Analytics
   does too, at the same threshold.

Pick one Expo-compatible chart library, justify it in one line in `CLAUDE.md`,
and use it for every chart in the app — here, on Home, and on the subscription
detail screen.

---

## 4. States

| State | Behavior |
|---|---|
| Loading | Per-section `Skeleton` |
| Empty (0 subscriptions) | `EmptyState`: "Nothing to analyze yet" + CTA to add one |
| Empty (filter matches nothing) | Inline: "No subscriptions in {Category}" + "Clear filter" |
| Empty (search matches nothing) | Inline: "No results for '{query}'" |
| < 2 months of history | Trend chart replaced by the placeholder in §2.1 |
| Offline | Cached data + stale banner |
| Error | Per-section inline retry |

---

## 5. Edge cases

| Case | Handling |
|---|---|
| One category only | Single bar at 100% width |
| Category under 1% | Bar renders at a 2px minimum so it stays visible |
| 50+ subscriptions | List virtualized; search and filters still instant |
| All cancelled | Totals show $0.00; list shows cancelled rows at reduced opacity |
| Very long category name | Wrap to 2 lines; the amount never wraps |
| Display currency ≠ USD | All figures converted; a note states the conversion |
| Spend identical two months running | Delta reads "No change from last month" |
| Largest OS font size | Bars stack under their labels rather than clipping |

---

## 6. Motion

| Element | Trigger | Animation | Duration | Easing |
|---|---|---|---|---|
| Bars | First render | Width 0 → final, staggered 50ms apart | 500ms | ease-out |
| Trend line | First render | Draw left to right | 600ms | ease-out |
| Filter chip | Select | Fill cross-fade | 150ms | ease-out |
| List | Filter change | Cross-fade, no layout animation | 200ms | ease-out |

All chart animation skipped under reduced motion — render final state.

---

## 7. Accessibility

- **Focus order:** trend callout → trend chart summary → category card title →
  each category row → monthly total → search → chips → list.
- Charts are `accessibilityElementsHidden`; text equivalents carry the data.
- Trend summary: *"Spending over 12 months. Current month $129.20, down 1.4% from
  last month. Highest was $134.10 in July."*
- Each category row: *"Productivity, $54.99, 43 percent of monthly spending."*
- Chips: `accessibilityRole="button"`, `accessibilityState={{ selected }}`,
  label includes the count — "Entertainment, 3 subscriptions".
- Search results announced as a count via a live region when the query changes.
- Filter chips at 44pt touch targets despite the 28pt visual.

---

## 8. Definition of done

- [ ] Spend-over-time chart is the first thing on the screen.
- [ ] Subscription list is last, not first.
- [ ] Every non-zero category appears — verified: seed data shows all 6.
- [ ] Category colors identical to Home's donut.
- [ ] Monthly total matches Home exactly ($129.20 with seed data).
- [ ] Chart library chosen once and documented in `CLAUDE.md`.
- [ ] Filter chips meet 44pt touch targets and AA contrast in both states.
- [ ] Per-filter and per-search empty states implemented.
- [ ] Chart text equivalents verified with a screen reader.
