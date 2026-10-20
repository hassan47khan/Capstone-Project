# SubTrak

Vault home. SubTrak is a privacy-first subscription tracker: users log their own
charges, the app never asks for bank or card credentials. Capstone, CSC 325.

Repository: [hassan47khan/Capstone-Project](https://github.com/hassan47khan/Capstone-Project).
This vault is committed and shared by the team. It is notes, not a deliverable.
The README, the specification and `mobile/CLAUDE.md` are the authoritative
artefacts; anything here that contradicts them is out of date.

## Start here

- [[Repo State]] — what exists today, per area
- [[Sprint Map]] — epic → story → sprint, and where the board disagrees
- [[Open Decisions]] — questions blocking Sprint 1, with owners

## Work notes

| Note | Area | Status |
| --- | --- | --- |
| [[Sprint 0 — Backend Spike]] | Backend | done, merged (PR #68) |
| [[Backend CI]] | Backend / infra | merged and green (PR #70); one ruleset step left |
| [[Phase 0 — Mobile Scaffold]] | Frontend | done, merged |
| Handoffs 01–03 (tokens, components, navigation) | Frontend | merged (#82, #83, #85); see [[Repo State]] |
| [[Phase 1 — Epic A Screens]] | Frontend | not started; screens are still placeholders |

## Where Sprint 0 stands

As of 2026-10-20. Infrastructure is done: both CI workflows are on `main`
(green as of 2026-10-09, not re-checked), MongoDB is proven, and the mobile
foundations from handoffs 01–03 (Figma tokens, component library, navigation
tree) are merged. What is left before Sprint 1 is not code — it is **required
status checks on the ruleset**, **team roles**, and the answers in
[[Open Decisions]]. No story is finished end to end; US-5 has backend helpers
(#71). [[Repo State]] has the per-area detail.

## Conventions

Folders are numbered so the file explorer stays in reading order:
`00 - Project`, `01 - Planning`, `02 - Backend`, `03 - Frontend`, `04 - Logs`,
`99 - Templates`. Templates are in `99 - Templates` (Task, Bug Report, Code
Review, Log Entry) — insert with the Templates plugin rather than copying.

Session logs go in `04 - Logs` as `YYYY-MM-DD branch-slug.md`, local-only and
gitignored. Task notes carry `status` / `owner` / `due` front matter so the
file explorer and search can filter on them. See [[CLAUDE]] for the full set.
