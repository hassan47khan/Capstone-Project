---
status: done
owner: Christian
due: 2026-10-09
---

# Backend CI

`.github/workflows/backend-ci.yml`. Merged as PR #70, commit `9e392be`, squash
onto `main` on 2026-10-09. Green on first run.

## Description

What specification section 13 asks for: the backend's checks run against a real
MongoDB on every push to `main` and every pull request, so "the tests pass"
means the same thing for everyone and not just on whoever's laptop last touched
the code.

Two jobs:

- **`backend-verify`** — ruff check, ruff format check, `makemigrations --check
  --dry-run`, a stale-schema check, then pytest with `--cov-fail-under=90`.
- **`backend-audit`** — `pip-audit` on `requirements.txt`, `continue-on-error`
  so an advisory in an unrelated package does not block a pull request. Must not
  be made a required check.

## Subtasks
- [x] Open the pull request from `infra/backend-ci-workflow`
- [x] Confirm the run is green on GitHub's runners
- [x] Merge to `main`
- [x] Turn on branch protection for `main` — ruleset `main-protection`
- [ ] **Add `verify` and `backend-verify` as required status checks** — see below
- [ ] Pin the runner image before 2026-10-19 — see below
- [ ] Delete `infra/backend-ci-workflow` and the five other dead remote branches

## Verified run

Run `38009241217` on `main`, 2026-10-09. `backend-verify` 49s, `backend-audit`
20s, both green.

| Step | Result |
| --- | --- |
| ruff check / format | `All checks passed!` |
| `makemigrations --check --dry-run` | `No changes detected` |
| Stale-schema check | no diff — `schema.yml` matches the code |
| pytest | `17 passed` in 7.14s |
| Coverage | **93.46%** against a 90% floor (149 statements, 8 missed, 4 branches, 2 partial) |
| `pip-audit` | `No known vulnerabilities found` |

These are measured numbers from the runner, not estimates. Earlier notes quoted
93% from the spike's commit message; CI now confirms it.

## The checks actually bite

Worth knowing, because a pipeline nobody has seen fail proves nothing: a
throwaway branch (`throwaway/ci-honesty-check`, 2026-10-07, since closed) was
pushed deliberately to make `backend-verify` fail, and it did — `mobile-ci`
stayed green on the same commit, so the two really are independent. Do this
again whenever a step is added.

## Remaining gap — CI does not gate merges

The `main-protection` ruleset is active on the default branch and enforces:

- pull request with 1 approving review, stale approvals dismissed on push
- review threads must be resolved
- squash merges only, linear history required
- deletion and force-push blocked

It has **no `required_status_checks` rule**. A pull request with a red
`backend-verify` can be approved and merged today. Adding `verify` and
`backend-verify` to the ruleset is the last step of the Week 10 pipeline
milestone — leave `backend-audit` out, it is `continue-on-error` by design.

Also note the ruleset grants `hassan47khan` an `always` bypass, so the owner's
own pushes skip review entirely. Fine for a solo fix, worth being deliberate
about.

## Two things to watch

**`ubuntu-latest` migrates to Ubuntu 26 on 2026-10-19.** Both workflows carry
GitHub's annotation about it. Ten days out. Either pin `ubuntu-24.04` now and
migrate on purpose, or expect a surprise.

**`InsecureKeyLengthWarning`, 10 times per run.** The workflow's dummy
`DJANGO_SECRET_KEY: ci-only-not-a-secret` is 20 bytes; PyJWT wants 32 or more
for HS256. Harmless — it is a throwaway value in CI and nothing signs real
tokens there — but it is noise in the log and trivially fixed by lengthening the
string. `backend/.env.example` is already long enough, so local runs are clean.

## Design notes

**Separate workflow from `mobile-ci`, not a second job in it.** So the two fail
independently and each can be required. Job ids become check names and must be
unique across workflows — hence `verify` for mobile and `backend-verify` /
`backend-audit` here.

**No path filters.** A required check that a path filter skips never reports and
the pull request waits on it forever.

**MongoDB from `docker-compose.yml`, not a service container.** The compose
healthcheck initiates the replica set; a service container cannot run that step.
Using the same file as local development also means CI tests the database a
teammate actually gets. It starts first so the set initiates while pip installs.

**Coverage floor is 90, not the spec's 75.** The spike measured 93. A floor far
below reality lets coverage fall by a fifth before anyone notices. Raise it as
the measured figure rises.

**The stale-schema check** regenerates `backend/schema.yml` with
`manage.py spectacular --file schema.yml --validate` and fails on
`git diff --exit-code -- schema.yml`. `schema.yml` is the contract the mobile
client is built against, so it must not drift from the code.

**Only Python 3.12, not the spec's 3.12 + 3.13 matrix.** Testing the oldest
supported version catches use of newer syntax. The matrix can return when the
suite is worth doubling.

## Note on `schema.yml`

It stays at `backend/schema.yml`. It is a generated OpenAPI document, not a
workflow — GitHub Actions parses every `.yml` in `.github/workflows/` as a
workflow and would report it as broken, and `manage.py spectacular --file
schema.yml` writes it relative to `backend/`. The *check* on it belongs in CI;
the file does not.

## Links

[[Sprint 0 — Backend Spike]] · [[Repo State]] · spec section 13
