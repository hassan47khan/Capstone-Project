---
status: done
owner: Hassan
due: 2026-10-02
---

# Phase 0 — Mobile Scaffold

## Description

Expo SDK 57 client in `mobile/`. Scaffold, design tokens, 20 UI primitives, API
layer, mock backend, session handling, navigation shell. No screens yet — every
route renders a `Placeholder`.

Django moved to `backend/` as its own change first; the backend was then taken
onto MongoDB separately in [[Sprint 0 — Backend Spike]].

## Subtasks
- [x] Move Django into `backend/`, fix README run paths
- [x] Expo scaffold, Jest + MSW working on Windows
- [x] `theme/tokens.ts` + contrast tests (21 pairs, all pass)
- [x] String-based money formatter, no floats
- [x] API client: single-flight refresh, mock transport branch
- [x] 20 primitives with a11y tests
- [x] Session + navigation shell, Family tab gated off
- [x] CI workflow, `docs/design/README.md`
- [x] Merged to `main`
- [ ] [[Phase 1 — Epic A Screens]]
- [ ] Run on a physical Android phone via Expo Go

## Notes

**Verified:** tsc, ESLint, Prettier, Jest, Metro export for iOS and Android,
expo-doctor 21/21. The suite was 185 tests at the time of this note and is 204
as of 2026-10-09 — the session-refresh fix in PR #65 added the rest.

**Not verified** (no device here): layout, real contrast, font scaling,
SecureStore, keyboard behaviour. Needs Expo Go on a phone.

**Mutation spot-check:** lightened `ink3` → contrast test failed; set JPY minor
units to 2 → 4 formatter tests failed. Both reverted.

**Toolchain traps** (all documented in `mobile/CLAUDE.md`): RNTL v14 made
`render` async; MSW v3 renamed `onUnhandledRequest`; Jest needs undici's fetch
because RN's is XHR-based; `.mjs` needs its own transform entry.

**Open:** the prototype's Settings shows a "Payment method — Visa ····4242" row
on the detail screen. No such field exists in the spec and SubTrak never asks for
card details. Worth raising with the Product Owner — see `docs/design/README.md`
and [[Open Decisions]]. Still unanswered as of 2026-10-09.

## Since this note was written

Merged. One follow-up fix landed on top: PR #65, "stop transient failures and
late refreshes from breaking sign-in state" — a transient network error during
token refresh was signing the user out, and a refresh that resolved after sign-out
could resurrect the session.

Two reverts sit in the history around the same time (`copilot/*` branches, PR #63
reverting #62): an attempt to unblock the `verify` job by removing mobile entry
imports and Jest setup paths, which broke the scaffold rather than fixing CI. The
real cause was a Prettier failure on `tsconfig.json`, fixed in `00ee3ff`. Worth
remembering before anyone tries that route again.

**2026-10-19: the theme described above is superseded** on branch
`feature/design-tokens-figma` (PR #73), which is not merged yet.

- **Source and look.** The appearance source moved from the PDF prototype to
  Figma. Newsreader and Hanken Grotesk became DM Serif Display and DM Sans, the
  palette was renamed to the Figma variables, the radius is now 6, and a dark
  theme was added.
- **Categories.** They follow handoff 04's taxonomy.
- **Tests.** The "21 contrast pairs" figure no longer applies; the suite now
  runs every pair in both themes.

See [[2026-10-19]].

See [[Repo State]] for where this sits now.
