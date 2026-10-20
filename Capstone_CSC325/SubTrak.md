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
| [[Phase 1 — Epic A Screens]] | Frontend | not started |

## Where Sprint 0 stands

Infrastructure is done: both CI workflows are on `main` and green, MongoDB is
proven, the client scaffold is complete. What is left before Sprint 1 is not
code — it is **required status checks on the ruleset**, **team roles**, and the
answers in [[Open Decisions]]. Zero of the 19 stories are built.

## Conventions

Folders are numbered so the file explorer stays in reading order:
`00 - Project`, `01 - Planning`, `02 - Backend`, `03 - Frontend`, `04 - Logs`,
`99 - Templates`. Templates are in `99 - Templates` (Task, Bug Report, Code
Review, Log Entry) — insert with the Templates plugin rather than copying.

Daily work goes in `04 - Logs` as `YYYY-MM-DD.md`. Task notes carry
`status` / `owner` / `due` front matter so the file explorer and search can
filter on them. See [[CLAUDE]] for the full set.
