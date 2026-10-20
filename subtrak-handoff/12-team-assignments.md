# 12 — Team Assignments & Claude Code Playbook

**Audience:** Hassan, Chris, Ankit, Rafi. Read §1–§4 together, then your own section.
**Source of truth order:** the spec files (`01`–`11`) > Figma > screenshots. If they
disagree, follow the spec — every disagreement is already explained in the spec.

---

## 1. Who owns what

| Person | Files | Screens | Backend |
|---|---|---|---|
| **Hassan** | `00`, `01`, `02`, `04` | none (gallery only) | **All of `04`:** models, money engine, seed, auth / subscription / analytics endpoints, OpenAPI + TS client |
| **Chris** | `03`, `05`, `06` | Navigation shell · 8 auth screens · first-run · Home | none — consumes Hassan's API |
| **Ankit** | `07`, `08`, `09` | Add / Detail / Edit / History / Delete · Analytics · Settings, Currency, Confirm, Timezone, Notifications, Profile | none — consumes Hassan's API |
| **Rafi** | `10`, `11` | AI epic (ConnectEmail, ReviewExtraction, TrialShield, SharedPlans) · Calendar · system states · Family (stretch) | **`04 §6a`:** extraction pipeline, Gmail OAuth, trials, shared plans, eval harness |

Phase order from `00` still applies: 0 → 1 → 2 → 3 is the minimum demo.
Phase 6 (AI) is the graded requirement; Family (`10`) is cut first.

---

## 2. Risks in this split — read before starting

1. **Hassan is on the critical path for everyone.** `01`, `02` and the whole backend
   gate every other file. Mitigation: land things in this order and announce each:
   1. `01` tokens + fonts + theme provider (same day).
   2. **API contract freeze:** the OpenAPI schema and generated TS client with
      mocked responses from the canonical dataset, *before* the endpoints work.
      Chris, Ankit and Rafi build against the mock.
   3. `02` batch A (below), then batch B.
   4. Real endpoints behind the same contract.
2. **Chris's `03` needs Hassan's `01` and the TabBar from `02`.** `03` is "skeleton
   with placeholders" — Chris can start with plain React Navigation / expo-router
   routes once `01` lands, and swap in `TabBar` when `02` batch A merges.
3. **Rafi holds the graded requirement and a stretch goal.** Do AI first (`11 §2`),
   Calendar second (`11 §1`), the system-state verification pass (`11 §3`) at the
   end, Family (`10`) only if everything else is green. The shared state components
   (Skeleton, EmptyState, Toast, ErrorBoundary) are built by Hassan in `02`, so
   `11 §3` is a verification pass over everyone's screens, not new components.
4. **Cross-person seams** (agree these in the first stand-up):

| Seam | Producer | Consumer | Contract |
|---|---|---|---|
| Tokens, components | Hassan | everyone | `src/theme`, `src/components`; no one edits these without Hassan's review |
| Route tree | Chris | everyone | `03 §1`; others register screens by adding a file, not by editing the navigator |
| API client | Hassan | everyone | generated TS client; no `fetch()` in screens |
| Settings rows for Shared plans / Connected email | Ankit builds the rows | Rafi builds the destinations | route names `SharedPlans`, `ConnectEmail`; stubs until Rafi merges |
| Trial AlertCard on Home | Chris builds the card | Rafi supplies `GET /trials` and TrialShield | `06 §2.4`, `11 §2.5`; hidden until the endpoint exists |
| Analytics AI-insight card | Ankit renders it | Rafi supplies `GET /analytics/insight` (grounded text) | `08 §2.0`; hide the card until it exists |
| Trial exclusion from totals | Hassan | Rafi, Ankit, Chris | `04 §6a`; totals never include active trials |
| Family currency / settings | Ankit (`09`) | Rafi (`10`) | `10` reuses `SelectCurrency`, `NotificationRules` |

5. **One Figma source.** Use the newer file `IKYivyJtmBYzJNQ7g8qPGc` for every
   screen **except Home**, whose frame (`4:2901`) exists only in the original
   `kyUS7F8bg4x7GpcPEF4UDN`. Ask the designer to copy `4:2901` into the newer file.
   The stale frames `113:641` and `113:765` must not be built.

---

## 3. Repo conventions

```
docs/handoff/          the 13 files in this folder (read-only; changes go through Hassan)
CLAUDE.md              short: stack, commands, the 6 rules from 00, folder ownership
mobile/src/theme/            (Hassan)
mobile/src/components/       (Hassan)
mobile/src/navigation/       (Chris)
mobile/src/screens/auth|home                     (Chris)
mobile/src/screens/subscriptions|analytics|settings   (Ankit)
mobile/src/screens/ai|calendar|family            (Rafi)
mobile/src/api/              generated client (Hassan)
backend/                     Hassan (04) · Rafi (04 §6a, in apps/ai, apps/sharing)
```

