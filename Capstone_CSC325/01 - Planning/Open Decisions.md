---
status: open
owner: Hassan
updated: 2026-10-22
---

# Open Decisions

From specification section 15, with what Sprint 0 has since settled marked.
Several rows have no owner because team roles are still unassigned — that is
itself the first thing to fix.

## Settled by Sprint 0

| Decision | Outcome |
| --- | --- |
| Repository layout | Done. Django in `backend/`, Expo client in `mobile/`. |
| Django ↔ `django-mongodb-backend` pairing | Holds on 6.1. No fallback to 6.0 needed. See [[Sprint 0 — Backend Spike]]. |
| Local and CI MongoDB topology | Single-node replica set via `docker-compose.yml`, both places. |
| Category taxonomy (2026-10-19) | Handoff 04's seven: entertainment, productivity, ai-tools, cloud-storage, news-media, health-wellness, other. Spec enum amended. See [[Open Decisions#2026-10-19 Figma retheme and handoffs 01-03|2026-10-19 decision record]]. |
| Slice owners (2026-10-22) | `04` to Chris. `04 §6a` still Rafi, `src/api` still Hassan, and `05`–`11` unchanged: Chris `05`–`06`, Ankit `07`–`09`, Rafi `10`–`11`. See the [[Open Decisions#2026-10-22 Slice owner for 04|2026-10-22 decision record]]. |
| Appearance source (2026-10-19) | The Figma file `kyUS7F8bg4x7GpcPEF4UDN` replaces the PDF prototype. |

## Still open

| Decision | Recommendation in the spec | Owner | Needed by |
| --- | --- | --- | --- |
| Team roles — Scrum Master and Product Owner | — | Team | **Now.** Blocks every Product Owner row below. *Per-sprint slice owners are settled; see the table above.* |
| Does SubTrak clear the guidelines' "expense organizer" exclusion? | Ask the instructor, framing the LLM extraction, splitter and reminder pipeline as the substance; get it in writing | Product Owner | Before Sprint 1 planning |
| How Sprint 0 counts against the five-sprint requirement | Ask the instructor | Scrum Master | Sprint 0 |
| Named real users for the Week 3 requirements work | Name three actual people matching the personas, schedule the questions | Product Owner | Sprint 0 |
| Participant accounts vs guest link (US-15) | Require registration, as designed in section 6 | Product Owner | Sprint 1 |
| Totals treatment — trials excluded, shared plans at full price with an "owed to you" line | Adopt as written in section 9 | Product Owner | Sprint 1 |
| Account deletion and data export | Small epic in Sprint 5 | Product Owner | Sprint 2 planning |
| Push transport | Expo Push Service, Android-first for demos | Team | Sprint 0 |
| LLM provider, model and daily cost cap | One vision-capable small model, per-user daily cap and a kill switch | Team | Sprint 2 |
| Contract reminder window counted back from the notice deadline (US-18) | Confirm the literal reading in section 8 | Product Owner | Sprint 4 planning |

## Raised by the design review, not in the spec

From `docs/design/README.md`:

- The prototype's subscription detail screen shows a **"Payment method —
  Visa ····4242"** row. No such field exists in the data model and SubTrak never
  asks for card details — it is the one promise the product makes. Either the
  prototype drops the row or the privacy claim changes. Needs the Product
  Owner. Flagged in [[Phase 0 — Mobile Scaffold]] and still unanswered.
- Two further Settings rows in the prototype have no backing field.
- ~~The prototype's demo categories do not match the spec's set.~~ Settled
  2026-10-19; see the table above.
- The price-increase banner belongs to Epic H, not the dashboard.
- **Epic numbering disagrees** (raised 2026-10-19). The developer handoff calls
  Home "Epic B" and Settings "Epic E", but [[Sprint Map]] uses Epic B for Settings
  and Epic C for the dashboard. Nothing has been renumbered. Pick one scheme
  before handoff files 05 onward are turned into issues, or stories will be
  filed under the wrong epic. More pressing since PR #75: the route names now
  follow the handoff (Home, Calendar, Analytics, Settings), so the code and the
  handoff agree and only the Sprint Map uses the older epic letters.

## Decision records

### 2026-10-22 Slice owner for 04

From reviewing [#90](https://github.com/hassan47khan/Capstone-Project/pull/90),
which delivered `04`'s models, money engine, seed and money tests. Chris built
it; `12 §1` and the root `CLAUDE.md` both still said `04` was Hassan's.

- **`04` moves to Chris.** *Why:* he has already built slice 1, and with `01`–`03`
  merged the backend was all that remained of Hassan's critical path. Taking it
  back would mean either rewriting working code or rubber-stamping it. `04 §6a`
  stays with Rafi. `src/api` stays with Hassan, generated from Chris's schema —
  so the seam is the OpenAPI file, not the client.
- **`06` (Home) stays with Chris**, and `07`–`09` with Ankit, `10`–`11` with
  Rafi — the original split, unchanged. Moving `06` to Ankit was considered and
  rejected by Hassan on 2026-10-22: `04` plus `03`, `05` and `06` does put the
  backend, the contract everyone mocks against and Home on one person, and
  `06`/`08` sharing one chart contract (`08 §3`) stays a cross-person seam. Both
  are accepted. The mitigations are the contract-freeze-first order below, and
  agreeing the chart library on day one — Ankit reuses Chris's CategoryCard
  rather than building a second one.
- **The contract freeze comes before the endpoints.** *Why:* `05`–`11` all
  list `04` as a prerequisite. Frozen OpenAPI shapes plus a mock let three
  people start; working endpoints behind an unfrozen contract unblock nobody.
  `12 §2.1` is rewritten to put it first, which is the order that section
  always had — #90 did the money engine first instead.
- **Category percentages.** `04 §4.3`'s six shares add to 99.99, and #90's tests
  asserted that. `06 §2.3`, `06 §2.4` defect 4, `08 §3` and the system design's
  "Category breakdown (US-8)" all require integers summing to exactly 100 by
  largest remainder. *Outcome:* `04 §4.3` now states both — the exact shares and
  the displayed integers (43/31/16/5/3/2) — and the engine supplies the integers
  so no screen rounds its own. The prototype's legend summing to 88 is what that
  duplication produces.
- **Two spec errors fixed in the same pass**, both found by #90: `04 §4.2` said
  Headspace's next bill is 2026-12-15, which no every-2-months schedule on the
  15th can produce at `SEED_TODAY` (it is 2026-10-15); and `04 §3.4`'s example
  claimed early rounding turns Alex's total into $129.21, which it does not.

### 2026-10-19 Figma retheme and handoffs 01-03

Moved here from that day's session log, which is now local-only.

- **Appearance source.** Retheme the Phase 0 client to the Figma file
  `kyUS7F8bg4x7GpcPEF4UDN` and adopt its variable names (`paper`→`bg`,
  `ink`→`text`, `ink2`/`ink3`→`textMuted`, `sunken`→`surface2`,
  `line`→`border`). DM Serif Display and DM Sans replace Newsreader and Hanken
  Grotesk. Radius is 6 everywhere; the Figma buttons are 5 and were normalized.
  Light and dark themes have identical token names. *Why:* the developer
  handoff makes Figma the appearance source, and the team chose a retheme over
  keeping the PDF look. *Outcome:* merged in #82 (first opened as #73).
- **Category taxonomy.** Handoff 04's seven categories. *Why:* adopt them now,
  while the backend has no Category model. *Outcome:* the spec enum is amended
  in `docs/design/`, and a null category still reads "Uncategorized" (US-8).
  Merged in #82.
- **Contrast.** Muted text is never placed on `surface2`, because that pair is
  4.28:1. *Outcome:* the `Badge` neutral tone and unselected segments use
  `text`. The contrast suite runs for both themes.
- **Handoffs 02 and 03.** Adopt 03 exactly: no Welcome screen, no Subscriptions
  or Insights tabs, and no Family tab route. Use React Native's built-in
  Animated rather than Reanimated; the only new native dependency is
  `@react-native-community/datetimepicker`. *Outcome:* stacked PRs #74 and #75,
  which landed on `main` in #83.
- **Deliberate deviations from 02**, also listed in `GalleryScreen.tsx`:
  borders use `borderControl` (WCAG 1.4.11); SectionHeader is 12px, not 11;
  unselected segments use `text`; the toast follows the Figma symbol;
  CurrencyField emits a decimal string, not minor units; DateField uses a fixed
  format until `date_format` exists.
- **Done 2026-10-19: device pass in Expo Go. Result: all passed.** Covered
  fonts before first paint, the gallery in both themes and the live light/dark
  flip, Reduce Motion, the largest text size (including the segmented → Select
  fallback), FAB → modal → X, the discard prompt, and deep links on cold start
  and from the background. Result reported by Hassan on 2026-10-20; no
  screenshots or device details were recorded.

## Links

[[Sprint Map]] · [[Repo State]] · spec section 15
