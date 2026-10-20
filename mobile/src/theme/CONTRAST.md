# Contrast report: design tokens (handoff 01 §6)

This report covers the colour pairs **added or changed** when the app moved to the Figma
token system (file `kyUS7F8bg4x7GpcPEF4UDN`). The five light-theme pairs that 01 §6
lists as already verified are not repeated here; `tokens.test.ts` still asserts them.
Every ratio below is recomputed from `tokens.ts` on each `npm test`, so the code is the
source of truth and this file is the explanation.

Thresholds (WCAG 2.1 AA):

- **4.5:1** for text.
- **3:1** for graphical objects and control boundaries (1.4.11).
- Inactive (disabled) controls are exempt.

## Fixes made while promoting Figma values

| Token                     | Figma     | Shipped   | Why                                                                                                                                          |
| ------------------------- | --------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `textSubtle`              | `#78817b` | _removed_ | 01 §1 bans it for text (4.02:1 on `surface`). Darkening it to `#66706a` passed the arithmetic but kept a token whose only purpose was text, so it is gone and the `/mo` suffix uses `textMuted`. |
| `typography.micro`        | 10px      | _removed_ | 01 §4 retires `micro` and forbids a 9 or 10px style. The `/mo` suffix it styled is information, so it moved to `caption` (12px).            |
| `radius.badge` (new)      | n/a       | `4`       | Badges and chips measure 4 in Figma; this file first assumed `pill`. 01 §5: measured wins. `pill` now means only things that must read as round. |
| `category.productivity`   | `#b38b35` | `#9c7a2e` | It was 2.58:1 on the `surface2` bar track, which fails 3:1. It is now 3.28.                                                                  |
| `category.healthWellness` | `#5d9088` | `#547f78` | It was 2.95:1 on `surface2`. It is now 3.66.                                                                                                 |
| `borderControl` (new)     | n/a       | `#8f897c` | Figma's `border` `#d8d2c5` is 1.51:1 on white, so it can't be an input outline. `border` stays for cards and dividers, which are decorative. |
| `radius.button`           | 5         | 6         | Cards are 6 and buttons are 5, a 1px difference that was almost certainly unintentional. Both are normalized to 6.                           |

## New pairs: light and dark

| Pair                              | Light | Dark  | Needs |
| --------------------------------- | ----- | ----- | ----- |
| borderControl on surface          | 3.48  | 3.93  | 3.0   |
| toggleOff on surface (switch off) | 3.58  | 3.93  | 3.0   |
| accent on accentSurface           | 6.23  | 5.09  | 4.5   |
| danger on dangerSurface           | 4.67  | 5.64  | 4.5   |
| text on bg                        | 14.00 | 14.42 | 4.5   |
| textMuted on bg                   | 4.76  | 7.95  | 4.5   |
| textMuted on surface              | 5.24  | 7.05  | 4.5   |
| accent on surface                 | 7.85  | 6.51  | 4.5   |
| onAccent on accent                | 7.85  | 7.38  | 4.5   |
| danger on surface                 | 5.39  | 6.14  | 4.5   |
| success on successSurface         | 4.79  | 6.02  | 4.5   |

The dark theme is entirely new, since Figma draws no dark frames. All of its values are
derived, and every pair above is asserted for both themes.

## The warning family (01 §1)

These four replaced the `notice*` tokens this file used to list. They are promoted from
values hardcoded at the Home price-change alert (node `4:2968`) and they are
**translucent**, at the alphas Figma draws: `warningSurface` 10%, `warningBorder` 20%,
`warningIconBg` 13%. So a ratio only exists once the layers are flattened — and they
nest, since the 40px icon circle sits on the card fill, which sits on the page. The
banner appears on `bg` (Home) and inside a `surface` card elsewhere, so both grounds are
measured and asserted.

| Over      | Flattened fill | text | `warning` icon on fill | icon on its circle |
| --------- | -------------- | ---- | ---------------------- | ------------------ |
| light bg      | `#ede6d8` | 12.40 | 3.79 | 3.27 |
| light surface | `#f5f0e7` | 13.56 | 4.14 | 3.56 |
| dark bg       | `#262921` | 12.07 | 6.95 | 5.39 |
| dark surface  | `#2e322c` | 10.67 | 6.14 | 4.78 |

Text needs 4.5; the icon and its circle are graphics and need 3.

- **The light figures reproduce 01 §1 exactly** — it states 12.4:1 for text and 3.79:1
  for the icon, which is how we know the values and the alphas are right.
- **Text on the tint is `colors.text`, never `textMuted`.** Muted grey measures **4.22:1**
  on the light fill over `bg` — the 12px AA failure 01 §1 calls out. A test pins that
  number so the ban can be dropped if the pair ever passes.
- **`warningBorder` is decorative** (1.28:1 light, 1.47:1 dark) and is not held to a
  ratio, exactly like `border`.
- **The dark theme lightens the amber** to `#d9ab4e`, keeping Figma's alphas. At the
  original `#996b13` the fills drift towards the ink rather than away from it, and the
  icon on its own circle fell to **2.66:1** — the one pair that failed when this was
  first written.

## Categories: each on surface and on surface2 (the bar track)