- Branches: `feat/<epic>-<screen>` (for example `feat/home-spend-card`). One PR per
  screen or per backend slice; merge to `main` only when its DoD boxes are ticked.
- A PR that adds a hardcoded color, size or total fails review (`00` rules 1, 2, 6).
- **Decisions needing sign-off** (list in `00`) are not re-litigated in PRs. If you
  disagree, raise it with Hassan, change the spec file, then change the code.

---

## 4. The Claude Code prompt template

Start a **fresh Claude Code session per screen**. Paste, fill the brackets:

```
Read CLAUDE.md, docs/handoff/00-README.md, docs/handoff/[FILE], and every
prerequisite file it lists (only to the extent the screen needs them).

Task: implement [SCREEN] — spec section [§X].
Owned folders: [FOLDERS]. Do not edit anything outside them; if you need a change
in theme/ or components/, stop and tell me what and why.

Design: Figma fileKey [KEY], node [NODE]. Use the Figma MCP (get_screenshot, then
get_design_context with the figma-design-to-code skill). The returned code is a
reference only: translate it to React Native and use tokens from src/theme and
components from src/components. No hardcoded colors, sizes or totals.

Before writing code:
1. Plan mode. List the spec's Decisions / Departures that apply to this screen and
   any place the spec and the Figma disagree. Follow the spec.
2. List every state (loading, empty, error, offline) the spec requires.
3. List the API endpoints used and confirm they exist in the generated client.

Build the screen, all states, and the tests the spec asks for. Then verify: type-
check, lint, tests, run it in the simulator, compare against the Figma screenshot,
and tick the DoD items for this screen. Report mismatches you found in out-of-scope
areas instead of fixing them.
```

For backend slices, replace the Design paragraph with the endpoint list and "write
the failing tests from `04 §6` first".

---

# Hassan — `00`, `01`, `02`, `04`

**Your order**

| Step | Work | Spec | Done when |
|---|---|---|---|
| 1 | Verify `django-mongodb-backend` ↔ Django version match; repo, CLAUDE.md, `docs/handoff/` | `04` preamble, `00` | Backend boots and connects to Atlas |
| 2 | Tokens, fonts (DM Serif Display, DM Sans), theme provider light + dark | `01` | `01` DoD ticked; contrast report committed |
| 3 | **Contract freeze:** models, serializers, OpenAPI, TS client, mock server from the canonical dataset | `04 §1, §5` | Others can build against mocks |
| 4 | Component batch A — Button, TextField, Toggle, Card, ListRow, SettingsRow, ScreenHeader, TabBar, Toast, EmptyState, Skeleton | `02 §1–15` | Gallery screen shows every variant |
| 5 | Money engine + seed + the required tests | `04 §3, §4, §6` | Every assertion in §6 passes; Alex = **$129.20** |
| 6 | Component batch B — CurrencyField, SegmentedControl, Select, DateField, BottomSheet, Stepper, FilterChip, SearchField, Badge, AlertCard, ServiceMark, ErrorBoundary | `02 §3–21` | Same |
| 7 | Real endpoints behind the frozen contract; trial exclusion + `split_shares` | `04 §5, §6a` | CI drift check green |
| 8 | Keep `00` coverage table and decisions list current; run the cross-person integration check | `00` | — |

**Screens in the Figma for your components** (nodes in the newer file): list row
`3:1686`, settings row `3:1819`, tab bar `21:52`, bottom sheets `3:1956` and
`4:4330`, alert card `4:2968` (original file), AI-epic chips and progress bars
`110:432`, `110:186`.

**Prompts**

1. *Tokens:* template, FILE `01`, "implement the whole file", no Figma step needed.
   Add: "Output a contrast table for every text/background pair; fail the task if
   any body-text pair is under 4.5:1."
2. *Component batch:* template per component, FILE `02`, SCREEN "the {X} component
   with every variant and state", plus "add it to the dev gallery and write a
   snapshot test for each variant". Do 3–4 components per session.
3. *Backend:* "Write the failing tests from `04 §6` first, then models, then the
   money engine, then the seed command. Money is Decimal end to end; no float
   anywhere. Assert Alex = $129.20, Jordan = $45.98, Sam = $22.98, Family =
   $198.16, EUR = €118.56 at 0.9177."
