# 01 — Design Tokens & Theme

**Prerequisites:** none. This is the first file to implement.
**Deliverable:** a typed token module + light/dark theme provider for the Expo app.
**Source:** Figma `kyUS7F8bg4x7GpcPEF4UDN`, variable collection `color/*`.
**Status:** ✅ **Complete.** Built by Hassan, merged in #82. Ticked 2026-10-22.

> Values below were pulled live from the Figma file. Use them exactly. Do not
> re-pick colors by eye from a screenshot.

---

## 1. Color — semantic

These ten exist as real Figma variables. Keep the names aligned so design and
code refer to the same thing.

| Token | Hex | Usage |
|---|---|---|
| `color.bg` | `#f6f4ee` | Warm cream page background |
| `color.surface` | `#ffffff` | Cards, rows, inputs |
| `color.surface2` | `#ece8de` | Bar-chart tracks, inset fills, muted chips |
| `color.border` | `#d8d2c5` | Card borders, row dividers, input outlines |
| `color.text` | `#18272b` | Primary text |
| `color.textMuted` | `#626f6c` | Secondary text, inactive tab labels |
| `color.accent` | `#105b5d` | Primary buttons, active tab, links, prices |
| `color.onAccent` | `#ffffff` | Text on accent fills |
| `color.success` | `#267465` | Positive figures, confirmation totals |
| `color.danger` | `#b44735` | **Destructive actions and validation errors only** |

### Found hardcoded in Figma — promote to tokens

| Token | Hex | Usage |
|---|---|---|
| `color.successSurface` | `#e7f0e9` | Pale green "Monthly Total" card fill |
| `color.toggleOff` | `#76817d` | Toggle off-track. **Decision** — the Figma toggles are flattened SVGs, so the real off color is unreadable. 4.03:1 on white (≥3:1 needed for a control boundary); white thumb on it 4.03:1 |
| `color.warning` | `#996b13` | Price-change alert icon (measured, Home node `4:2968`). 4.70:1 on white |
| `color.warningSurface` | `rgba(153,107,19,0.10)` | Alert card fill |
| `color.warningBorder` | `rgba(153,107,19,0.20)` | Alert card 1px border |
| `color.warningIconBg` | `rgba(153,107,19,0.13)` | 40px circle behind the alert icon |
| `color.textSubtle` | `#78817b` | ⚠️ **Fails AA for text** (4.02:1 on white, 3.65:1 on `bg`, measured). Used by the prototype for "from last month", chart axis labels, unselected segment labels and `/mo · Monthly`. **Never use for text — use `textMuted`.** Keep only for non-text strokes if needed. |

**The AI-epic frames use off-token ambers and oranges** (`#9b752c`, `#fff7de`, `#f59e0b`, `#d97706`, `#92400e`, `#fffbeb`, and `#b44735` on a days-left chip). Map them all to the `warning` family above. Measured contrast: `#9b752c` on `#fff7de` 3.94:1 and `#d97706` on `#fff7ed` 3.00:1 both **fail AA** for small text; `#b44735` is `color.danger` and may not be used for urgency (`11 §2.5`).

**Text on `warningSurface` must be `color.text`.** The prototype set the alert
subtitle in `textMuted`, which measures 4.22:1 on the tint — a 12px AA failure.

---

## 2. Color — category

Hardcoded in Figma today. Promote to a `category.*` scale.

| Token | Hex | Confirmed |
|---|---|---|
| `category.entertainment` | `#be705e` | ✅ from file |
| `category.productivity` | `#b38b35` | ✅ from file |
| `category.healthWellness` | `#5d9088` | ✅ from file |
| `category.gaming` | `#8a7798` | ✅ from file |
| `category.aiTools` | `#5b6fa6` | ⚠️ **Decision — not in Figma** |
| `category.cloudStorage` | `#7d8f4e` | ⚠️ **Decision — not in Figma** |
| `category.newsMedia` | `#8f6a52` | ⚠️ **Decision — not in Figma** |

### The prototype has four conflicting palettes (measured)

Every frame hardcodes category colors, and they do not agree. There is no single
"right" set in the file:

| Frame | Entertainment | Productivity | AI Tools | Cloud | Health & Wellness |
|---|---|---|---|---|---|
| Home donut (`4:2901`) | `#b44735` | `#507c92` | `#8a7798` | `#5d9088` | — |
| Analytics groups + bars (`4:3036`) | `#e50914` | `#b38b35` | `#10a37f` | `#007aff` | — |
| Add form category select + success tag (`4:3417`, `4:3587`) | — | — | — | — | `#a259ff` |
| Edit form category select (`4:4189`) | `#b44735` | — | — | — | — |
| Token set above (earlier frames) | `#be705e` | `#b38b35` | — | — | `#5d9088` |

Two of these are traps:

