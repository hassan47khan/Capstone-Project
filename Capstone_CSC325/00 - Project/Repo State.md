---
status: current
owner: Hassan
updated: 2026-10-09
---

# Repo State

Snapshot of the repository as of 2026-10-09, `main` at `9e392be`. Written so a
sprint review does not have to be reconstructed from git log. This note is
rewritten rather than appended to — see [[2026-10-09]] for the history.

## One line per area

| Area | State |
| --- | --- |
| Backend | Sprint 0 spike merged (PR #68). MongoDB, custom user, JWT wiring, `/health/`, `/me/`. 17 tests, 93.46% coverage, confirmed by CI. No story endpoints. |
| Mobile | Phase 0 merged. Scaffold, theme, 20 primitives, API layer, mocks, session, navigation. 204 tests. Every screen is a `Placeholder`. |
| CI | **Both workflows now on `main` and green.** `mobile-ci` and `backend-ci` (PR #70). Not yet required checks — see [[Backend CI]]. |
| Protection | Ruleset `main-protection` active: PR + 1 approval, squash only, linear history, threads resolved. No CI gate. |
| Docs | Specification and prototype done, in `docs/design/`. Design critique in `docs/design/README.md`. |
| In flight (2026-10-19, not on `main`) | Three stacked PRs, CI green on each, merge in order: **#73** Figma tokens + light/dark (269 tests) → **#74** component library + dev gallery (337) → **#75** navigation skeleton per handoff 03 (370). See [[2026-10-19]]. `main` itself has since moved to `6e5c014` (#71 time zone helpers, #72 README); this snapshot does not cover those. |
| Stories | 0 of 19 finished. Sprint 0 was infrastructure only. |

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
docs/design/ specification, prototype PDF, design notes
docker-compose.yml  single-node Mongo replica set, used locally and by CI
.github/workflows/  mobile-ci.yml, backend-ci.yml
```

## What is actually verified

**Backend — verified on GitHub's runners**, not just locally. Run `38009241217`:
ruff clean, no missing migrations, `schema.yml` current, 17 tests passed,
93.46% coverage against a 90% floor, no known vulnerabilities. Details in
[[Backend CI]].

**Mobile** — `tsc`, ESLint, Prettier, Jest (204 tests, re-counted 2026-10-09)
and a Metro export for both platforms. **Not** verified: layout, real contrast,
font scaling, SecureStore, keyboard behaviour — there is still no device or
simulator on the development machine. See [[Phase 0 — Mobile Scaffold]].

## Known gaps in the repo itself

- **CI does not gate merges.** `main-protection` has no required status checks,
  so a pull request with a red `backend-verify` can still be merged. One
  ruleset change away from done — [[Backend CI]].
- **`ubuntu-latest` migrates to Ubuntu 26 on 2026-10-19.** Both workflows are
  on it and carry GitHub's annotation. Pin or migrate on purpose.
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