| Key            | Light     | on surface | on surface2 | Dark      | on surface | on surface2 | Source                            |
| -------------- | --------- | ---------- | ----------- | --------- | ---------- | ----------- | --------------------------------- |
| entertainment  | `#be705e` | 3.70       | 3.03        | `#d08a78` | 5.66       | 4.90        | Figma                             |
| productivity   | `#9c7a2e` | 4.01       | 3.28        | `#c9a55a` | 6.72       | 5.82        | Figma, darkened                   |
| aiTools        | `#8a7798` | 4.06       | 3.32        | `#a996b8` | 5.77       | 5.00        | Figma donut legend, node `4:2957` |
| cloudStorage   | `#507c92` | 4.53       | 3.70        | `#7ba3b8` | 5.79       | 5.02        | Figma donut legend, node `4:2952` |
| newsMedia      | `#7c7a4a` | 4.43       | 3.62        | `#a8a571` | 6.17       | 5.35        | Derived; Figma has no fill        |
| healthWellness | `#547f78` | 4.48       | 3.66        | `#7fb0a7` | 6.46       | 5.60        | Figma, darkened                   |
| other          | `#78746b` | 4.66       | 3.81        | `#a39e93` | 5.86       | 5.08        | Derived; neutral greige           |

- **Every category also passes 3:1 on `bg`.** `tokens.test.ts` asserts that too, along
  with distinctness and that no category equals `danger`.
- **Derived hues stay in the same muted, low-chroma earth-tone family** as the four
  confirmed values (01 §2).
- **Entertainment against danger.** `entertainment` and `danger` are 1.46:1 apart in
  luminance, close enough to confuse. That is why the adjacency rule in 01 §2 is a
  convention and not just a lint rule.

### The shipped set is not the one 01 §2 tabulates

01 §2 predates the taxonomy decision in handoff 04, so its table and this one differ in
three ways. The code follows 04; **01 §2 is stale and should be updated to match.**

| 01 §2                            | Shipped                | Why                                                                                                  |
| -------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------- |
| `gaming` `#8a7798`               | _dropped_              | Not a category in handoff 04. The hex is still used — it is the Figma donut's AI Tools slice.         |
| —                                | `other` `#78746b`      | 04's seventh category. Distinct from an uncategorized subscription, which borrows its colour (US-8).  |
| `aiTools` `#5b6fa6` (invented)   | `#8a7798`              | Pulled from the real Figma donut legend, node `4:2957`, instead of invented.                          |
| `cloudStorage` `#7d8f4e` (inv.)  | `#507c92`              | Pulled from the Figma donut legend, node `4:2952`.                                                   |
| `newsMedia` `#8f6a52` (invented) | `#7c7a4a`              | Still derived — Figma has no fill for it — but re-picked to stay distinct from `entertainment`.        |

So 01's sign-off item 1 ("category colours for AI Tools, Cloud Storage and News & Media
are invented") is now only true of **News & Media**. The other two are measured.

## Service tiles

There are seven muted tint/ink pairs per theme for services with no catalog brand
colour (`serviceTint(name)`). Ink on its own tint is at least **5.91:1** in light and
**6.85:1** in dark.

## Component pairs added by the component library (handoff 02)

| Pair                                        | Light | Dark | Needs |
| ------------------------------------------- | ----- | ---- | ----- |
| onAccent on accentPressed (pressed primary) | 8.67  | 6.31 | 4.5   |
| onAccent on danger (destructive button)     | 5.39  | 6.95 | 4.5   |
| onAccent on dangerPressed                   | 6.14  | 5.93 | 4.5   |
| Toggle thumb (onAccent) on the "on" track   | 7.85  | 7.38 | 3.0   |
| Toggle thumb (onAccent) on the "off" track  | 3.58  | ≈4.2 | 3.0   |

The pressed fills are their base colour darkened by 8%, per 02 §1. The thumb uses
`onAccent`, as 02 §7 says, and needs no token of its own: it passes on both tracks in
both themes. `successBorder` (the toast outline) and `scrim` (the sheet backdrop) are
decorative and are not held to a ratio.

## Disabled states (exempt, but measured)

From 02, a disabled Button or field is a `surface2` fill with a `textMuted` label, at full
opacity. That pair is **4.28:1** in light and **6.10:1** in dark. Primitives with no designed
disabled state still dim to `opacity.disabled` (0.45). For those, the dimmed primary label
on its dimmed fill is 2.24 in light and 2.52 in dark.

WCAG 1.4.3 and 1.4.11 exempt inactive components. The test holds every disabled pair to a
2:1 floor so a disabled label stays legible as a label. Raising them further would make
disabled look enabled.

## The one pair that is below AA, and the rule that handles it

**`textMuted` on `surface2` is 4.28:1** in the light theme (6.10 in dark). Rather than
darken muted text everywhere, **muted text is never placed on a `surface2` fill.**

- `Badge` used to do this for its neutral tone; it now uses `text`.
- A test documents the pair, so if a future token change makes it pass, the convention
  can be dropped.

## Flags for the designer

1. **The Figma donut legend uses `#b44735` (`color.danger`) for Entertainment** (node
   `4:2947`). This breaks 01 §2: danger is never data. The code cannot reproduce it, but
   the Figma frame should be fixed.
2. **The Figma Analytics list and bars colour categories with service brand hexes**:
   Netflix `#e50914`, ChatGPT `#10a37f` and iCloud `#007aff` (node `4:3036`). Those are
   saturated, so they break the muted set and conflate service with category. The code
   uses the category tokens above.
3. **Buttons are radius 5 and cards radius 6.** The code normalizes both to 6.
4. **`textSubtle`, `productivity` and `healthWellness` were darkened** for contrast; the
   values are in the first table.
5. **`/mo · Monthly` on the Analytics list is 9px**, below the 12px floor. It is not
   reproduced: there is no `micro` role any more, and the suffix is `caption` (12px).
6. **The category set differs from 01 §2** — `gaming` dropped, `other` added, and two of
   the three "invented" colours replaced with measured ones. See the table above; 01 §2
   needs updating rather than the code.
7. **Badges and chips are radius 4**, not the pill this file first shipped, per the
   measurement in 01 §5. Only genuinely round things (bar tracks, the toggle, the sheet
   grabber, the 8px category dot) still use `radius.pill`.
