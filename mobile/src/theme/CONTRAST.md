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
| `textSubtle`              | `#78817b` | `#66706a` | It was 4.02:1 on `surface` and 3.65:1 on `bg`, which fails for the `/mo` text. It is now 5.13 and 4.67.                                      |
| `category.productivity`   | `#b38b35` | `#9c7a2e` | It was 2.58:1 on the `surface2` bar track, which fails 3:1. It is now 3.28.                                                                  |
| `category.healthWellness` | `#5d9088` | `#547f78` | It was 2.95:1 on `surface2`. It is now 3.66.                                                                                                 |
| `borderControl` (new)     | n/a       | `#8f897c` | Figma's `border` `#d8d2c5` is 1.51:1 on white, so it can't be an input outline. `border` stays for cards and dividers, which are decorative. |
| `radius.button`           | 5         | 6         | Cards are 6 and buttons are 5, a 1px difference that was almost certainly unintentional. Both are normalized to 6.                           |

## New pairs: light and dark

| Pair                              | Light | Dark  | Needs |
| --------------------------------- | ----- | ----- | ----- |
| textSubtle on surface             | 5.13  | 5.69  | 4.5   |
| textSubtle on bg                  | 4.67  | 6.41  | 4.5   |
| borderControl on surface          | 3.48  | 3.93  | 3.0   |
| toggleOff on surface (switch off) | 3.58  | 3.93  | 3.0   |
| accent on accentSurface           | 6.23  | 5.09  | 4.5   |
| danger on dangerSurface           | 4.67  | 5.64  | 4.5   |
| noticeText on noticeSurface       | 9.48  | 9.32  | 4.5   |
| text on bg                        | 14.00 | 14.42 | 4.5   |
| textMuted on bg                   | 4.76  | 7.95  | 4.5   |
| textMuted on surface              | 5.24  | 7.05  | 4.5   |
| accent on surface                 | 7.85  | 6.51  | 4.5   |
| onAccent on accent                | 7.85  | 7.38  | 4.5   |
| danger on surface                 | 5.39  | 6.14  | 4.5   |
| success on successSurface         | 4.79  | 6.02  | 4.5   |

The dark theme is entirely new, since Figma draws no dark frames. All of its values are
derived, and every pair above is asserted for both themes.

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

## Service tiles

There are seven muted tint/ink pairs per theme for services with no catalog brand
colour (`serviceTint(name)`). Ink on its own tint is at least **5.91:1** in light and
**6.85:1** in dark.

## Disabled states (exempt, but measured)

Disabled is drawn as the whole control at `opacity.disabled` (0.45) over `bg`.

| Pair, as rendered                         | Light | Dark |
| ----------------------------------------- | ----- | ---- |
| Disabled primary button label on its fill | 2.24  | 2.52 |
| Disabled input text on its field          | 2.79  | 3.70 |

WCAG 1.4.3 and 1.4.11 exempt inactive components. The test holds these to a 2:1 floor so a
disabled label stays legible as a label. Raising them further would make disabled look
enabled.

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
5. **`/mo · Monthly` on the Analytics list is 9px**, below the 10px `micro` role and the
   12px floor. It is not reproduced.
