# 02 — Component Library

**Prerequisites:** `01-design-tokens.md` implemented.
**Deliverable:** 21 shared components + a dev-only gallery screen.
**Source:** measurements pulled live from Figma `kyUS7F8bg4x7GpcPEF4UDN`.

> **Context that matters:** the Figma file contains only **three** reusable
> components in total (the Add Subscription button and two toasts). Everything
> else — tab bars, list rows, settings rows, inputs — is duplicated raw frames,
> copy-pasted across ~40 screens. That is precisely why they drifted apart.
>
> You are building the first real component library for this project, not
> wrapping an existing design system. Every duplicated pattern below becomes one
> component with variants.

---

## 1. Button

| Property | Value |
|---|---|
| Height | 48 |
| Radius | `radius.card` (6 — normalized from Figma's 5) |
| Label type | `body.lg` (15px) |
| Horizontal padding | `space.lg` |

| Variant | Fill | Border | Label color | Label weight |
|---|---|---|---|---|
| `primary` | `color.accent` | none | `color.onAccent` | Bold |
| `secondary` | `color.surface` | 1px `color.border` | `color.text` | SemiBold |
| `destructive` | `color.danger` | none | `color.onAccent` | Bold |
| `destructiveOutline` | transparent | 1px `color.danger` | `color.danger` | Bold |
| `ghost` | transparent | none | `color.accent` | SemiBold |

`destructiveOutline` is the **trigger** for a destructive flow (measured: Detail
"Delete Subscription", Family "Remove {name} from Family"). Solid `destructive`
is reserved for the final button inside the confirm sheet. Do **not** fill the
outline variant with a `danger` tint: the prototype's Remove button does that and
the label measures 4.29:1 on it — an AA failure at 14px.

| State | Appearance |
|---|---|
| Default | As above |
| Pressed | Fill darkened 8%; ghost/secondary get `color.surface2` fill |
| Disabled | Fill `color.surface2`, label `color.textMuted`, opacity 1 |
| Loading | Spinner replaces label, button stays at full width, press disabled |

**Critical:** `secondary` and `disabled` must be visually distinct. In the
prototype the Edit screen's "Cancel" button read as disabled because both used a
flat grey. Secondary keeps a visible border and full-strength text; disabled
loses the border and mutes the label.

**A11y:** `accessibilityRole="button"`; `accessibilityState={{ disabled, busy }}`;
loading state announces "Saving" or the action verb, not just a spinner.

---

## 2. TextField

| Property | Value |
|---|---|
| Height | 52 |
| Radius | `radius.card` |
| Border | 1px `color.border` |
| Fill | `color.surface` |
| Horizontal padding | `space.lg` (16) |
| Input text | `body.lg` (15px), `color.text` |
| Placeholder | `body.lg`, `color.textMuted` |
| Label | `label.semibold` (14px), `color.text`, `space.sm` above field |

| State | Appearance |
|---|---|
| Default | 1px `color.border` |
| Focused | 2px `color.accent`; layout must not shift — use inset border |
| Error | 2px `color.danger` + error text below in `caption`/`color.danger` |
| Disabled | Fill `color.surface2`, text `color.textMuted` |

> **Measured vs normalized.** The form frames (Add, `4:3417`) use 46px-tall
> inputs, 14px values, and 12px SemiBold `textMuted` labels. The auth frames use
> the 52 / 15 / 14 values above. They are two drifted styles; this spec
> normalizes everything to the auth style (the larger, more legible one). Price
> inputs in the Add form are 16px in the prototype — they are the same 15px here.

Helper text and error text occupy the same slot. Reserve its height always, so
the form does not jump when an error appears.

**A11y:** label is programmatically associated with the field;
`accessibilityLabel` falls back to the label text; error text is announced via
`accessibilityLiveRegion="polite"`.

---

## 3. CurrencyField

Extends TextField. The currency symbol is **driven by the subscription's billing
currency**, never hardcoded `$` — the app is multi-currency and the prototype
hardcoded the symbol on every Add Subscription frame.

| Property | Value |
|---|---|
| Symbol | Leading, `body.lg`, `color.textMuted`, `space.sm` from the value |
| Value | `body.lg`, `color.text`, right-aligned numeric keyboard |
| Decimal handling | Locale-aware separator; store minor units |

Pairs with a billing-currency selector. Validation message on invalid input is
exactly: `Enter a valid price greater than $0.` with the symbol substituted for
the selected currency.

---

## 4. SegmentedControl

Used for billing cycle and the Monthly/Annual toggle.

| Property | Value |
|---|---|
| Track fill | `color.surface2` |
| Track radius | `radius.card` |
| Segment height | 40 (container 44 with padding, meeting touch minimum) |
| Selected fill | `color.surface` |
| Selected label | `label.semibold`, `color.text` |
| Unselected label | `label.md`, `color.textMuted` |

> **Measured (`4:3417`):** white track, radius 10, 2px padding, 40 tall; selected
> segment fill `#e4ece7` (1.2:1 against the track — nearly invisible), unselected
> labels `textSubtle` (fails AA), labels 12px SemiBold. This spec uses `surface2`
> track + `surface` selected + a 1px `border` on the selected segment so the
> selection is perceivable without relying on a 1.2:1 tint.

**Must support 5 segments.** The prototype showed 4 (Weekly/Monthly/Quarterly/
Yearly) in one place and a different 4 (Weekly/Monthly/Yearly/Custom) in another,
silently dropping Quarterly (and the Edit frame has only 3: Weekly/Monthly/
Yearly). All five are always present. At 402px width, five
segments of 11px+ labels will be tight — if labels truncate, switch to a
Select (`§5`) rather than abbreviating.

**A11y:** `accessibilityRole="tablist"` on the track, `"tab"` on each segment,
`accessibilityState={{ selected }}`.

---

## 5. Select / Dropdown

| Property | Value |
|---|---|
| Closed state | Identical to TextField + trailing chevron (16px) |
| Open | Bottom sheet on mobile, not an inline dropdown |
| Selected row | Trailing check, 18px, `color.accent` |

When used for Category, each option shows a `CategoryBadge` (`§10`).

---

## 6. DateField

TextField with a trailing 16px calendar icon. Tapping anywhere in the field opens
the native date picker. Display format follows the user's `date_format` setting
(`09 §1`) — do not hardcode MM/DD/YYYY.

---

## 7. Toggle

| Property | Value |
|---|---|
| Size | 40 × 24 |
| On fill | `color.accent` |
| Off fill | `color.toggleOff` `#76817d` — **Decision** (Figma's toggles are flattened SVGs, the off color is unreadable); 4.03:1 on `surface` |
| Thumb | 20px circle, `color.onAccent`, 2px inset |

**Touch target problem:** the toggle itself is 24px tall — below the 44pt
minimum. The containing settings row is 52px tall. **Make the entire row the
touch target**, not just the toggle. This applies to every toggle in the app.

**A11y:** `accessibilityRole="switch"`, `accessibilityState={{ checked }}`. The
row label is the accessible name.

---

## 8. Card

| Property | Value |
|---|---|
| Fill | `color.surface` |
| Border | 1px `color.border` |
| Radius | `radius.card` |
| Padding | `space.xxl` (24) |
| Internal section gap | `space.xl` (20) |

No drop shadows anywhere in the design — the border carries the separation.

---

## 9. ListRow (`sub-card`)

The most-repeated component in the app. Exact values from Figma node `3:1686`:

| Element | Spec |
|---|---|
| Container | Fill `color.surface`, 1px `color.border`, radius 6, padding 16, gap 12 |
| Container height | 72 |
| Logo | 40 × 40 circle, service tint fill, initial in DM Sans Bold 15px service brand color |
| Title | `label.semibold` 15px `color.text` |
| Subtitle | `caption` 12px — label portion `color.textMuted`, value portion DM Sans Medium `color.text` |
| Price | DM Sans Bold 16px `color.accent`, right-aligned |
| Price suffix | `caption` 12px `color.textMuted`, 2px below price ("/mo · Monthly" — the prototype's 9–10px `textSubtle` fails both size and AA) |

> **Variants measured in other frames.** Analytics rows (`4:3036`) measure
> title 14, price 14 Bold, single-tone subtitle — a drifted copy of this spec;
> follow this section. Home's Upcoming Renewals use a **`compact`** variant:
> padding 12, logo 36 (letter 13.5), name `label.semibold` 14, subtitle
> `caption` `textMuted` (relative date, e.g. "in 2 days"), trailing amount 14
> Medium `color.text` (not accent). Build `compact` as a prop on `ListRow`.

The subtitle is a **two-tone string**: `Next bill: ` in muted, `Oct 12, 2026` in
medium-weight primary. Build it as a composed text node, not one flat string.

| State | Behavior |
|---|---|
| Default | As above |
| Pressed | Fill → `color.surface2` |
| Cancelled subscription | Title and price at 60% opacity, trailing "Cancelled" badge |

**Long service names truncate at one line with ellipsis.** The price badge is
fixed-width and never truncates — it must always be fully readable.

**A11y:** the whole row is one touchable with a composed label:
`"Netflix, $15.49 per month, next bill October 12, 2026"`. Do not expose the
three text nodes separately.

---

## 10. CategoryBadge

Colored 8px dot + label in `label.md`. The dot alone never carries meaning —
always paired with the label text (see `01 §7`).

---

## 11. SettingsRow

Exact values from Figma node `3:1819`:

| Property | Value |
|---|---|
| Padding | 16 horizontal, 14 vertical |
| Label | `label.md` (DM Sans Medium 14px) `color.text` |
| Divider | 1px `color.border` bottom, inset to the full row width |
| Height — chevron variant | 46 |
| Height — toggle variant | 52 |

| Variant | Trailing element |
|---|---|
| `chevron` | Optional value text in `label.md`/`color.textMuted` + 16px chevron |
| `toggle` | Toggle (`§7`) — whole row is the touch target |
| `stepper` | −/+ buttons, 28 × 28, with value between |
| `destructive` | Label in `color.danger` + trailing icon |

Rows group into a `color.surface` container with radius 6; the last row in a
group has no bottom divider.

---

## 12. BottomSheet

| Property | Value |
|---|---|
| Grabber | 40 × 4, radius 2, `color.border`, centered, first child (not on destructive sheets) |
| Padding | `space.xxl` (24); bottom adds the safe-area inset |
| Backdrop | Black at **70%** opacity (measured on both sheets) |
| Radius | **24** top corners (measured) |
| Top edge | 1px `color.border` |
| Gap | 20 (confirm) / 24 (destructive) |

Used for confirms, pickers, and destructive confirmations. Dismiss on backdrop
tap **except** destructive confirms, which require an explicit choice.

**`tone="destructive"`** (measured, Delete sheet `4:4330`): scrim 70% black
(same as every sheet), no grabber, padding 24 / 24 / 34-bottom-plus-inset, top radius 24,
1px `border` on the top edge, gap 24. Header row = 48px `danger`@10% circle with a
24px alert-triangle in `color.danger`, then a DM Serif 20/28 title. The currency
sheet (`3:1956`) shares the radius and 70% scrim but adds a grabber, a DM Serif
18 title and a 20 gap.

---

## 13. Toast

| Property | Value |
|---|---|
| Size | ~248 × 44, radius pill |
| Content | 16px leading icon + `label.md` |
| Position | Above the tab bar, respecting safe area |
| Duration | 3s auto-dismiss |

The only component that already exists in Figma (two symbol variants).

---

## 14. EmptyState / Skeleton / SectionHeader

**EmptyState** — centered: 48px icon, `display.md` title, `body.md` body in
`color.textMuted`, optional primary Button. Max width 280, centered.

**Skeleton** — `color.surface2` fill, radius matching the real element, pulse
animation 1.5s ease-in-out. Must honor reduced-motion: render static at 60%
opacity instead of pulsing.

**SectionHeader** — uppercase label, DM Sans **Bold 12px** (measured on Analytics
group headers and the Detail price-history label; the 11px SemiBold previously
listed here was wrong), letter-spacing 0.5, `color.textMuted`, 20px top padding.
Optional leading 8 × 8 color square (radius 4) with 8px gap — used for category
group headers. The square never stands alone; the label is always present.

---

## 15. Motion

| Element | Trigger | Animation | Duration | Easing |
|---|---|---|---|---|
| Button | Press | Scale 0.98 + fill darken | 100ms | ease-out |
| ListRow | Press | Fill → `surface2` | 100ms | ease-out |
| BottomSheet | Open | Slide up + backdrop fade | 300ms | ease-out |
| BottomSheet | Dismiss | Slide down + fade | 250ms | ease-in |
| Toast | Enter | Fade + translate Y 8px | 200ms | ease-out |
| Modal screen | Present | Slide from bottom | 350ms | ease-out |
| Skeleton | Loading | Opacity pulse 0.4 ↔ 1.0 | 1500ms | ease-in-out |
| Toggle | Change | Thumb translate + fill cross-fade | 150ms | ease-out |

**All of these must be skipped or reduced to a cross-fade when
`prefers-reduced-motion` is set.**

---

## 16. Stepper

Numeric −/+ control. Used by Custom billing cycle (`Every [2] [Months ▾]`).
Measured in `4:3417`: 44 tall, radius 12 (→ `radius.card`), `surface` fill, 1px
`border`, 12 horizontal padding, − and + icons 14px, value DM Sans Medium 16
centered, `space-between`.

| Property | Value |
|---|---|
| Min / max | 1 / 99 |
| Hit areas | **Left and right thirds each ≥ 44 × 44**; the 14px icons are visual only |
| At a bound | That side's icon uses `textMuted` and is disabled |
| Long-press | Repeats after 400ms at 8 steps/sec |

**A11y:** `accessibilityRole="adjustable"`, `accessibilityValue={{ now }}`,
increment/decrement actions. Announces "Every, 2".

Sits beside a `Select` (unit) of the same 44px height. The SettingsRow `stepper`
variant (§11, 28 × 28 buttons) is below the touch minimum: keep the 28px visual,
extend the hit area to 44.

---

## 17. FilterChip

Measured (Analytics `4:3036`): padding 12h / 6v, radius **4**, label 12px.

| State | Fill | Border | Label |
|---|---|---|---|
| Selected | `color.accent` | none | `color.onAccent`, Bold |
| Unselected | `color.surface` | 1px `color.border` | `color.textMuted`, Medium |

Visual height 28; **touch target 44** via `hitSlop`. Chips sit in a horizontally
scrolling row (gap 8, 16 gutters) — the prototype wrapped them onto multiple
lines.

**A11y:** `accessibilityState={{ selected }}`. **As built the role is `radio`,
not `button`** — the row is a single-choice group, so "radio button,
Entertainment, selected" tells a screen-reader user what "button, Entertainment"
does not. The selected state is set either way.

---

## 18. SearchField

`TextField` variant for filtering lists. Measured: `surface` fill, 1px `border`,
radius 6, padding 14h / 10v, leading 16px search icon, 8px gap, 14px
placeholder in `textMuted`. Height 44 (not the 52 of form fields).

Shows a trailing clear (×) button, 44px hit area, whenever non-empty. Keyboard
return key is "search". Local lists filter instantly; server-backed lists debounce
200ms.

---

## 19. Badge

Measured: radius 4, padding 8–10h / 4v, DM Sans Bold. **12px** (the prototype's
10px count badge is raised to the floor).

| Variant | Fill | Text |
|---|---|---|
| `success` | `color.success` @ 10% | `color.success` |
| `neutral` | `color.surface2` | `color.text` — **see below** |
| `warning` | `color.warningSurface` | `color.text` (not `warning` — 3.79:1 fails) |

`neutral` text is `color.text`, not the `textMuted` first listed here: muted grey
on `surface2` measures 4.28:1, which fails AA at 12px for the same reason
`warning` on its own tint does. Both tones take full-strength text.

Used for "12 active", "Active", "Cancelled", "Trial". Never a pill.

---

> **AI-epic variants** (`11 §2`): `Badge` also serves as the confidence chip (green / amber, 12px) and the days-left chip; a `ProgressBar` (8 tall, radius 4, `surface2` track, `accent` fill, value = ratio) is needed by TrialShield and SharedPlans. Build both alongside this section when the AI epic starts, not in Phase 0.

## 20. AlertCard

Measured (Home `4:2968`). Row layout, gap 12, padding 16, radius 6.

| Tone | Fill | Border | Icon circle | Icon |
|---|---|---|---|---|
| `warning` | `warningSurface` | 1px `warningBorder` | 40px, `warningIconBg` | 20px alert-triangle, `color.warning` |

Title DM Sans Bold 14/20 `color.text`; body DM Sans Medium 12/16 **`color.text`**
(AA — see `01 §1`). Optional press → navigates. Whole card is the touch target.

---

## 21. ServiceMark

Circular service tile. Diameters observed: 36, 40, 44, 72. Radius = diameter / 2.
Fill = service tint; text = service `mark` (1–2 characters from the catalog, e.g.
"N", "iC", "GP"; first letter of the name when the service isn't in the catalog)
in DM Sans Bold at **0.375 × diameter** in the brand color.

`shape="square"` (radius 6) at 28px is used by the dense member-subscription rows
on Member detail (`10 §3.4`); everything else is a circle.

Decorative: `accessibilityElementsHidden`; the service name is always rendered
beside it. Tint/brand pairs and their (low) contrast are in `01 §3`.

---

## 22. Definition of done

> **Status:** all 21 are built in `mobile/src/components`, consuming tokens only.
> The `ProgressBar` and confidence chip of the note above §20 remain deferred to
> the AI epic (`11 §2`), as that note directs. Three of the 21 landed under the
> names the code already used for the same pattern, so there is one component per
> pattern rather than two: `FilterChip` (§17), `AlertCard` (§20) and
> `ServiceMark` (§21) replaced the earlier `Chip`, `NoticeBanner` and `Tile`.

- [ ] All 21 components built, consuming tokens only.
- [ ] Every component has TypeScript props, an `accessibilityRole`, and a label.
- [ ] Every component has a rendering test.
- [ ] Secondary vs disabled Button states verified visually distinct.
- [ ] Every toggle's full row is the touch target.
- [ ] SegmentedControl renders 5 segments without truncation at 402px.
- [ ] Stepper hit areas, FilterChip hit slop and ListRow `compact` variant verified.
- [ ] Dev-only gallery screen renders every component in every state, both themes.
- [ ] Reduced-motion verified on all 8 animations.