- The Home donut paints **Entertainment in `#b44735`, which is exactly
  `color.danger`**. That is the collision the red adjacency rule below forbids.
- The Analytics frame reuses **service brand colors** (Netflix red, ChatGPT green,
  iCloud blue) as *category* colors. Brand color belongs on `ServiceMark`
  (§3), not on categories.

**Decision:** keep the muted earth-tone set above. The three rows marked
Decision were invented to complete the scale (low-chroma, ≥3.5:1 on white,
distinct from `danger`); **a designer must sign them off.** Contrast of every
category color is measured: 3.15–4.92:1 on white. `productivity` (3.15:1) and
`cloudStorage` (3.55:1) are the weakest and only 2.6–2.9:1 on `surface2` bar
tracks — acceptable only because every bar and legend row also carries a text
label and a number, so color is never the sole carrier (§7).

### The red adjacency rule

`color.danger #b44735` and `category.entertainment #be705e` are different hexes
that sit close in hue. They must never appear adjacent:

- No Entertainment category dot in the same row as a destructive button.
- Never use a category color for a destructive action.
- Never use `color.danger` for data — not for a chart line, not for a total, not
  for a price. The prototype's red "Total Spent: $278.82" is the exact mistake
  to avoid.

---

## 3. Service brand colors

Service logos use per-service brand color on a tinted background, not category
color. Observed on the Netflix row:

| Property | Value |
|---|---|
| Container | 40 × 40, radius 20 (full circle) |
| Container fill | Service tint — Netflix `#ffecee` |
| Initial text | Service brand — Netflix `#e50914` |
| Initial type | DM Sans Bold, 15px |

Letter size is **0.375 × the tile diameter** (measured at 36 → 13.5, 40 → 15,
44 → 16.5, 72 → 27). Observed tints:

| Service | Tint | Brand letter | Mark |
|---|---|---|---|
| Netflix | `#ffecee` | `#e50914` | N |
| Spotify | `#e3f9ed` | `#1db954` | S |
| iCloud+ | `#e6f0fa` | `#007aff` | iC |
| ChatGPT Plus | `#e1f7f4` | `#10a37f` | GP |
| Adobe CC | `#fff7cc` | `#b38b35` | A |
| Headspace | `#f4ecff` | `#a259ff` | H |

(Adobe's and Headspace's tiles use a category-like color rather than the real brand
color — Adobe's real brand is red, Headspace's orange. Confirm with the designer.)

The brand letter on tint measures 2.3–4.2:1 (Spotify 2.34, ChatGPT 2.86, Adobe
2.92, iCloud 3.48, Netflix 4.22). That is acceptable **only** because the tile is
decorative (`accessibilityElementsHidden`) and the service name is always shown
next to it. Never use the tile as the sole identifier.

Store tint + brand hex + mark per service in the seed catalog (see `04 §4.7`). For a
user-entered service with no catalog entry, derive a deterministic tint from the
name hash within the muted palette family — never random, so the same name
always produces the same color.

---

## 4. Typography

Both are Google Fonts under the SIL Open Font License, so they bundle freely.
Load with `expo-font` before first paint; do not rely on system fallbacks.

| Role | Family | Weight | Size | Tracking | Used for |
|---|---|---|---|---|---|
| `display.lg` | DM Serif Display | Regular | 28 | -0.6 | Large currency totals |
| `display.md` | DM Serif Display | Regular | 24 | -0.4 | Screen + section titles |
| `body.lg` | DM Sans | Regular | 15 | — | Input text, button labels |
| `body.md` | DM Sans | Regular | 14 | — | Body copy |
| `label.md` | DM Sans | Medium | 14 | — | Settings row labels |
| `label.semibold` | DM Sans | SemiBold | 14 | — | Field labels, list titles |
| `label.bold` | DM Sans | Bold | 14 | — | Category amounts |
| `price` | DM Sans | Bold | 16 | — | Price badge primary figure |
| `caption` | DM Sans | Regular | 12 | — | "Next bill: …", helper text |
| `tab` | DM Sans | SemiBold | 11 | — | Tab bar labels |
| ~~`micro`~~ | — | — | — | — | **Retired.** See below |

DM Sans is a variable font with an `opsz` axis. Figma sets `opsz: 14` throughout —
set it once in the font config rather than per text node.

### One size falls below the 12pt floor

`tab` (11px) is below the minimum readable size. It is deliberate and acceptable
**only** because tab labels sit directly under a 20px icon that carries the
meaning.

Measured sub-12 text elsewhere in the prototype: `/mo · Monthly` at **9px** on
Analytics rows, and the `12 active` badge at **10px bold**. Both carry
information (the billing cycle; the count), so neither is acceptable. **Raise
both to `caption` (12px).** Do not build a 9 or 10px style.

`tab` must still scale with the OS font-size setting — see §7. Do not introduce
any other text below 12px.

