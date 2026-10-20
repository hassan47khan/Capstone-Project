# SubTrak — Developer Handoff -- Completed

**Project:** SubTrak (CSC 325 capstone) · `hassan47khan/Capstone-Project`
**Stack:** React Native (Expo) · Django + DRF · MongoDB Atlas
**Design source:** Figma `IKYivyJtmBYzJNQ7g8qPGc` (newer; adds the AI-epic frames) — page "Full Integrated Prototype Epic A, B, C". **Home (`4:2901`) exists only in the original file `kyUS7F8bg4x7GpcPEF4UDN`.**
**Status:** Mobile Phase 0 complete (runs in Expo Go). None of these screens exist in code yet.

---

## How to use this handoff

Each file below is a **self-contained work order**. Read the one file for the task
in front of you, plus its stated prerequisites. Do not read all of them at once —
they total more than any single session should hold, and skimming them is worse
than reading one properly.

Every file states its prerequisites at the top. If a prerequisite file has not
been implemented yet, stop and say so rather than inventing what it would have
contained.

### File map

| File | Covers | Prereqs | Phase |
|---|---|---|---|
| `01-design-tokens.md` | Colors, type, spacing, themes, contrast | none | 0 |
| `02-component-library.md` | 21 shared components with real measurements | 01 | 0 |
| `03-navigation.md` | Tab/stack/modal structure, nav rules | 01, 02 | 0 |
| `04-data-and-money.md` | Domain model, money engine, canonical dataset, API | none | 1 |
| `05-auth-onboarding.md` | Epic A — register, verify, login, reset, first-run | 01–04 | 2 |
| `06-home-dashboard.md` | Epic B — the canonical Home screen | 01–04 | 3 |
| `07-subscriptions.md` | Epic C — add, detail, edit, history, cancel/delete | 01–04 | 3 |
| `08-analytics.md` | Epic D — spend over time, category breakdown | 01–04, 06 | 4 |
| `09-settings.md` | Epic E — settings, currency, timezone, notifications | 01–04 | 5 |
| `10-family.md` | Epic F — multi-user (**stretch; cut if behind**) | 01–04, 09 | 7 |
| `11-missing-screens.md` | Calendar, AI epic, empty/loading/error states | 01–04 | 6, 8 |
| `12-team-assignments.md` | Who builds what, Claude Code prompts, cross-person seams | all | — |

### Build order

```
Phase 0  Foundations ......... 01, 02, 03
Phase 1  Backend contract .... 04
Phase 2  Auth ................ 05
Phase 3  Core loop ........... 06, 07     ← demo-able product starts here
Phase 4  Analytics ........... 08
Phase 5  Settings ............ 09
Phase 6  AI epic ............. 11 §2      ← graded capstone requirement
Phase 7  Family .............. 10         ← cut first if schedule slips
Phase 8  Calendar + polish ... 11 §1, §3
```

**Minimum demo-able slice:** Phases 0 → 1 → 2 → 3. Everything after is additive.

---

## Non-negotiable rules

These apply to every file. They exist because the prototype violated each one and
it produced visible, compounding bugs.

1. **No total is ever stored or hand-written.** Every monetary total in the app is
   computed from the subscription set at read time, server-side, by the money
   engine in `04`. The client never sums anything.
2. **Money is never a float.** `Decimal` end to end. Round only at presentation.
3. **Danger red is reserved.** `color.danger` is for destructive actions and
   validation errors only — never for data, totals, or chart lines.
4. **The FAB is the only add affordance.** No "Add Subscription" button in any
   screen header.
5. **No screen renders a blank frame.** Every list and data view has a defined
   loading, empty, and error state. They are specified per screen, not optional.
6. **Design tokens only.** No hardcoded color, size, or spacing values anywhere
   outside `01`.

---

## Deliberate departures from the prototype

The Figma file is a prototype, not a spec. These changes are intentional —
implement the spec, not the mockup. Each is justified in its own file.

| Prototype | Spec | Why |
|---|---|---|
| Two dashboards (stat-card + flat list) | One rich dashboard | `06` |
| Add button in header **and** tab-bar FAB | FAB only | `03` |
| 5-rule password checklist + confirm field | Single field, length rule, show/hide | `05` |
| Paywall before any value is shown | After first subscription added | `05` |
| Delete only | Cancel (retains history) + Delete | `07` |
| Analytics = filtered list + chart | Insight first, list second | `08` |
| Notification toggles inline in Settings | One row → Notification Rules screen | `09` |
| Frame widths 390 / 393 / 402 | 402 (iPhone 16 Pro) as the design baseline | `01` |
| Centered 24px header titles, 9–11px badges and labels | Left-aligned 20px `ScreenHeader`; nothing below 12px except the tab label | `01`, `03` |
| Permanent Delete, no undo | Soft delete + Undo toast | `07` |
| "Regular User Account" subtitle, Import, 2FA | Removed / cut for MVP | `09` |

