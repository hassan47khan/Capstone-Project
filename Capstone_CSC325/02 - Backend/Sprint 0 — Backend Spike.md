---
status: done
owner: Christian
due: 2026-10-07
---

# Sprint 0 — Backend Spike

Merged as PR #68, commit `dec6243`.

## Description

Move the backend off SQLite onto MongoDB via `django-mongodb-backend` 6.1 and
prove the parts of the specification the rest of the backend is built on
(sections 3, 4, 6, 15). This was a risk-retirement spike, not a feature: the
specification's top two risks were the Django ↔ backend version pairing and
6.1's changed embedded-index rules.

## Subtasks
- [x] Regenerate settings from the MongoDB Django project template on 6.1
- [x] `ObjectIdAutoField`, contrib migrations in `mongo_migrations/`, `MongoRouter`
- [x] `accounts.User` — email login, `name`, `email_verified_at`, `token_version`
- [x] `subscriptions.Subscription` with embedded `sharing.participants`
- [x] `EmbeddedFieldIndex` on `sharing.participants.email`
- [x] DRF + simplejwt, `IsAuthenticated` by default
- [x] `GET /api/v1/health/` and `GET /api/v1/me/`
- [x] `schema.yml` committed from drf-spectacular
- [x] docker-compose single-node replica set with a healthcheck that initiates it
- [x] pytest suite — 17 tests, 93% coverage
- [x] Merge [[Backend CI]] so this is checked on every pull request — PR #70

## What the spike settled

**Version pairing holds.** Django 6.1.2 with `django-mongodb-backend` 6.1.0,
DRF 3.18.3, simplejwt 5.5.1 and drf-spectacular 0.30.0 all install and pass a
smoke test. The fallback to Django 6.0 is not needed. Minor versions of Django
and the backend must match — that is why both are pinned exactly.

**Embedded indexes moved.** Since backend 6.1 an index on a field inside an
embedded model must be declared on the *top-level* model with
`EmbeddedFieldIndex`. A plain `Index` rejects the dotted path. This is the trap
the specification flagged; it is now documented in a comment on the model.

**Transactions need the replica set, but the tests do not.** Django's
`TestCase` flushes rather than wrapping in a transaction on this backend, so the
suite would pass against a standalone `mongod`. The app's own
`transaction.atomic()` would not, and Atlas is always a replica set — so local
and CI both run `rs0` as a single node. The compose healthcheck initiates the
set and only reports healthy once the node is a writable primary, which is what
makes `docker compose up -d --wait` mean "usable" rather than "started".

## Decisions worth remembering

- **No fallback `SECRET_KEY`.** Settings raise `ImproperlyConfigured` at startup
  instead of signing tokens with a key that is in the repository. `DEBUG` is off
  unless the value is exactly `True`.
- **Emails are lower-cased in the manager**, so the unique index treats
  `Sam@Example.com` and `sam@example.com` as one account (spec section 4).
- **`email_verified_at` is a timestamp, not a flag** — the collection shape the
  spec defines — exposed to the API as the boolean `email_verified`.
- **`/me` is routed twice**, with and without the trailing slash, because the
  client calls it without one and an `APPEND_SLASH` redirect would break a later
  `PATCH`. The slash-less route is excluded from the schema so the operation is
  documented once.
- **`owner` is a `ForeignKey`, not a bare `ObjectId`**, so Django enforces
  ownership and queries can filter on it directly.

## Open follow-ups

- `token_version` is stored but nothing reads it. The `tv` claim check that
  makes password reset and "log out everywhere" actually revoke tokens
  (spec section 6) is still to do — it belongs with Epic A.
- `Subscription` is spike-sized: name, owner, sharing. Price, cycle, trial,
  contract and revisions arrive with US-6 and US-7.
- Health reports MongoDB only. Redis and the LLM circuit state join it when
  those subsystems exist.
- Redis is not in `docker-compose.yml` yet; it joins with the Celery work in
  Sprint 2.

## Links

[[Repo State]] · [[Backend CI]] · [[Sprint Map]] · spec sections 3, 4, 6, 15
