# SubTrak — CLAUDE.md (starter; keep this short)

**What:** mobile subscription tracker. Expo (React Native, TypeScript strict) + Django/DRF + MongoDB Atlas.
**Specs:** the file(s) for your task live in `docs/handoff/` (numbered `01`–`12`; only the ones assigned to you are present). Read your file plus the prerequisites it lists. If a spec points at a file that is not in `docs/handoff/`, stop and say so instead of guessing. Spec > Figma > screenshots.

## Team notes (Obsidian vault): read first, update last
- **Before starting:** read `Capstone_CSC325/SubTrak.md`, then `Capstone_CSC325/00 - Project/Repo State.md`, then your newest local log in `Capstone_CSC325/04 - Logs/` if one exists.
- **Before finishing:** write a session log to `Capstone_CSC325/04 - Logs/`, named by date and branch slug, e.g. `2026-10-21 hassan-feature-x.md` (template: `Capstone_CSC325/99 - Templates/Log Entry.md`). Logs are gitignored and local-only; never commit them. Do not name logs by person and day, because one person can run several sessions on different branches.
- **Repo State:** never edit `Capstone_CSC325/00 - Project/Repo State.md` on a feature branch. It describes only what is on `main`; unmerged work goes in the PR description. Whoever merges a PR updates Repo State right after the merge, in a small follow-up PR to `main` (`main` is protected, so it cannot take a direct commit). Conventions: `Capstone_CSC325/CLAUDE.md`.
- Specs, README and `mobile/CLAUDE.md` outrank the vault. If a note disagrees with them, fix the note.

## Stack (settled)
React Navigation 7 · React Native StyleSheet with tokens from `src/theme` · TanStack Query over the generated TS client · TypeScript strict · simplejwt (rotating refresh in `expo-secure-store`).

## The six rules
1. Never store or hand-write a total; the server computes it (money engine, `04`). The client never sums.
2. Money is Decimal end to end; round only at presentation.
3. `color.danger` is for errors and destructive actions only.
4. The FAB is the only add affordance.
5. No blank screens: every list/data view has loading, empty and error states.
6. No hardcoded colors, sizes or spacing outside `01` tokens.

## Ownership
Hassan: `src/theme`, `src/components`, `src/api` · Chris: `src/navigation`, auth screens, Home, `backend/` (04) · Ankit: subscriptions, analytics, settings · Rafi: ai, calendar, family, `04 §6a` backend.
Changed 2026-10-22: `04` moved to Chris; nothing else moved (`12 §1`, and the decision record in `Capstone_CSC325/01 - Planning/Open Decisions.md`).
Need a change in someone else's folder? Stop and ask.

## Commands
(fill in: install, start, typecheck, lint, test, regenerate API client)

Backend, from `backend/` with MongoDB up (`docker compose up -d --wait` at the repo root):
- Install: `pip install -r requirements-dev.txt`
- Lint: `ruff check .` and `ruff format --check .`
- Test: `pytest --cov --cov-fail-under=90`
- Migrations: `python manage.py makemigrations --check --dry-run`
- OpenAPI: `python manage.py spectacular --file schema.yml --validate`
- Seed DB: `python manage.py seed_demo [--today YYYY-MM-DD]` (resets and reloads the 04 §4 dataset; demo users log in with `subtrak-demo`). Run the server with `SUBTRAK_TODAY=2026-10-01` to see the seed figures.
- Trials: `python manage.py convert_trials` (the 04 §6a conversion job)

## Decisions log
- **Decimal storage:** money is `DecimalField`, stored as BSON Decimal128, never a float or scaled integers. The round trip is asserted in `subscriptions/tests/test_models.py`. Money is rounded half-up only at presentation, via `round_money` (`round_to_total` when lines are shown next to their total).
- **API contract (04 slice 2):** `backend/schema.yml` (OpenAPI 3.1) is frozen. Paths have no trailing slash; errors are `{"error": {"code", "message", "fields"}}` (`core/contract.py`); computed money is `{amount, currency}` in the display currency. Since slice 3, auth, subscriptions and analytics are real and scoped to the signed-in user; only the 04 §6a endpoints (extractions, trials, shared plans, Gmail) still answer from `backend/mocks.py`. Replace those functions, not the shapes.

- **Sessions (04 slice 3):** every token carries a `tv` claim checked against `users.token_version`, and a password reset bumps it, ending every session. Refresh rotates, and a used or logged-out refresh token is revoked by `jti` in `revoked_refresh_tokens`. This replaces simplejwt's blacklist app, which can't run on MongoDB.
- **Transactions:** use `django_mongodb_backend.transaction.atomic`. Django's own `transaction.atomic` is a no-op on this backend.
- **Today:** use `core.clock.today_for(user)`, the user's local date. `SUBTRAK_TODAY` pins it, and every test runs at SEED_TODAY.

- **Charts:** drawn with `react-native-svg` directly, no chart library. It is already a dependency, works in Expo Go, and the charts are simple shapes (Home's donut first; Analytics' bars and the price-history step line follow).

(add here: AI input path and retention window, Family privacy option)

## Figma
Newer file `IKYivyJtmBYzJNQ7g8qPGc` for everything except Home. Home = `4:2901` in the original file `kyUS7F8bg4x7GpcPEF4UDN`. Never build `113:641` or `113:765`.
