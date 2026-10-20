# 07 — Subscription CRUD (Epic C)

**Prerequisites:** `01`, `02`, `03`, `04`.
**Deliverable:** add, detail, edit, history, cancel, delete.
**Figma frames:** 8.

> This is the core loop. If the schedule slips, this is the last thing to cut.
> A demo that adds a subscription and shows a correct total is a working product;
> everything else is decoration on top of it.

---

## 1. AddSubscription — presentation

Modal over the current tab, with a close (X) at leading-top. Does **not** change
the active tab (the prototype highlighted Analytics while this was open).

Dismissing a dirty form opens a confirm sheet: "Discard this subscription?" with
Discard (destructive) / Keep editing. A pristine form dismisses silently.

---

## 2. AddSubscription — fields

| Field | Component | Notes |
|---|---|---|
| Service name | `TextField` + picker | See below |
| Price | `CurrencyField` + currency selector | Symbol from billing currency, **never hardcoded `$`** |
| Category | `Select` | Options show `CategoryBadge` |
| Billing cycle | `SegmentedControl` | **All 5**: Weekly, Monthly, Quarterly, Yearly, Custom |
| Start date | `DateField` | Format from user settings |
| Notes | `TextField` multiline | Optional, 280 char limit |
| Paid with | `TextField` | Optional label, ≤ 30 chars, placeholder "e.g. Visa ••4242". Helper: "A label only — never enter a full card number." Backs the Detail "Paid with" row (`04 §1`, Subscription) |

> **Measured (`4:3417`):** the prototype's Add screen shows only a title (no
> close button), the tab bar, and these fields in this order: name → price →
> category → billing cycle → *(Every N unit, when Custom)* → start date → notes →
> Save (48 tall, Bold 16). It has **no payment-method field** and no currency
> selector — both are additions here. The category select shows the category
> name in *its category color*; the colors (e.g. `#a259ff` on white = 3.88:1)
> are not AA text colors — render the name in `color.text` with the colored dot.

### Service picker — new, not in the prototype

Typing filters the seeded catalog (`04 §4.7`). Selecting an entry prefills
**price, category, brand color, and tint**. Free text is always allowed — the
picker is a shortcut, never a constraint.

This cuts the common path from six fields to two taps, and it is the natural
place for AI autofill to land later (`11 §2`).

### Custom cycle

Choosing Custom reveals, inline below the control:
`Every [stepper n] [Select: days | weeks | months | years]`

The prototype's segment sets differ by frame: 4 (W/M/Q/Y), 4 (W/M/Y/Custom, Add)
and only 3 (W/M/Y, Edit). **All five segments stay visible at all times, on
Add and on Edit.**

---

## 3. AddSubscription — validation & success

| Rule | Message |
|---|---|
| Price > 0 | `Enter a valid price greater than $0.` (symbol follows currency) |
| Name required | `Enter a subscription name.` |
| Category required | `Choose a category.` |
| Start date required | `Choose a start date.` |
| Start date valid | `Start date can't be in the future.` |

**Empty-form state (measured, `4:3340`):** billing cycle is preselected to
**Monthly**; category and start date are empty and required. Placeholders:
"e.g. Netflix, Spotify…", "0.00", "Select category", "Select date", "Add any
notes…" — in `textMuted` (the prototype's `textSubtle` `#78817b` is 4.02:1 on
white and fails AA for placeholders).

