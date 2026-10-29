---
status: current
owner: Hassan
updated: 2026-10-29
---

# Repo State

Snapshot of the repository as of 2026-10-28, `main` at `294794a` (#136). Written
so a sprint review does not have to be reconstructed from git log. This note is
rewritten rather than appended to, on `main` only, by whoever merged the last
PR; history is in git log and PR descriptions.

This rewrite covers everything merged since the last one (#127, after #126):
#128, #125, #133, #134, #135 and #136. Both CI figures are from GitHub's runners
on `294794a`, 2026-10-28: `mobile-ci` run `40698905794`, `backend-ci` run
`40698905839`. They were not re-run locally. The ruleset was re-read from the
GitHub API on 2026-10-28. Each figure names its source.

**Update 2026-10-29 (Chris, after merging #141 and #142), `main` at `99d1b35`.**
This update covers only #141 and #142, plus #146, which joins the migrations
they each added. The backend figure below is from `backend-ci` run
`40799215800` on `99d1b35`, not re-run locally. Also merged since `294794a` and
not written up here yet: #137, #138, #139, #140, #121, #143 and #148; their
mergers update their parts, so rows and gaps that mention them may be stale.

## One line per area

| Area | State |
| --- | --- |
| Backend | Sprint 0 spike (#68): MongoDB, custom user, JWT wiring. Time zone helpers for US-5 (#71). Handoff `04` slice 1 (#90, Chris): the data model, the money engine in `subscriptions/services/`, `operations.py`, and the `seed_demo` and `convert_trials` commands. Slice 2 (#110, Chris): the API contract frozen as OpenAPI 3.1 in `schema.yml`. **Slice 3 (#125, Chris): auth, subscriptions and analytics are real**, scoped to the signed-in user and read from the database. That covers register with emailed verify links, login with lockout (5 failures in 10 minutes locks for 15) and per-IP/per-email rate limits, rotating refresh tokens revoked by `jti`, and a `tv` claim that a password reset bumps to end every session. Analytics are aggregation pipelines, and sums stay in the Decimal money engine. Transactions now use the backend's own `atomic`, so they really roll back. Only the `04 §6a` endpoints (extractions, trials, shared plans, Gmail) still answer from `backend/mocks.py`; they are Rafi's. #125 also added fields to the contract: `summary.converted`, cycle fields on upcoming and price-change items, `has_completed_first_run`, and `PATCH /me`. Follow-ups: #133 counts login failures atomically and adds a MongoDB TTL index so old rows expire; #134 stops a racing failure from shortening a lock; #135 serves the profile only at `/me`, no trailing slash. **#141 (Chris):** `POST /subscriptions` honours an optional `Idempotency-Key`, per user and kept 24 hours by a TTL index. A repeat with the same body gets the original 201, a different body is 409 `idempotency_key_reused`, and simultaneous duplicates retry and all get the winner's subscription (409 `idempotency_key_in_use` if they never settle). **#142 (Chris):** history has a `currency_change` event for any change of currency, carrying the old and new price and currency, so a `price_change` never crosses currencies. Total spent, run rate, spend over time and upcoming use the currency in effect on each date and convert each period separately; total spent is null if a period has no rate. #146 adds the empty merge migration `subscriptions/0004` for the two `0003`s. **889 tests, 98.58% coverage** (`backend-ci` run `40799215800` on `99d1b35`, 2026-10-29). Email goes to the console backend, and rate-limit counters are per process, until Celery and Redis arrive. |
| Mobile | **Expo SDK 58 (#136, Hassan):** Expo 58.0.20, React Native 0.88.0, React 19.3.0, Jest 30, Node `^22.13.0`. Handoffs 01–03: Figma tokens with light/dark (#82), the component library with its dev gallery and the 03 navigation tree (#83), AI-epic routes (#85). **Handoff 05 (#113, #119, Chris):** the auth shell, Log In, Create your account, the email-verify screens, the password reset flow, and Face ID / Touch ID unlock. **Handoff 06, Home (#118, Chris):** the dashboard from Figma `4:2901`, with per-section loading, error, empty and stale states; charts use `react-native-svg` directly. **Theme (#126, #128, Hassan):** the 05–07 size and motion tokens, and a four-step display scale: `display.lg` 32 (was 28; Home's hero), `md` 24, `title` 20 (the old `sm`, renamed), and a new `sm` 18 for section headers. `src/api` is still hand-written, not generated from `schema.yml`, so it lacks #125's new fields; #132 (open) generates it. Mocks are on by default (`.env.development`). **562 Jest tests in 19 suites, all passing; 91.58% statement coverage** (`mobile-ci` run `40698905794` on `294794a`, after a clean `npm ci` on Node 22.23.4). The other screens are still placeholders. |
| CI | `mobile-ci` (job `verify`) and `backend-ci` (jobs `backend-verify` and `backend-audit`). Both workflows green on `294794a` (runs above). **`backend-audit` fails on `main`** but is `continue-on-error` and not a required check; see the gaps below. #136 raised Jest's per-test timeout to 20s, because CI's Jest cache is always cold and the first test in each worker to load `Animated` took 6–7s on SDK 58. |
| Protection | Ruleset `main-protection`, re-read from the GitHub API on 2026-10-28 and unchanged: PR + 1 approval (stale approvals dismissed), squash only, linear history, threads resolved, no deletion or force-push, and required status checks `verify` and `backend-verify`. `hassan47khan` is the sole bypass actor, `bypass_mode: always`; see the gap below. |
| Docs | Spec and design critique in `docs/design/`; Figma is the appearance source (#82). Developer handoffs `00`–`12` in `docs/handoff/` (#85). #128 amended `01 §4` with the four-step display scale. Root `CLAUDE.md` records the Decimal128, contract, sessions, transactions, today and charts decisions and the backend commands; `04` belongs to Chris (#109). The README and `mobile/CLAUDE.md` say SDK 58 (#136). |
| Vault | This vault is committed at `Capstone_CSC325/` and shared. Since #86, root `CLAUDE.md` and `AGENTS.md` tell every AI to read it first. Session logs in `04 - Logs/` are local-only and gitignored, and whoever merges a PR updates this note. |
| Stories | Not re-counted. Slice 3 gives US-1/US-2 (auth) a real backend, and Home reads real analytics when mocks are off. No story has been verified end to end against the real API on a device. |

## Layout

```
backend/     Django 6.1 + DRF on MongoDB
  config/    settings, urls, the ObjectId-keyed contrib app configs
  core/      health check, landing page, contract.py (error envelope, money fields), clock.py (today_for)
  accounts/  custom User, /me, auth (register, verify, login, refresh, reset), UserSettings, time zone helpers
  subscriptions/  data model (04 §1), seed.py, operations.py, analytics pipelines, management commands
    services/  money engine: cycles, money, trials, validation (plain Python)
  mongo_migrations/  admin, auth, contenttypes migrations for Mongo
  mocks.py   the 04 §6a endpoints only (extractions, trials, shared plans, Gmail)
  schema.yml generated OpenAPI 3.1 contract; CI fails if it drifts
mobile/      Expo SDK 58 (RN 0.88), TypeScript strict, React Navigation 7, TanStack Query
docs/design/ specification, design notes, retired prototype PDF
docs/handoff/  developer handoff specs 00–12 (outrank Figma)
Capstone_CSC325/  this Obsidian vault, shared team notes
docker-compose.yml  single-node Mongo replica set, used locally and by CI
.github/workflows/  mobile-ci.yml, backend-ci.yml
CLAUDE.md    root rules for every AI session
AGENTS.md    same rules for Codex, Copilot and Cursor; points to CLAUDE.md
```

## What is actually verified

**Backend — on GitHub's runners**, run `40698905839` on `294794a`, 2026-10-28:
841 tests passed, 98.60% coverage against a 90% floor. Ruff, `makemigrations
--check` and `spectacular --validate` were clean on #133–#135's branches,
per those PRs. #125 also reports a manual pass after `seed_demo`: logged in and
read the real endpoints at SEED_TODAY, getting $129.20, the 43/31/16/5/3/2
split, Netflix total $433.69, EUR €118.56 and the Hulu and Netflix alerts.
Details in [[Backend CI]].

**Mobile — on GitHub's runners**, run `40698905794` on `294794a`, 2026-10-28:
`npm ci`, ESLint, Prettier, `tsc` and `jest --coverage --ci`, 562 tests
passing. Before merging, #136 replayed that job in a clean copy under npm
10.9.9 with a cold cache, and ran `npx expo export -p android`.

**Device:** an Android emulator pass on SDK 58, 2026-10-27, before #136 merged
(Expo Go 58.0.5, `Pixel_10_Pro`, Android 17, mocks on). Log In rendered and
showed its incorrect-password state. Logging in as `alex@subtrak.test` reached
Home with the seed figures. The Settings tab and the FAB's Add subscription
modal opened, with no JS warnings or errors. The earlier Expo Go pass for
handoffs 01–03 (2026-10-19, reported by Hassan; checklist in [[Open Decisions]])
covered themes, Reduce Motion, the largest text size, the modal flow and deep
links. **Not** verified: iOS on SDK 58; any real device on SDK 58; biometric
unlock (see below); the app against the real backend; on-device contrast,
SecureStore and keyboard behaviour.

## Known gaps in the repo itself

Re-checked against `main` at `294794a` on 2026-10-28 unless noted.

- **`backend-audit` fails on `main`.** `pip-audit` reports CVE-2026-106435 in
  `pymongo` 4.18.2 (fixed in 4.18.3) and CVE-2026-114605 in `dnspython` 2.8.0
  (fixed in 2.9.0), both pinned in `backend/requirements.txt`. They were
  published after #135's green run, not caused by #136. Backend is Chris's.
  Mobile has its own `npm audit`: 18 vulnerabilities (14 low, 4 high), reported
  by #136's install and not triaged.
- **Biometric unlock cannot be reached from the UI.** It only appears after a
  Log Out that parks the refresh token (`signOut({ park: true })`), and no
  screen calls that yet. Log Out belongs in Settings (09), which is a
  placeholder, so #119's Face ID flow has never run in the app. Found
  2026-10-27 during #136's emulator pass.
- **The mobile client is behind the contract.** `src/api` is hand-written and
  lacks #125's `summary.converted`, the cycle fields and `PATCH /me`. #132
  (open) generates it from `schema.yml`. Until then Home still infers
  conversion from upcoming bills' currencies, which misses subscriptions with
  no bill in the next 30 days (#118).
- **`mobile-ci` uses `actions/*@v4`.** GitHub now forces those onto Node 24
  and warns that their Node 20 runtime is deprecated. `backend-ci` is already
  on v7. Seen in run `40698905794`.
- **Three merged components still draw off-spec.** #126 added the tokens but
  changed no consumer, because the screens belong to Chris. Until he swaps
  each stand-in and deletes its `TODO(tokens)` marker: `AuthShell`'s nav bar
  is 56 where 05 §10 says 64 and its brand mark 28 where it says 30;
  `StatusIcon`'s glyph is 48 where 05 §4 says 34, and enters over 300ms where
  05 §10 says 400; `CategoryDonut`'s ring is 88 with a 12 stroke where
  06 §2.3 says 90 and 14, and sweeps over 350ms where 06 §7 says 600. The
  34px glyph drawn at 48 and the half-speed sweep are visible on a device.
- **One `TODO(tokens)` comment is stale.** Since #128, `displaySm` is 18/24,
  so Home's section titles already render what 06 asks for, but
  `HomeSections.tsx:416` still says "displaySm (20/28) is the nearest". The
  one-line deletion is Chris's. #128's tracking value for 18 (-0.25) was
  interpolated, not measured; confirm it against Figma.
- **Root `CLAUDE.md` contradicts the ruleset on direct commits.** It says
  `main` "cannot take a direct commit", but `hassan47khan` holds an `always`
  bypass on `main-protection`. Either drop that bypass so the sentence is
  true, or describe it as an emergency bypass and say when it may be used.
  Raised 2026-10-23, still open.
- **`ubuntu-latest` is not pinned** in either workflow. Not re-checked which
  image the runs got. Pin on purpose, or expect the Ubuntu 26 switch.
- **41 remote branches**, most of them merged feature branches and past
  Repo State branches. They can be deleted.
- Carried over, not re-checked: Scrum Master and Product Owner are still
  unassigned in the README, which blocks several rows of [[Open Decisions]];
  the CI secret key is 20 bytes, so backend runs log `InsecureKeyLengthWarning`s;
  the per-IP auth throttle keys on `REMOTE_ADDR`, so behind a proxy it needs the
  real client address (#133); revoked `jti` rows have `expires_at` but no TTL
  index or cleanup job yet (#125, #133); endpoints the screens need but the
  contract lacks: categories, the service catalog, `/me/settings`, notification
  rules, Gmail status, cancel-guide content and `/analytics/insight` (#110).

## Links

[[Sprint Map]] · [[Open Decisions]] · [[Sprint 0 — Backend Spike]] · [[Backend CI]] · [[Phase 0 — Mobile Scaffold]]