4. *Contract:* "Generate OpenAPI with drf-spectacular and a committed TS client.
   Add an npm script to regenerate and a CI step that fails on drift. Serve a mock
   of every endpoint from the seed data."

**Watch-outs:** Delete is a **soft delete** with `POST /restore` (fixed in this
pass; an earlier draft said hard delete). Active trials are excluded from totals
(`04 §6a`). Adobe's price in the Analytics frame ($59.99) disagrees with the
dataset ($54.99) — ask the designer before changing the fixture.

---

# Chris — `03`, `05`, `06`

**Order:** `03` (after Hassan's step 2) → `05` → `06`. `05` needs the auth endpoints
from `04 §5`; develop against the mock first.

| Screen | Figma node (newer file) | Spec |
|---|---|---|
| Navigation skeleton, tab bar, FAB, auth gate, deep links | tab bar `21:52` | `03` |
| Login | `3:1115` | `05 §5` |
| Register | `3:1029` | `05 §3` (single password field, **no** 5-rule checklist) |
| VerifyEmailSent | `3:1076` | `05 §4` (resend cooldown countdown) |
| EmailConfirmed | `3:1097` | `05` (deep link `subtrak://verify-email`) |
| ForgotPassword | `3:1142` | `05` |
| ResetLinkSent | `3:1161` | `05 §4` |
| CreateNewPassword | `3:1182` | `05` (deep link) |
| PasswordResetSuccess | `3:1220` | `05` |
| First-run EmptyState (no frame) | — | `05 §6` (second CTA appears with the AI epic) |
| Home | **`4:2901` in the ORIGINAL file `kyUS7F8bg4x7GpcPEF4UDN`** | `06` |
| Home — EUR state | `3:2007` (same screen, different currency) | `06 §1` |

**Do not build:** `3:959` landing, `3:1308` welcome tour, `3:1237` paywall, `3:1591`
admin login (`05 §7`).

**Prompts**

1. *Navigation:* template, FILE `03`, SCREEN "the whole navigation tree with
   placeholder screens", "no screen content", "use the TabBar from src/components;
   it must be one instance".
2. *Auth (one session per screen, or two screens that share a layout):* template,
   FILE `05`. Add: "Tokens in `expo-secure-store`, never AsyncStorage. Test the
   five cold-start auth-gate cases in `03 §5` and both deep links, cold and
   backgrounded."
3. *Home:* "Build `06 §2.1`–`§2.5` as separate components (SpendCard, CategoryCard,
   UrgentAttention, RenewalsList) wired to `/analytics/summary` and
   `/analytics/price-changes?since=-30d&include_upcoming=true`. Never sum
   anything on the client. Hide Urgent attention when empty."

**Watch-outs:** the stale Home draft `113:641` in the newer file is **not** the
design. Home's total must equal **$129.20** with seed data. The trial AlertCard
(`06 §2.4`) is hidden until Rafi's `GET /trials` exists. Show "Add subscription"
only through the FAB.

---

# Ankit — `07`, `08`, `09`

**Order:** `07` (core loop, highest priority) → `09` → `08`. `08` shares the chart
contract with Chris's Home (`08 §3`) — agree one chart library on day one.

| Screen | Figma node (newer file) | Spec |
|---|---|---|
| AddSubscription — empty / filled / error / success | `4:3340` / `4:3417` / `4:3509` / `4:3587` | `07 §1–3` |
| SubscriptionDetail | `4:3246` | `07 §4` |
| EditSubscription | `4:4189` | `07 §5` |
| EditHistory | `4:4271` | `07 §6` |
| Delete confirmation (BottomSheet + Undo toast) | `4:4330` | `07 §7` (soft delete) |
| Analytics | `4:3036` | `08` |
| Settings root | `3:1778` | `09 §1` |
| SelectCurrency | `3:1878` | `09 §2` |
| ConfirmCurrencyChange | `3:1956` | `09 §3` |
| SelectTimeZone | `3:2131` | `09 §4` |
| NotificationRules | `3:2210` | `09 §5` |
| ProfileAccount | `3:2734` | `09 §6` |

**Prompts**

1. *Add / Edit:* template, FILE `07`. Add: "Price is a Decimal string; never a
   float. Category and date are required. After save, the Home total must change —
   write the e2e test from `11 §3.6`'s smoke list."
2. *Delete:* "Soft delete, 6-second Undo toast calling `POST /restore`; the total
   drops by exactly the normalized amount and Undo restores it."
3. *Analytics:* "Insight first, list last (`08 §1`). Drop the header Add button.
   Bars are proportional to the largest category. Use the same chart library and
   colors as Home. Render the AI-insight card only when `GET /analytics/insight`
   returns text (`08 §2.0`)."