**Error state (measured, `4:3509`):** the price field gets a `danger` border and
a 12px Medium `danger` message directly under it ("Enter a valid price greater
than $0."); the other fields are untouched. Save stays disabled while any error
exists. Because a disabled Save explains nothing, show each field's error **on
blur**, not only on submit.

Save is disabled until valid. **Disabled must look different from `secondary`**
(`02 §1`).

### Success state

Measured (`4:3587`): a full-screen state with **no tab bar** (it replaces the
modal's content). Padding 80 top / 16 sides / 32 bottom, gap 32, centered.

| Element | Content |
|---|---|
| Icon | **80px** circle `success` @ 10%, 32px check in `color.success` |
| Heading | "Subscription added" — DM Serif 24/32 (prototype: "Subscription Added!") |
| Body | DM Sans Medium 16/24 `textMuted` — "{Name} has been added to your subscriptions." |
| Summary card | `surface`, 1px `border`, radius 6, padding 20, gap 16 |
| — row 1 | `ServiceMark` 44 (letter 16.5) + name DM Sans Bold 16/24, with the category tag under it: 6px dot + 12px Medium label |
| — divider | 1px `border` |
| — row 2 | two columns, `space-between`: "BILLING PRICE" / "$12.99" and "FREQUENCY" / "Every 2 months" (right-aligned). Labels 12 Medium uppercase — `textMuted`, not the prototype's `textSubtle`; values 14 Medium `text` |
| **Normalized figure** | **"≈ $6.50/mo"** — required; **not in the prototype**, added below the two columns |
| Primary | "View on Dashboard" (`primary`, 48) |
| Secondary | "Add another" (`secondary`, 48, label `color.text` Bold) — resets the form in place, modal stays open. Gap 12 above |

The category tag's label is rendered in `color.text`, not the category color (the
prototype used `#a259ff`, which is not an AA text color).

The normalized line is not optional. Headspace at $12.99 every 2 months
contributes $6.50/month to the total; without this line the user sees $12.99 on
the card and a total that doesn't appear to include it.

---

## 4. SubscriptionDetail

| Element | Spec |
|---|---|
| Header | `ScreenHeader` (`03 §4`): back, left-aligned title "Subscription detail", trailing **⋯ overflow menu** (Delete — see Actions). The frame centers an 18px title between a 24px chevron and a share icon; the app-wide left-aligned header wins |
| Service mark | `ServiceMark` 72 (letter 27), gap 12 to the name block |
| Name | DM Serif 24/32, centered |
| Status badge | `Badge`: "Active" (`success`) / "Cancelled" (`neutral`), radius 4, padding 10h/4v, Bold 12 |

> The measured header (`4:3246`) has a **share icon** with no defined action.
> Sharing a subscription's price and spend history has no use case here and would
> leak financial data, so it is dropped; the slot holds the overflow menu instead.

### Detail rows

Card: `surface`, 1px `border`, radius 6. Each row `space-between`, padding 14,
label DM Sans Medium 14 `textMuted` (left), value DM Sans Medium 14 `text`
(right), 1px `border` divider under every row except the last. Measured order is
below; **Monthly equivalent** is an addition.

| Row | Source |
|---|---|
| Current price | `billing_price` + currency |
| Billing cycle | Human-readable ("Every 2 months") |
| Category | `CategoryBadge` |
| Monthly equivalent | `normalized_monthly` — shown when cycle ≠ monthly |
| Next renewal | `next_bill_date` |
| Paid with | `payment_label` — **row hidden when empty** |
| Date added | `start_date` |
| Total spent | `total_spent_to_date` — DM Serif 18/24, **`color.text`, never `color.danger`** (the prototype used `#b44735`) |

> The prototype showed "Total Spent $278.82" in red. Red is reserved for
> destructive actions and errors (`01 §2`). The figure was also reproducible from
> no start date — see `04 §4.4` for the corrected $433.69.

### Price history chart

| Property | Spec |
|---|---|
| Type | **Step line** — prices change discretely, not continuously |
| Range | Last 12 months |
| Section label | `SectionHeader` — "Price history (last 12 months)" (measured: uppercase Bold 12, tracking 0.5, `textMuted`) |
| Container | `Card` radius **6** (prototype 16), padding 16 |
| Height | **120** (prototype 60 cannot hold step annotations) |
| X labels | First month ("Oct 2025") left, "Today" right; `caption` `textMuted` (prototype `textSubtle` fails AA) |
| Data | Real `price_change` events from `/subscriptions/{id}/history` |
| Line color | `color.accent` |
| Annotation | Label each step with the new price and date |
| Empty | "No price changes in the last 12 months" — not an empty axis |

> The prototype drew a flat red line while Edit History plainly showed
> $13.99 → $15.49. With seed data this chart **must** render a visible step at
> 2026-10-01. It is the single most convincing element in the demo — it is the
> screen where the app looks like it is paying attention.

### Actions

| Action | Style | Placement |
|---|---|---|
| Edit subscription | `primary` | Inline |
| Mark as cancelled | `secondary` | Inline |
| Delete | `destructive` | **Overflow menu, not inline** |

Delete does not sit next to Edit. The prototype put a red Delete button directly
below Edit, which is a misclick away from destroying history.

---

## 5. EditSubscription

Same fields as Add, prefilled. Measured (`4:4189`):

- Header: `ScreenHeader` (`03 §4`), title "Edit Subscription", no trailing control
  (the frame centers an 18px title).
- The **"History" link is not in the header** — it sits on the right of the
  *Subscription Name* label row: "History" 12 SemiBold `accent` + 16px history
  icon, 44pt hit area → EditHistory.
- Field order: name → price → category → billing cycle → start date → notes
  (label is just "Notes"; Add says "Notes (optional)" — use "Notes (optional)" on both).
- Actions stacked, gap 10, 10 above: **Save Changes** (`primary`, 48) then
  **Cancel** (outlined, `border`, label `textMuted` SemiBold 16 in the prototype).

| Element | Spec |
|---|---|
| Save | `primary`, disabled until something changed |
| Cancel | `secondary` with a `color.text` label — **must not read as disabled** (`02 §1`). The prototype's `textMuted` label on a thin border reads as disabled; that is the bug being fixed. Dirty form → "Discard changes?" sheet |

Any change to price, category, or cycle writes a `PriceHistoryEvent`
server-side (`04 §5`). The client does not create history records.

---

## 6. EditHistory

Reverse-chronological list. Each entry: date, typed badge, description.

| Badge | Example |
|---|---|
| Price Update | "Price changed from $13.99 to $15.49" |
| Category | "Category changed from Other to Entertainment" |
| Cycle | "Billing cycle changed from Monthly to Yearly" |
| Creation | "Subscription added, $13.99/mo, Other" |
| Cancelled | "Marked as cancelled" |

Measured (`4:4271`): each entry is a `Card` (padding 16, gap 12, radius 6), 16 apart,
8 below the app bar. Header row `space-between`: date DM Sans SemiBold 14 `text`
(left) and a `Badge` (right); body DM Sans Regular 14/20 `textMuted`. Header title
"Edit History — {name}", one line, ellipsis.

| Badge | Variant | Prototype |
|---|---|---|
| Price update | `warning` | `#996b13` on 10% tint — kept |
| Creation | `success` | `#267465` on 10% tint — kept |
| Category, Cycle, Cancelled | `neutral` | **Category was `#b44735` (danger) in the prototype — red is reserved for errors and destructive actions, so it is neutral here** |

Badge text is 12px Bold (prototype 10px, below the floor). Empty state when only a
creation event exists.

---

## 7. Cancel vs Delete — both required

The prototype offered Delete only. Most people stop paying for a subscription;
they rarely want its record erased.

### Mark as cancelled
Confirm sheet → status becomes `cancelled`. The subscription:
- keeps all history,
- drops out of every total,
- still appears in lists with reduced opacity and a "Cancelled" badge,
- contributes to a "saved per year" figure.

Sheet copy: *"{Name} will stop counting toward your monthly total. Its history
stays, and you can reactivate it anytime."*

### Delete
Destructive confirm sheet — **soft delete** (`04 §2`). Measured (`4:4330`): `BottomSheet`
`tone="destructive"` (`02 §12`).

| Element | Spec |
|---|---|
| Header row | gap 16: 48px circle `danger` @ 10% with 24px alert-triangle in `color.danger`; title "Delete subscription?" DM Serif 20/28 |
| Body | DM Sans 14/22: **"{Name} ({price}/{cycle})"** in Bold `text`, then regular `textMuted`: " will be removed from your subscriptions and totals. Its history is kept." |
| Actions | stacked, gap 12: `destructive` "Delete" (48) then `secondary` "Cancel" |

On confirm: status → `deleted`, pop to the screen the detail was opened from (the
prototype said "sent back to the dashboard"), and show a Toast **"Subscription
deleted · Undo"** for 6 seconds. Undo restores the previous status.

> An earlier draft of this file said "permanently deleted … can't be undone",
> contradicting the prototype's "Historical billing records will be retained".
> The prototype's behavior is adopted. If you would rather have a hard delete,
> change `04 §2` and this sheet copy together.

Both sheets require an explicit choice — no backdrop-tap dismissal (`02 §12`).

---

## 8. Edge cases

| Case | Handling |
|---|---|
| Service name 100+ chars | Enforce a 60-char limit in the field; truncate in lists |
| Price with many decimals | Round to the currency's minor units on blur |
| Price in a zero-decimal currency (JPY) | No decimal input; validation adapts |
| Start date before the service existed | Allowed — SubTrak isn't the authority on that |
| Cycle changed on an existing subscription | Recompute `next_bill_date`; write a history event |
| Subscription created then immediately cancelled | History shows both events |
| Offline on save | Queue the write, show "Saved — will sync"; reconcile on reconnect |
| Duplicate service name | Allowed, with a soft warning: "You already track a Netflix." |
| Deleting the last subscription | Home returns to the first-run empty state |
| Editing while another device edits | Last write wins; surface a conflict notice if detectable |

---

## 9. Screen states

### AddSubscription / EditSubscription
| State | Behavior |
|---|---|
| Idle | Save disabled until valid (Add) or changed (Edit) |
| Saving | Save in loading state; fields disabled; X still dismisses with a warning |
| Validation error | Inline per field; first invalid field scrolled into view |
| Save failed online | Form-level banner; all input preserved |
| Save failed offline | Queued; success state shows "Saved — will sync" |
| Success | Cross-fade to the success state (Add) or pop to detail (Edit) |

### SubscriptionDetail
| State | Behavior |
|---|---|
| Loading | Skeleton for rows and chart; service mark and name render first if cached |
| Loaded | As specified |
| Chart has no events | "No price changes in the last 12 months" — not an empty axis |
| Load failed | Full-screen error + retry; cached values shown if present |
| Offline | Cached detail + stale banner; Edit and Delete disabled with a reason |
| Cancelled subscription | Status badge reads "Cancelled"; primary becomes "Reactivate" |

### EditHistory
| State | Behavior |
|---|---|
| Loading | 3 skeleton rows |
| Only a creation event | Empty state: "No changes since you added this." |
| Loaded | Reverse-chronological list |

---

## 10. Motion

| Element | Trigger | Animation | Duration | Easing |
|---|---|---|---|---|
| Add modal | Present | Slide from bottom | 350ms | ease-out |
| Success state | Save complete | Cross-fade from form | 250ms | ease-out |
| Price chart | First render | Line draws left to right | 500ms | ease-out |
| Custom cycle row | Reveal | Height expand + fade | 200ms | ease-out |
| Confirm sheet | Open | Slide up + backdrop fade | 300ms | ease-out |

Chart draw and the custom-cycle expand both collapse to instant under reduced
motion.

---

## 11. Accessibility

- **Focus order (Add):** close → name → price → currency → category → cycle →
  custom fields (if shown) → start date → notes → save.
- The service picker is a combobox: `accessibilityRole="combobox"`, results
  announced as a count ("8 results"), selection confirmed aloud.
- Price field: `accessibilityLabel` includes the currency — "Price in US dollars".
- Validation errors announced via `accessibilityLiveRegion="polite"`.
- The price chart is `accessibilityElementsHidden`; a text summary beside it
  carries the data: *"Price history: $13.99 from March 2024, increased to $15.49
  on October 1, 2026."*
- Both confirm sheets announce the consequence, not just the action. The Delete
  sheet's body states the consequence ("removed from your subscriptions and
  totals"); the Undo toast is announced via a live region.
- The segmented control announces position: "Monthly, 2 of 5".

---

## 12. Definition of done

- [ ] Add opens as a modal with an X; no tab highlights while open.
- [ ] Dirty-form dismissal prompts; pristine does not.
- [ ] Service picker prefills from the catalog; free text still works.
- [ ] All 5 cycle segments present in every state, including Custom.
- [ ] Currency symbol follows billing currency everywhere.
- [ ] Success state shows the normalized `≈ $X.XX/mo` figure.
- [ ] "Add another" resets in place without closing.
- [ ] Price history chart renders a visible step with seed data.
- [ ] Total spent is **not** red.
- [ ] Delete lives in an overflow menu; Cancel is the inline secondary.
- [ ] Cancelled subscriptions keep history and leave totals — verified by test.
- [ ] Edit's Cancel button is visually distinct from a disabled button.