---

## Two corrections to earlier review notes

Both were wrong in the first design review and are corrected throughout:

- **Contrast passes.** The muted grey and small labels were flagged as failing
  WCAG AA. Measured, they pass (`#626f6c` on `#f6f4ee` = 4.76:1). The real
  contrast risk is only in states that were never designed. See `01 §6`.
- **The reds are two different tokens.** `category.entertainment #be705e` and
  `color.danger #b44735` are distinct. The problem is adjacency, not identity.


---

## Verification status — do the specs match the screens?

The specs were first written from screenshots and a shallow Figma pass. They have
since been checked against **node-level Figma measurements** for the frames below.
Treat the status column as the truth about how far to trust each file.

| Spec | Frames | Status |
|---|---|---|
| `06` Home | `4:2901` (**original file only**) | **Measured** — frame deleted from the newer file; stale `113:641` is not the design |
| `07` Subscriptions | `4:3246 4:3340 4:3417 4:3509 4:3587 4:4189 4:4271 4:4330` (add, success, detail, edit, history, delete) | **Measured** |
| `08` Analytics | `4:3036`, `3:1275` | **Measured**; re-checked in the newer file — frame changed (AI insight card, Adobe $59.99, FAB in tab bar) |
| `09` Settings root, currency, confirm, timezone | `3:1778 3:1878 3:1956 3:2131` | **Measured** |
| `09` Notification rules | `3:2210` | **Measured** |
| `09` Profile | `3:2734` | **Measured** |
| `10` Family list, member detail | `3:2463`, `3:2537` | **Measured** |
| `02` ListRow / SettingsRow | `3:1686`, `3:1819`, `3:1854` | Measured in an earlier pass, not re-checked |
| `05` Auth, onboarding, paywall | `3:959`–`3:1220`, `3:1308`, `3:1237` | **Unverified** — written from screenshots |
| `06` Dashboard variants | `3:1657`, `3:2007` (EUR) | **Unverified** — variants of the measured frame |
| `10` Admin dashboard, family currency & billing | `3:2291 3:2375 3:2645` | **Unverified** |
| `11` AI epic | `110:14 110:432 110:186 110:266` | **Measured** (newer file) |
| `11` AI epic | `110:496 110:125` | Structure only — same layout as a measured sibling |
| `11` Calendar, empty/loading/error states | — | **No design exists**; specced from requirements |
| Stale | `113:641`, `113:765` | **Do not build** — indigo-palette drafts replaced by the `110:*` frames |

I diffed the two Figma files node by node (names, sizes, structure — not fills or text): every node common to both is unchanged except in the Analytics frame, so the earlier measurements still hold. In total 22 frames are now verified (18 earlier + 4 AI frames). For the rest, treat colors, sizes and copy as
a first draft and re-check against Figma before building.

### Decisions that need sign-off (not measurements)

These are choices made in the specs, not things the designs show. Confirm or
override each before the screens that use them are built.

1. Category colors for AI Tools, Cloud Storage and News & Media are **invented** —
   the prototype never defined them (`01 §2`).
2. `color.toggleOff #76817d` is chosen for contrast; the prototype's off-state could
   not be read (`01`).
3. Soft delete with an Undo toast (`07`), and the optional `payment_label` field (`04`).
4. Retiring the `micro` text size; raising badge and price-suffix text to 12px (`01`, `02`).
5. Chips and badges at radius 4 (`01`).
6. Hiding the plan badge in the MVP; cutting Import and two-factor auth (`09`).
7. Family is a stretch goal; the AI epic is required (`10`, `11`).
8. AI input path: Gmail OAuth (design) vs forwarding address (earlier recommendation); Gmail only, Outlook hidden (`11 §2.1`).
9. Trials are excluded from totals until they convert; shared plans never change totals (`04 §6a`, `11 §2.6`).
10. TrialShield / SharedPlans live in the Calendar / Settings tab stacks (`03`); Contract-alert card cut from SharedPlans.
11. Adobe CC: $59.99 in the Analytics frame vs $54.99 in the dataset — designer to confirm.

### Still open (blocks Phase 0 and 2)

Router (expo-router vs React Navigation) · styling approach · server-state library ·
TypeScript on or off · auth library (simplejwt / dj-rest-auth / custom) · real paywall
or not · Family in or out · primary AI feature · email delivery provider · an existing
API contract from the backend spike · target platforms · instructor scope sign-off.
