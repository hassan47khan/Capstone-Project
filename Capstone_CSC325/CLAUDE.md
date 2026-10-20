# Claude Notes

Context for working with Claude Code in this vault.

## What this vault is

Shared team notes for the SubTrak capstone. The vault is committed to the
repository at `Capstone_CSC325/`, so everyone's notes and everyone's AI read
the same copy. Nothing here ships, and nothing here is authoritative. Start at
[[SubTrak]].

Every AI session reads the vault first and updates it last; the rule is in the
root `CLAUDE.md` and `AGENTS.md`. `.obsidian/workspace.json` is gitignored
because Obsidian rewrites it on every open.

The authoritative artefacts are all in the repository:

| Source of truth | Where |
| --- | --- |
| Requirements, data model, API, auth, CI | `docs/design/SubTrak — System Design Specification.md` |
| Visual design | `docs/design/SubTrak prototype.pdf`, critiqued in `docs/design/README.md` |
| Setup, commands, project status | `README.md` |
| Mobile client conventions | `mobile/CLAUDE.md` |

If a note here contradicts one of those, the note is out of date. Fix the note,
not the artefact.

## Conventions

- Folders are numbered to keep the explorer in reading order: `00 - Project`,
  `01 - Planning`, `02 - Backend`, `03 - Frontend`, `04 - Logs`,
  `99 - Templates`.
- Task notes carry `status` / `owner` / `due` front matter. Status values in use:
  `todo`, `blocked`, `done`, `open`, `current`.
- Templates live in `99 - Templates` (Task, Bug Report, Code Review, Log Entry).
  Insert them with the Templates plugin so `{{date}}` resolves.
- Daily notes go in `04 - Logs` as `YYYY-MM-DD.md`.
- Link with wiki-style double-bracket links, including to notes that do not exist yet — an
  unresolved link marks something worth writing.

## When updating notes here

Dates are absolute, never "last week". When a note records a figure that can
drift — a test count, a coverage percentage, a commit — say when it was measured
and whether it was re-run or copied from a commit message. [[Repo State]] is the
one note meant to be rewritten rather than appended to; everything else gets a
"Since this note was written" section so the original reasoning survives.

Spec references are by section number, matching the convention in the backend's
code comments.