4. *Settings group:* "Remove the 'Regular User Account' subtitle and the inline
   toggles; Notifications is one row. Currency confirm shows real before/after
   totals from the money engine. The theme control on Profile must drive the real
   themes. Cut Import and 2FA."

**Watch-outs:** Delete and Analytics copy changed from the prototype — read the
Departures tables first. The Analytics frame still shows $98.47 and Adobe $59.99;
both are wrong against the dataset (`08 §2.0`). Settings needs rows for
**Shared plans** and **Connected email** that open Rafi's screens (stub them).

---

# Rafi — `10`, `11`

**Order:** AI first. Calendar second. States pass third. Family only if all else is
green — it is the largest backend surface and is not graded (`10` preamble).

### AI epic — `11 §2` (graded)

| Step | Work | Notes |
|---|---|---|
| 1 | **Write the decision doc:** input path (Gmail OAuth, Testing mode, per `11 §2.1`), extraction schema, retention window, eval plan; put it in `CLAUDE.md` | Before any code |
| 2 | Fixture set: ≥ 20 labeled emails, including Hulu's exact wording from the frame | Pure Python, no UI |
| 3 | Extraction pipeline + schema validation + grounding + computed confidence; eval harness in CI with a per-field accuracy and calibration report | `04 §6a` conventions |
| 4 | Backend: `PendingExtraction`, `/extractions/*`, `/trials`, `/shared-plans`, Gmail connect/disconnect | Follow Hassan's frozen OpenAPI shapes |
| 5 | Screens (below) | |
| 6 | Generated-text numeric-grounding test; `GET /analytics/insight` for Ankit | `11 §2.7` |

| Screen | Figma node (newer file) | Spec |
|---|---|---|
| ConnectEmail | `110:14` | `11 §2.3` |
| ConnectEmail — failed | `110:496` | `11 §2.3` |
| ReviewExtraction | `110:125` | `11 §2.4` |
| ReviewExtraction — low confidence | `110:432` | `11 §2.4` |
| TrialShield | `110:186` | `11 §2.5` |
| SharedPlans | `110:266` | `11 §2.6` |

**Do not build:** `113:641` "2 - Dashboard", `113:765` "1b - Connect Email (failed)".
**Not designed — you decide, using `11 §2.8`:** scanning/progress, nothing found,
several results, "New shared plan", Cancel guide content.

### Calendar — `11 §1` (no Figma frame)

Build to the layout table in `11 §1`. Reuse `ListRow`. Data from
`/analytics/upcoming` extended to a date range.

### System states — `11 §3`

A verification pass after everyone's screens exist: every list has all three empty
types, every screen has loading / error / offline, both themes checked, and the
smoke test from `11 §3.6` runs green.

### Family — `10` (stretch)

| Screen | Figma node | Spec |
|---|---|---|
| Admin dashboard | `3:2291` (unverified) | `10 §3.1` |
| Admin settings | `3:2375` (unverified) | `10 §3.2` |
| Family members | `3:2463` | `10 §3.3` |
| Member detail | `3:2537` | `10 §3.4` |
| Family currency & billing | `3:2645` (unverified) | `10 §3.7` |
| Invite, Remove confirm | not designed | `10 §3.5–3.6` |

**Prompts**

1. *Decision doc:* "Write `docs/ai-decision.md` covering input path, extraction
   JSON schema, grounding rule, confidence computation, retention, and the eval
   plan. Do not write implementation code."
2. *Pipeline:* "Fixtures and the eval harness first. The pipeline must reject any
   extracted value that does not appear in the email. Output a per-field accuracy
   table and a confidence-calibration table. Never auto-create a subscription."
3. *Review screen:* template, FILE `11`, SCREEN `ReviewExtraction`, "flagged fields
   must be resolved before the primary enables; one label, 'Confirm and track'".
4. *Shared plans:* "`split_shares` property test first (shares sum to the price
   exactly), then the screen. Shared plans never change totals."

**Watch-outs:** danger red appears on **no** AI screen except the connect-error
card. The frame's amber/orange colors fail AA — use the `warning` tokens. The
Contract-alert card on SharedPlans is cut.

---

## 5. Daily rhythm that keeps Claude Code on the rails

- One screen per session; start with plan mode; end with the DoD checklist.
- If Claude proposes a new color, size or component: stop, ask Hassan.
- If Claude wants to compute a total on the client: the answer is always no — add
  the field to the API instead.
- Commit the contrast report and the test output with each PR that touches visuals
  or money.
