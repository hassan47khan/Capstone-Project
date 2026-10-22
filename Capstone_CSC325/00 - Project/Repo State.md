---
status: current
owner: Hassan
updated: 2026-10-22
---

# Repo State

Snapshot of the repository as of 2026-10-22, `main` at `999bd29` (#109, after #110). Written
so a sprint review does not have to be reconstructed from git log. This note is
rewritten rather than appended to, on `main` only, by whoever merged the last
PR; history is in git log and PR descriptions.

Backend figures were re-measured on 2026-10-22 for #110. Mobile figures and the
ruleset are from 2026-10-20 and were not re-measured, since #90, #110 and #109
touched only `backend/`, docs and the vault. Each figure names its source.

## One line per area

| Area | State |
| --- | --- |
| Backend | Sprint 0 spike (#68): MongoDB, custom user, JWT wiring, `/health/`, `/me/`. Time zone helpers for US-5 (#71). Handoff `04` slice 1 (#90, Chris): the full data model with migrations, the money engine in `subscriptions/services/`, `operations.py`, and the `seed_demo` and `convert_trials` commands. Every money test in `04 §6` and `§6a` passes. Handoff `04` slice 2 (#110, Chris): the API contract is frozen. All 34 `04 §5` and `§6a` operations exist under `/api/v1/` with final shapes, and `schema.yml` is OpenAPI 3.1. **Every story endpoint still answers from `backend/mocks.py`** (Alex at `SEED_TODAY`, figures computed by the money engine); real logic, auth and rate limits come in slice 3. 783 tests, 98.65% coverage (`backend-ci` run `39837686157` on `9883c5d`, #110's head, 2026-10-22). |
| Mobile | The TS client in `src/api` has not yet been regenerated from the #110 schema; `mobile/src/api/types.ts` is still hand-written and does not match it. Handoffs 01–03 merged: Figma tokens with light/dark (#82), component library with dev gallery and the 03 navigation tree (#83), AI-epic routes and 20pt header titles (#85). 419 Jest tests, all passing (run locally on `9df066b`, 2026-10-20). Screens are still placeholders. |
| CI | `mobile-ci` (`ff8cefd`, pushed without a PR) and `backend-ci` (#70) on `main`. `backend-ci` was green on #110's head (2026-10-22); `mobile-ci` was last checked green on `9df066b` (2026-10-20). `verify` and `backend-verify` are required checks; see [[Backend CI]]. |
| Protection | Ruleset `main-protection`, read from the GitHub API on 2026-10-20: PR + 1 approval (stale approvals dismissed), squash only, linear history, threads resolved, and required status checks `verify` and `backend-verify`. `hassan47khan` has an `always` bypass. |
| Docs | Spec and design critique in `docs/design/`; Figma is the appearance source (#82). Developer handoffs `00`–`12` in `docs/handoff/` (#85). Root `CLAUDE.md` added in #85; since #90 it records the Decimal128 storage decision and the backend commands. #109 marked `00`–`03` done, corrected three figures in `04`, and moved `04` to Chris (ownership in root `CLAUDE.md` and `12 §1`). |
| Vault | This vault is committed at `Capstone_CSC325/` and shared (`41ca1a2`–`80ffa05`). Since #86, root `CLAUDE.md` and `AGENTS.md` tell every AI to read it first; session logs in `04 - Logs/` are local-only and gitignored, and the merger of each PR updates this note. |
| Stories | Not re-counted. US-5 has backend helpers (#71); no story is finished end to end. |

## Layout

```
backend/     Django 6.1 + DRF on MongoDB
  config/    settings, urls, the ObjectId-keyed contrib app configs
  core/      health check, landing page, contract.py (error envelope, money fields)
  accounts/  custom User, /me, UserSettings, NotificationRule, time zone helpers
  subscriptions/  data model (04 §1), seed.py, operations.py, management commands
    services/  money engine: cycles, money, trials, validation (plain Python)
  mongo_migrations/  admin, auth, contenttypes migrations for Mongo
  mocks.py   the mock behind every story endpoint until 04 slice 3
  schema.yml generated OpenAPI 3.1 contract, frozen in #110; CI fails if it drifts
mobile/      Expo SDK 57, TypeScript strict, React Navigation, TanStack Query
docs/design/ specification, design notes, retired prototype PDF
docs/handoff/  developer handoff specs 00–12 (outrank Figma)
Capstone_CSC325/  this Obsidian vault, shared team notes
docker-compose.yml  single-node Mongo replica set, used locally and by CI
.github/workflows/  mobile-ci.yml, backend-ci.yml
CLAUDE.md    root rules for every AI session
AGENTS.md    same rules for Codex, Copilot and Cursor; points to CLAUDE.md
```

## What is actually verified

**Backend — verified on GitHub's runners**, not just locally. Run `39837686157`
on `9883c5d` (#110's head), 2026-10-22: ruff and formatting clean, no missing
migrations, `schema.yml` current, 783 tests passed, 98.65% coverage against a
90% floor, and `backend-audit` found no known vulnerabilities. The money figures
in `04 §6` (Alex $129.20, EUR €118.56 and the rest) are asserted against the
pure engine, from the seeded database, and through every API response; contract
tests fail on any field `schema.yml` does not document. Details in
[[Backend CI]].

**Mobile** — Jest, 419 tests in 12 suites, all passing (run locally on
`9df066b`, 2026-10-20). `tsc`, ESLint, Prettier and the Metro export were not
re-run locally for this snapshot; `verify` runs the first three in CI and was
green on `9df066b`. The Expo Go device pass for handoffs 01–03 passed on
2026-10-19 (reported by Hassan; checklist in [[Open Decisions]]): themes, Reduce
Motion, the largest text size, the modal flow and deep links. **Not** verified:
measured on-device contrast, SecureStore, keyboard behaviour. See
[[Phase 0 — Mobile Scaffold]].

## Known gaps in the repo itself

Carried over from the 2026-10-09 snapshot and not re-checked, except where noted.

- **`ubuntu-latest` is not pinned.** GitHub announced the move to Ubuntu 26 for
  2026-10-19, but the `backend-ci` run on `9df066b` (2026-10-20) still got
  `ubuntu-24.04`. The switch may still arrive; pin on purpose or expect it.
- Scrum Master and Product Owner still unassigned in the README; slice owners
  were settled in #109. Blocks several rows of [[Open Decisions]].
- Six stale remote branches (`infra/backend-ci-workflow`, `infra/backend-spike-ci`,
  `copilot/*`, `revert-62-*`, `fix/session-refresh-signout`) are merged or dead
  and can be deleted.
- The CI secret key is 20 bytes, so every backend run logs ten
  `InsecureKeyLengthWarning`s. Cosmetic, but it is log noise in the pipeline the
  team will be marked on.
- **MongoDB transactions are off.** Against the single-node replica set the
  backend reports `supports_transactions = False`, so `transaction.atomic()` in
  `subscriptions/operations.py` rolls nothing back. Found on 2026-10-22 while
  building `04` slice 2; to be fixed in slice 3.
- **Endpoints the screens need are not in the contract yet:** categories, the
  service catalog, `/me/settings`, notification rules, Gmail status,
  cancel-guide content and `/analytics/insight` (listed in #110).

## Links

[[Sprint Map]] · [[Open Decisions]] · [[Sprint 0 — Backend Spike]] · [[Backend CI]] · [[Phase 0 — Mobile Scaffold]]
