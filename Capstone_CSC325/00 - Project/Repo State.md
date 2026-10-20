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

Test counts below are copied from commit messages and PR descriptions, not re-run on
2026-10-20.

## One line per area

| Area | State |
| --- | --- |
| Backend | Sprint 0 spike merged (#68): MongoDB, custom user, JWT wiring, `/health/`, `/me/`. Time zone helpers with DST-safe local-to-UTC conversion for US-5 (#71). No story endpoints yet. |
| Mobile | Handoffs 01–03 merged: Figma tokens with light/dark (#82), component library with dev gallery and the 03 navigation tree (#83), AI-epic routes and 20pt header titles (#85). 370 tests at the time of the 03 PR. Screens are still placeholders. |
| CI | `mobile-ci` (`ff8cefd`, pushed without a PR) and `backend-ci` (#70) on `main`. Required-check status not re-checked since 2026-10-09; see [[Backend CI]]. |
| Protection | Ruleset `main-protection` as of 2026-10-09: PR + 1 approval, squash only, linear history, threads resolved. No CI gate then; not re-checked. |
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

As of 2026-10-09; not re-run for this snapshot.

**Backend — verified on GitHub's runners**, not just locally. Run `38009241217`:
ruff clean, no missing migrations, `schema.yml` current, 17 tests passed,
93.46% coverage against a 90% floor, no known vulnerabilities. Details in
[[Backend CI]].

**Mobile** — `tsc`, ESLint, Prettier, Jest (204 tests, re-counted 2026-10-09)
and a Metro export for both platforms. **Not** verified: layout, real contrast,
font scaling, SecureStore, keyboard behaviour — there is still no device or
simulator on the development machine. See [[Phase 0 — Mobile Scaffold]].

## Known gaps in the repo itself

Carried over from the 2026-10-09 snapshot and not re-checked, except where noted.

- **CI does not gate merges.** `main-protection` has no required status checks,
  so a pull request with a red `backend-verify` can still be merged. One
  ruleset change away from done — [[Backend CI]].
- **`ubuntu-latest` moved to Ubuntu 26 on 2026-10-19.** Both workflows were on
  it as of 2026-10-09. Check that they still pass, or pin on purpose.
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