---

## 5. Spacing, radii, sizing

4pt base scale. Observed values from the Figma file:

| Token | Value | Observed in |
|---|---|---|
| `space.xs` | 4 | Icon-to-label gap in tab bar |
| `space.sm` | 8 | Label-to-input gap, intra-group gap |
| `space.md` | 12 | Logo-to-text gap in list rows |
| `space.lg` | 16 | Row horizontal padding, screen gutter |
| `space.xl` | 20 | Card inner padding (summary cards) |
| `space.xxl` | 24 | Card padding, screen gutter on 402w |

| Token | Value | Applies to |
|---|---|---|
| `radius.card` | 6 | Cards, inputs, list rows, bar tracks |
| `radius.button` | 5 | Buttons |
| `radius.pill` | 999 | Progress bars, chips |
| `radius.avatar` | 20 | 40px service logo circles |
| `radius.fab` | 24 | 48px center add button |
| `radius.badge` | 4 | Status badges, count badges, filter chips (measured) |

**Stray radii in the file — normalize, don't copy:** segmented control 10/8,
number stepper and unit select 12, price-history chart container 16. All become
`radius.card` (6). Chips and badges were **4** in the prototype; this file
earlier said pill — measured wins, so they are 4.

**Note the inconsistency:** cards are radius 6, buttons are radius 5. That is a
1px difference almost certainly unintentional. **Normalize both to 6** and record
the change here. Flag it to the designer rather than preserving it.

| Constant | Value |
|---|---|
| `touchTarget.min` | 44 |
| `device.baseline` | 402 (iPhone 16 Pro) |

---

## 6. Themes

Build a light/dark provider. The ten semantic names in §1 are the **light**
values. Derive a dark set using the same semantic names, so no component
references a theme directly.

Dark theme is **required, not optional** — the Profile screen exposes a
Dark / Light / System control (`09 §5`). Wire it to real themes; do not stub it.

### Contrast — already verified, do not "fix" these

| Pair | Ratio | Result |
|---|---|---|
| `textMuted #626f6c` on `bg #f6f4ee` | 4.76:1 | ✅ AA |
| `accent #105b5d` on `surface #ffffff` | 7.85:1 | ✅ AA |
| `onAccent #ffffff` on `accent #105b5d` | 7.85:1 | ✅ AA |
| `danger #b44735` on `surface #ffffff` | 5.39:1 | ✅ AA |
| `success #267465` on `successSurface #e7f0e9` | 4.79:1 | ✅ AA |

The light palette is in good shape. **Every new pair you introduce must be
verified**, specifically:

- the entire dark theme,
- each category color on `surface` and on `surface2`,
- button and input disabled states,
- the toggle off state,
- ~~`textSubtle #78817b` on `surface`~~ — **measured: 4.02:1 on white, 3.65:1 on `bg`. Fails AA. Not usable for text** (§1).
- `warning #996b13` text/icon on `warningSurface` — icon 3.79:1 (OK for a graphic); text must be `color.text` (12.4:1).

Output a contrast report covering only the new pairs. Fix any failure before
finishing.

---

## 7. Accessibility requirements for the token layer

- **Dynamic Type.** All sizes must scale with the OS font-size setting. Use
  scalable units, not fixed pixels. Verify layouts survive the largest setting —
  the tab bar and price badges are the first things to break.
- **Reduced motion.** Expose `prefers-reduced-motion` through the theme so
  components can skip transitions. Specified per component in `02 §15`.
- **No color-only meaning.** Category identity must always pair its color with a
  text label. A colored dot alone is not sufficient.

---

## 8. Definition of done

- [x] Every value above exists as a named, typed token.
- [x] Light and dark themes both complete, same semantic names.
- [x] DM Serif Display + DM Sans bundled and loading before first paint.
- [x] Contrast report produced for all new pairs; no failures remain.
- [x] `radius.button` normalized to 6 and the change noted.
- [x] The three missing category colors pulled from Figma or justified.
- [x] Zero hardcoded color/size/spacing values anywhere else in the codebase.

**Ticked 2026-10-22, with the evidence for each:** tokens and both themes live in
`mobile/src/theme/` with `tokens.test.ts` and `ThemeProvider.test.tsx`; the
contrast report is committed at `mobile/src/theme/CONTRAST.md` and its suite runs
for both themes; the three category colours with no Figma fill are marked
`// Derived` in `tokens.ts` and justified in §3's decision note; rule 6 is
enforced by the `no-restricted-syntax` rule in `mobile/eslint.config.js`, which
cites this section. Fonts before first paint, the live light/dark flip and the
largest text size were checked on a device in Expo Go on 2026-10-19 — reported
by Hassan, with no screenshots or device details recorded. On-device *measured*
contrast is still unverified; the committed report is computed.
