---
status: current
owner: Hassan
updated: 2026-10-09
---

# Sprint Map

From specification section 14. This is a proposed re-slice: the sprint board was
written when the charter had five epics and now does not cover all 19 stories.

| Epic | Stories | Components | Sprint (weeks) |
| --- | --- | --- | --- |
| A Account Management | US-1, US-2 | `accounts`: registration, email verification, login, lockout, JWT with `token_version` | 1 (3–5) |
| A Account Management | US-3 | `accounts`: password reset, email tasks with synchronous fallback | 2 (6–7) |
| B Settings and Preferences | US-5 | `accounts.settings` time zone, reminder time computation | 2 (6–7) |
| B Settings and Preferences | US-4 | `exchange_rates`, converter, `/currencies` | 4 (10–11) |
| B Settings and Preferences | profile and notification prefs (gaps) | `/me`, `notification_prefs`, discreet-notification option | 5 (12–14) |
| C Dashboard and Expense Tracking | US-6, US-7, US-8 | `subscriptions`: model, CRUD, revisions, dashboard, categories, normalization | 1 (3–5) |
| D AI-Powered Extraction | US-9, US-10, US-11 | `extraction`: provider interface, validators, circuit breaker, review and fallback screens | 3 (8–9) |
| E Trial Shield and Notifications | US-12, US-13 | `notifications`: Celery and Redis, reminder rows, dispatcher, push, inbox, outage fallback | 2 (6–7) |
| F Shared Plan Cost Splitter | US-14, US-15 | `sharing`: split calculator, invitations, `/shared-with-me` | 3 (8–9) |
| G Renewal History and Analytics | US-16, US-17, trends (gap) | `billing_events`, renewal roll-forward, projection, trend aggregation | 4 (10–11) |
| H Contract and Price Alerts | US-18, US-19 | `contract` terms, contract reminders, price-change detector | 5 (12–14) |
| Cross-cutting | tests, accessibility, README, AI-use log, seed data, deletion/export | CI, `seed_demo`, test suites | baseline in 1, Week 10 milestone in 4, polish in 5 |

## Mobile phases against the epics

The client is built in phases rather than per-sprint, because the scaffold had
to come first: Phase 0 scaffold (done), Phase 1 Epic A, Phase 2 Epic C, Phase 3
Epic B. Epics D–H exist as typed seams only. See [[Phase 0 — Mobile Scaffold]].

Note the ordering mismatch: the backend takes Epic A and Epic C together in
Sprint 1, while the client builds A then C. Phase 2 can therefore start as soon
as the subscription endpoints exist, without waiting on the rest of Sprint 1.

## Where the board and the charter disagree

- The board's Sprint 1 lists only "JWT authentication (signup/login)". The
  charter adds email verification, lockout and password reset (US-1 to US-3).
- No cards exist for US-4, US-5, profile editing, the notification preference
  centre, category trends or account lifecycle.
- Time zones (US-5) must land before or with scheduled reminders → Sprint 2.
- Currency conversion (US-4) can wait until Sprint 4 without rework: prices are
  stored in their original currency from Sprint 1.
- Sprint 3 pairs the AI feature with the splitter. If it runs heavy, US-15 (the
  participant's view) is the card to slip into Sprint 4.
- The board has Sprint 0 plus five sprints across Weeks 1–14; the guidelines
  describe five. How Sprint 0 counts is an open question — see
  [[Open Decisions]].

## Where we actually are

Sprint 0, nothing from the story list finished. Infrastructure only, and that
part is done: [[Sprint 0 — Backend Spike]], [[Phase 0 — Mobile Scaffold]] and
[[Backend CI]] are all merged and green, and CI gates merges to `main` (checked
2026-10-20). What still blocks Sprint 1 is not code — team roles and the
answers in [[Open Decisions]]. See [[Repo State]].
