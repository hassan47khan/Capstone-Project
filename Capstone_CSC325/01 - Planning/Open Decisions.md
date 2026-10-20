---
status: open
owner: Hassan
updated: 2026-10-19
---

# Open Decisions

From specification section 15, with what Sprint 0 has since settled marked.
Several rows have no owner because team roles are still unassigned — that is
itself the first thing to fix.

## Settled by Sprint 0

| Decision | Outcome |
| --- | --- |
| Repository layout | Done. Django in `backend/`, Expo client in `mobile/`. |
| Django ↔ `django-mongodb-backend` pairing | Holds on 6.1. No fallback to 6.0 needed. See [[Sprint 0 — Backend Spike]]. |
| Local and CI MongoDB topology | Single-node replica set via `docker-compose.yml`, both places. |
| Category taxonomy (2026-10-19) | Handoff 04's seven: entertainment, productivity, ai-tools, cloud-storage, news-media, health-wellness, other. Spec enum amended. See [[2026-10-19]]. |
| Appearance source (2026-10-19) | The Figma file `kyUS7F8bg4x7GpcPEF4UDN` replaces the PDF prototype. |

## Still open

| Decision | Recommendation in the spec | Owner | Needed by |
| --- | --- | --- | --- |
| Team roles — Scrum Master, Product Owner, per-sprint slice owners | — | Team | **Now.** Blocks every Product Owner row below |
| Does SubTrak clear the guidelines' "expense organizer" exclusion? | Ask the instructor, framing the LLM extraction, splitter and reminder pipeline as the substance; get it in writing | Product Owner | Before Sprint 1 planning |
| How Sprint 0 counts against the five-sprint requirement | Ask the instructor | Scrum Master | Sprint 0 |
| Named real users for the Week 3 requirements work | Name three actual people matching the personas, schedule the questions | Product Owner | Sprint 0 |
| Participant accounts vs guest link (US-15) | Require registration, as designed in section 6 | Product Owner | Sprint 1 |
| Totals treatment — trials excluded, shared plans at full price with an "owed to you" line | Adopt as written in section 9 | Product Owner | Sprint 1 |
| Account deletion and data export | Small epic in Sprint 5 | Product Owner | Sprint 2 planning |
| Push transport | Expo Push Service, Android-first for demos | Team | Sprint 0 |
| LLM provider, model and daily cost cap | One vision-capable small model, per-user daily cap and a kill switch | Team | Sprint 2 |
| Contract reminder window counted back from the notice deadline (US-18) | Confirm the literal reading in section 8 | Product Owner | Sprint 4 planning |

## Raised by the design review, not in the spec

From `docs/design/README.md`:

- The prototype's subscription detail screen shows a **"Payment method —
  Visa ····4242"** row. No such field exists in the data model and SubTrak never
  asks for card details — it is the one promise the product makes. Either the
  prototype drops the row or the privacy claim changes. Needs the Product
  Owner. Flagged in [[Phase 0 — Mobile Scaffold]] and still unanswered.
- Two further Settings rows in the prototype have no backing field.
- ~~The prototype's demo categories do not match the spec's set.~~ Settled
  2026-10-19; see the table above.
- The price-increase banner belongs to Epic H, not the dashboard.
- **Epic numbering disagrees** (raised 2026-10-19). The developer handoff calls
  Home "Epic B" and Settings "Epic E", but [[Sprint Map]] uses Epic B for Settings
  and Epic C for the dashboard. Nothing has been renumbered. Pick one scheme
  before handoff files 05 onward are turned into issues, or stories will be
  filed under the wrong epic. More pressing since PR #75: the route names now
  follow the handoff (Home, Calendar, Analytics, Settings), so the code and the
  handoff agree and only the Sprint Map uses the older epic letters.

## Links

[[Sprint Map]] · [[Repo State]] · spec section 15
