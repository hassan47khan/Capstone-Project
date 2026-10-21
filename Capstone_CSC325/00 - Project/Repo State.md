---
status: current
owner: Hassan
updated: 2026-10-20
---

# Repo State

Snapshot of the repository as of 2026-10-20, `main` at `9df066b` (#86). Written
so a sprint review does not have to be reconstructed from git log. This note is
rewritten rather than appended to, on `main` only, by whoever merged the last
PR; history is in git log and PR descriptions.

Test counts and the ruleset below were measured on 2026-10-20; each figure
names its source. Anything not re-measured says so.

## One line per area

| Area | State |
| --- | --- |
| Backend | Sprint 0 spike merged (#68): MongoDB, custom user, JWT wiring, `/health/`, `/me/`. Time zone helpers with DST-safe local-to-UTC conversion for US-5 (#71). No story endpoints yet. 26 tests, 94.41% coverage (`backend-ci` run `39512709670` on `9df066b`, 2026-10-20). |
| Mobile | Handoffs 01–03 merged: Figma tokens with light/dark (#82), component library with dev gallery and the 03 navigation tree (#83), AI-epic routes and 20pt header titles (#85). 419 Jest tests, all passing (run locally on `9df066b`, 2026-10-20). Screens are still placeholders. |
| CI | `mobile-ci` (`ff8cefd`, pushed without a PR) and `backend-ci` (#70) on `main`, both green on `9df066b` (2026-10-20). `verify` and `backend-verify` are required checks; see [[Backend CI]]. |
| Protection | Ruleset `main-protection`, read from the GitHub API on 2026-10-20: PR + 1 approval (stale approvals dismissed), squash only, linear history, threads resolved, and required status checks `verify` and `backend-verify`. `hassan47khan` has an `always` bypass. |
| Docs | Spec and design critique in `docs/design/`; Figma is the appearance source (#82). Developer handoffs `00`–`12` in `docs/handoff/` (#85). Root `CLAUDE.md` added in #85. |
| Vault | This vault is committed at `Capstone_CSC325/` and shared (`41ca1a2`–`80ffa05`). Since #86, root `CLAUDE.md` and `AGENTS.md` tell every AI to read it first; session logs in `04 - Logs/` are local-only and gitignored, and the merger of each PR updates this note. |
| Stories | Not re-counted. US-5 has backend helpers (#71); no story is finished end to end. |

## Layout

```
backend/     Django 6.1 + DRF on MongoDB
  config/    settings, urls, the ObjectId-keyed contrib app configs
  core/      health check, landing page
  accounts/  custom User, /me
  subscriptions/  Subscription with embedded sharing.participants
  mongo_migrations/  admin, auth, contenttypes migrations for Mongo
  schema.yml generated OpenAPI contract — CI fails if it drifts
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

**Backend — verified on GitHub's runners**, not just locally. Run `39512709670`
on `9df066b`, 2026-10-20: ruff clean, 26 tests passed, 94.41% coverage against a
90% floor, no known vulnerabilities. Details in [[Backend CI]].

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
- No `seed_demo` command. Specification section 13 asks for one; Sprint 3's AI
  work and every demo need it.
- Team roles (Scrum Master, Product Owner, slice owners) still unassigned in the
  README. Blocks several rows of [[Open Decisions]].
- Six stale remote branches (`infra/backend-ci-workflow`, `infra/backend-spike-ci`,
  `copilot/*`, `revert-62-*`, `fix/session-refresh-signout`) are merged or dead
  and can be deleted.
- The CI secret key is 20 bytes, so every backend run logs ten
  `InsecureKeyLengthWarning`s. Cosmetic, but it is log noise in the pipeline the
  team will be marked on.

## Links

[[Sprint Map]] · [[Open Decisions]] · [[Sprint 0 — Backend Spike]] · [[Backend CI]] · [[Phase 0 — Mobile Scaffold]]
