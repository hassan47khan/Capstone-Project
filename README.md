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

## Repository Structure

```
.
├── backend/          # Django + DRF API (teammates own this)
│   ├── config/       # Django project settings, root URLconf, WSGI/ASGI entry points
│   ├── core/         # Primary Django app (views, templates, models)
│   ├── manage.py     # Django's command-line utility
│   ├── requirements.txt
│   └── .env.example  # Template for local backend environment variables
├── mobile/           # React Native (Expo) client
├── docs/             # Design PDF and system design specification
└── .github/workflows # CI pipelines
```

## Documentation

| Document | Location |
| --- | --- |
| System Design Specification | `docs/SubTrak — System Design Specification.md` — **pending**, Hassan to add |
| Visual design prototype | `docs/design/SubTrak prototype.pdf` — **pending**, Hassan to add |
| Design notes, page map and state critique | [docs/design/README.md](docs/design/README.md) |
| Mobile client conventions | [mobile/CLAUDE.md](mobile/CLAUDE.md) |

## Tech Stack

**Backend** — Python 3.12+, Django 6.1, SQLite (development)

> **Database migration pending.** The System Design Specification calls for MongoDB via
> `django-mongodb-backend`. `backend/config/settings.py` still uses SQLite; the migration is Sprint 0
> work and has not been done.

**Mobile** — React Native via Expo, TypeScript (strict), React Navigation, TanStack Query

## Getting Started — Backend

### Prerequisites

- Python 3.12 or later (required by Django 6.1)
- pip

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

3. Install dependencies:

   ```bash
   cd backend
   pip install -r requirements.txt
   ```

4. Create your local environment file:

   ```bash
   cp .env.example .env
   ```

5. Apply database migrations:

   ```bash
   python manage.py migrate
   ```

6. Create an admin account (optional, for `/admin`):

   ```bash
   python manage.py createsuperuser
   ```

7. Run the development server:

   ```bash
   python manage.py runserver
   ```

   Visit [http://127.0.0.1:8000/](http://127.0.0.1:8000/) to confirm it's running.

All backend commands run from the `backend/` directory.

### Backend Environment Variables

Configured via `backend/.env` (see `backend/.env.example`):

| Variable                 | Description                               | Default                     |
|--------------------------|-------------------------------------------|-----------------------------|
| `DJANGO_SECRET_KEY`      | Secret key used for cryptographic signing | insecure dev key (generated)|
| `DJANGO_DEBUG`           | Enables Django debug mode                 | `True`                      |
| `DJANGO_ALLOWED_HOSTS`   | Comma-separated list of allowed hosts     | empty                       |

Never commit a real `.env` file or production secret key.

### Backend Commands

All run from `backend/`.

| Command                                   | Description                              |
|-------------------------------------------|------------------------------------------|
| `python manage.py runserver`              | Start the local development server       |
| `python manage.py migrate`                | Apply database migrations                |
| `python manage.py makemigrations`         | Create new migrations from model changes |
| `python manage.py createsuperuser`        | Create an admin user                     |
| `python manage.py test`                   | Run the test suite                       |

> **Seed data — Pending.** The specification calls for a `manage.py seed_demo` command that builds a
> synthetic demo dataset. It has not been written yet.

## Getting Started — Mobile

### Prerequisites

- Node.js 20 or later
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
is `tsc`, ESLint, Prettier, Jest (185 tests) and a Metro bundle for both iOS and
Android. Layout, real contrast, font scaling and native modules are **not**
verified — run the app in Expo Go on a phone to check those.

## Screenshots

> **Pending.** Add screenshots of the Home, Subscriptions and Insights screens once the Epic C
> screens are built (Phase 2).

## Contributing

Branches are short-lived and named for the story, such as `feature/US-7-manual-entry`. Pull requests
stay under about 400 changed lines, link their issue, and carry a Definition of Done checklist plus
an AI-use note (tool, task, what you changed or verified) wherever AI wrote non-trivial code.
