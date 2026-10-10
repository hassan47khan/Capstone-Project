# SubTrak

A privacy-first mobile app for tracking recurring subscriptions. Users log their own charges — the
app never asks for bank or card credentials — and see what they spend, what renews next, and what a
plan costs once a trial converts.

Capstone project, CSC 325.

## Group Members

1. Hassan Khan
2. Christian Pivaral
3. Ankit Dhakal
4. Ahmed Rafi

> **Team roles — Pending.** Scrum Master, Product Owner and per-sprint vertical slice owners are
> not yet assigned. Record them here once the team agrees.

## Project Status

Sprint 0. Both halves of the stack are scaffolded and proven; no user story is finished yet.

| Area | State |
| --- | --- |
| Backend | Sprint 0 spike merged. MongoDB, custom user model, JWT wiring, `GET /health/` and `GET /me/`. 17 tests, 93% coverage, green in CI. No story endpoints yet. |
| Mobile | Phase 0 complete — scaffold, theme, 20 primitives, API layer, mock backend, session, navigation shell, 204 tests. Every screen is still a placeholder. |
| CI | `mobile-ci` and `backend-ci` both run on every push and pull request, both green on `main`. They are **not yet required checks** — see [Continuous Integration](#continuous-integration). |
| Docs | System design specification and visual prototype are done. |

## Repository Structure

```
.
├── backend/          # Django + DRF API (teammates own this)
│   ├── config/       # Django project settings, root URLconf, WSGI/ASGI entry points
│   ├── core/         # Health check, landing page and shared utilities
│   ├── accounts/     # Custom user model and /me
│   ├── subscriptions/  # Subscription model (spike-sized for now)
│   ├── mongo_migrations/  # Migrations for Django's contrib apps on MongoDB
│   ├── schema.yml    # Generated OpenAPI schema; CI fails if it is stale
│   ├── manage.py     # Django's command-line utility
│   ├── pyproject.toml  # ruff, pytest and coverage configuration
│   ├── requirements.txt / requirements-dev.txt
│   └── .env.example  # Template for local backend environment variables
├── mobile/           # React Native (Expo SDK 57) client
│   └── src/          # api/ components/ features/ navigation/ session/ theme/ test/
├── docs/design/      # System design specification, prototype PDF, design notes
├── docker-compose.yml  # Local MongoDB (single-node replica set); CI uses it too
└── .github/workflows # CI pipelines
```

## Documentation

| Document | Location |
| --- | --- |
| System Design Specification | [docs/design/SubTrak — System Design Specification.md](docs/design/SubTrak%20%E2%80%94%20System%20Design%20Specification.md) |
| Visual design prototype | `docs/design/SubTrak prototype.pdf` |
| Design notes, page map and state critique | [docs/design/README.md](docs/design/README.md) |
| Mobile client conventions | [mobile/CLAUDE.md](mobile/CLAUDE.md) |

The specification is the source of truth for the data model (section 4), the API (section 5), auth
(section 6), CI (section 13) and the sprint mapping (section 14). Code comments cite it by section
number.

## Tech Stack

**Backend** — Python 3.12+, Django 6.1, Django REST Framework, MongoDB 7.0+ via
`django-mongodb-backend` 6.1, JWT auth with simplejwt, OpenAPI schema from drf-spectacular, pytest

**Mobile** — React Native via Expo, TypeScript (strict), React Navigation, TanStack Query

## Getting Started — Backend

### Prerequisites

- Python 3.12 or later (required by Django 6.1)
- pip
- Docker, for the local MongoDB. Without Docker, any MongoDB 7.0+ server works: install it
  yourself and point `MONGODB_URI` at it. A replica set is recommended (see `docker-compose.yml`).

### Setup

1. Clone the repository and move into it:

   ```bash
   git clone <repo-url>
   cd "Capstone Project"
   ```

2. Create and activate a virtual environment:

   ```bash
   python -m venv venv

   # Windows (PowerShell)
   venv\Scripts\Activate.ps1

   # Windows (Git Bash) / macOS / Linux
   source venv/Scripts/activate   # Git Bash on Windows
   source venv/bin/activate       # macOS / Linux
   ```

3. Start MongoDB from the repository root. `--wait` returns once the database accepts writes:

   ```bash
   docker compose up -d --wait
   ```

4. Install dependencies (`requirements-dev.txt` adds the test and lint tools):

   ```bash
   cd backend
   pip install -r requirements-dev.txt
   ```

5. Create your local environment file. The app will not start without `DJANGO_SECRET_KEY`:

   ```bash
   cp .env.example .env
   ```

6. Apply database migrations:

   ```bash
   python manage.py migrate
   ```

7. Create an admin account (optional, for `/admin`):

   ```bash
   python manage.py createsuperuser
   ```

8. Run the development server:

   ```bash
   python manage.py runserver
   ```

   Visit [http://127.0.0.1:8000/api/v1/health/](http://127.0.0.1:8000/api/v1/health/) to confirm it's
   running and connected to MongoDB. A healthy response is `{"status": "ok", "database": "ok"}`;
   if MongoDB is unreachable the endpoint answers 503 so the client can show a retry state.

All backend commands run from the `backend/` directory.

### Backend Environment Variables

Configured via `backend/.env` (see `backend/.env.example`):

| Variable               | Description                                         | Default                              |
|------------------------|-----------------------------------------------------|--------------------------------------|
| `DJANGO_SECRET_KEY`    | Signs sessions and JWTs                             | none — **required**, startup fails without it |
| `DJANGO_DEBUG`         | Enables Django debug mode; only the value `True` turns it on | `False`                     |
| `DJANGO_ALLOWED_HOSTS` | Comma-separated list of allowed hosts               | empty                                |
| `MONGODB_URI`          | MongoDB connection string; the path names the database | `mongodb://localhost:27017/subtrak` |

Never commit a real `.env` file or production secret key.

### Backend Commands

All run from `backend/`.

| Command                                   | Description                              |
|-------------------------------------------|------------------------------------------|
| `python manage.py runserver`              | Start the local development server       |
| `python manage.py migrate`                | Apply database migrations                |
| `python manage.py makemigrations`         | Create new migrations from model changes |
| `python manage.py createsuperuser`        | Create an admin user                     |
| `pytest`                                  | Run the test suite (needs MongoDB running) |
| `pytest --cov --cov-report=term-missing`  | Tests with a coverage report             |
| `ruff check .` / `ruff format .`          | Lint / format                            |
| `python manage.py spectacular --file schema.yml --validate` | Regenerate the OpenAPI schema; commit it with any API change |

> **Seed data — Pending.** The specification calls for a `manage.py seed_demo` command that builds a
> synthetic demo dataset. It has not been written yet.

### API surface

Everything under `/api/v1/` requires a JWT unless the table says otherwise. The generated contract
lives in `backend/schema.yml` and is also served at runtime.

| Endpoint | Auth | Description |
|----------|------|-------------|
| `GET /api/v1/health/`     | public | Liveness. Reports MongoDB; 503 when it is unreachable |
| `GET /api/v1/me/`         | JWT    | The signed-in user's profile |
| `GET /api/v1/schema/`     | public | OpenAPI 3.0 document for this server |
| `/admin/`                 | staff  | Django admin |
| `/`                       | public | Placeholder landing page |

### Backend status

Sprint 0's spike is merged. It moved the backend off SQLite onto MongoDB and proved the pieces the
specification depends on: the custom email-keyed user model, an embedded model with an
`EmbeddedFieldIndex`, DRF with simplejwt defaulting to `IsAuthenticated`, a committed OpenAPI
schema, and pytest against a real replica set — 17 tests, 93.46% coverage, green in `backend-ci`.

Not built yet: registration, email verification, login, lockout and password reset (Epic A), the
subscription CRUD and dashboard endpoints (Epic C), Celery and Redis for reminders (Epic E), the
AI extraction subsystem (Epic D), and the `seed_demo` command. The `token_version` field exists on
the user but nothing reads it yet; the `tv` claim check in specification section 6 is a follow-up.

## Getting Started — Mobile

### Prerequisites

- Node.js 20 or later; CI runs 22
- The Expo Go app on a physical phone, or an Android emulator / iOS simulator

### Setup

```bash
cd mobile
npm install
```

### Running against mock data

The client ships a complete mock backend, so you can run every screen without the API. `mobile/.env.development`
sets `EXPO_PUBLIC_USE_MOCKS=true`, and Expo loads it automatically:

```bash
cd mobile
npm start
```

Scan the QR code with Expo Go, or press `a` for Android and `i` for iOS.

> Inline environment prefixes (`EXPO_PUBLIC_USE_MOCKS=true npm start`) do **not** work in PowerShell.
> Use the `.env` files, or `npm run start:mocks`, which handles the variable cross-platform.

### Running against the real backend

Point the client at a running API. On a physical device this must be your machine's LAN IP, not
`localhost`:

```bash
cd mobile
EXPO_PUBLIC_USE_MOCKS=false EXPO_PUBLIC_API_URL=http://192.168.1.50:8000/api/v1 npm start
```

Or copy `mobile/.env.example` to `mobile/.env.local` and set the values there.

### Mobile Commands

All run from `mobile/`.

| Command                 | Description                                           |
|-------------------------|-------------------------------------------------------|
| `npm start`             | Start the Expo dev server (mocks on)                  |
| `npm run start:mocks`   | Start with mock data forced on                        |
| `npm run start:api`     | Start against a real `EXPO_PUBLIC_API_URL`            |
| `npm run verify`        | Typecheck, lint, format check and tests — run before committing |
| `npm test`              | Jest                                                  |
| `npm run test:coverage` | Jest with a coverage report                           |
| `npm run typecheck`     | `tsc --noEmit`                                        |
| `npm run lint`          | ESLint                                                |
| `npm run format`        | Prettier write                                        |
| `npm run doctor`        | `expo-doctor` — dependency and config health          |

### Mobile status

Phase 0 is complete: the Expo scaffold, design tokens, 20 UI primitives with
tests, the API layer, the mock backend, session handling and the navigation
shell. **Every screen is still a placeholder** — Epic A is Phase 1, Epic C is
Phase 2, Epic B is Phase 3. See [mobile/CLAUDE.md](mobile/CLAUDE.md).

There is no device or simulator on the development machine, so what is verified
is `tsc`, ESLint, Prettier, Jest (204 tests) and a Metro bundle for both iOS and
Android. Layout, real contrast, font scaling and native modules are **not**
verified — run the app in Expo Go on a phone to check those.

## Continuous Integration

Workflows live in `.github/workflows/`. Both run on every push to `main` and every pull request,
with no path filters: a required check that a path filter skips never reports, and the pull request
waits on it forever. Job ids become check names, so they are unique across the two workflows and
each can be made a required check.

| Workflow | Job | What it runs |
| --- | --- | --- |
| `mobile-ci.yml` | `verify` | ESLint, Prettier, `tsc --noEmit`, Jest with coverage |
| `backend-ci.yml` | `backend-verify` | ruff check and format, `makemigrations --check`, stale-schema check, pytest against the compose MongoDB with a 90% coverage floor |
| `backend-ci.yml` | `backend-audit` | `pip-audit` on `requirements.txt`, reporting only — `continue-on-error`, so an advisory in an unrelated package never blocks a pull request. Do not make it a required check. |

Both are green on `main`. The most recent backend run: ruff clean, no missing migrations, schema
current, 17 tests passed, 93.46% coverage, no known vulnerabilities.

`backend-ci` brings up MongoDB from the repository's `docker-compose.yml` rather than a service
container, because the compose healthcheck is what initiates the replica set — so CI tests the same
database a teammate gets locally.

> **Required checks — Pending.** The `main-protection` ruleset requires a pull request with one
> approval, squash merges, linear history and resolved review threads, but it does **not** list
> `verify` and `backend-verify` as required status checks. A pull request with a red CI run can
> still be merged today. Adding them to the ruleset closes this, and is what the capstone
> guidelines' Week 10 pipeline milestone asks for.

### Keeping the OpenAPI schema current

`backend/schema.yml` is the generated contract the mobile client is built against. It is an OpenAPI
document, not a workflow, so it stays in `backend/` beside the code that generates it. Regenerate
and commit it with any API change:

```bash
cd backend
python manage.py spectacular --file schema.yml --validate
```

`backend-verify` enforces this: it regenerates the file and fails on `git diff --exit-code`, so a
stale schema cannot reach `main`.

## Screenshots

> **Pending.** Add screenshots of the Home, Subscriptions and Insights screens once the Epic C
> screens are built (Phase 2).

## Contributing

Branches are short-lived and named for the story, such as `feature/US-7-manual-entry`. Pull requests
stay under about 400 changed lines, link their issue, and carry a Definition of Done checklist plus
an AI-use note (tool, task, what you changed or verified) wherever AI wrote non-trivial code.

`main` is protected by the `main-protection` ruleset. What it enforces today:

- A pull request with **one approving review**. A push to the branch dismisses stale approvals.
- All review threads resolved before merge.
- **Squash merges only**, keeping history linear. Force-pushes and branch deletion are blocked.

Run the checks locally before pushing — `npm run verify` in `mobile/`, and `ruff check . && pytest`
in `backend/` — rather than using CI as the first check.
