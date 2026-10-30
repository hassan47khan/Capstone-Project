# Deploying the SubTrak backend

The runbook for putting the Django API, its Celery worker and Redis on
[Render](https://render.com), from `render.yaml` at the repository root.
MongoDB stays on the team's Atlas cluster.

Read the **rules** first; they are what stops a deploy from quietly doing
damage.

## The rules

1. **Exactly one worker.** It runs Celery beat inside it (`--beat`). A
   second worker means every scheduled job runs twice: reminders sent twice,
   rates refreshed twice. Never scale `subtrak-worker` above one instance.
2. **Never point a worker at the demo database.** `seed_demo` creates
   subscriptions, so it creates reminders, and a worker will send them. The
   02:00 UTC rate refresh will also overwrite the fixed EUR 0.9177 the seeded
   figures (Alex's EUR 118.56, `04 §4`) are built on. Production gets its
   own database name in `MONGODB_URI`.
3. **Never run `seed_demo` against production.** It deletes and reloads.
4. **Never set `SUBTRAK_TODAY` in production.** It pins every user's
   "today" to the demo date.
5. **The worker is not optional once Redis exists.** With `REDIS_URL` set,
   verification emails, reminders, the rate refresh and Gmail scans are all
   queued for the worker. With no worker running, they wait forever, and
   sign-up emails never arrive.
6. **`GMAIL_TOKEN_ENCRYPTION_KEY` must be identical on the API and the
   worker,** and must never change once users have connected Gmail. The
   worker decrypts what the API encrypted; a different or rotated key means
   every connected user has to reconnect.

## What gets created

| Service | Type | Plan | Why |
| --- | --- | --- | --- |
| `subtrak-api` | Web | `free` | The API. Free sleeps after 15 idle minutes; the next request waits about a minute. `0.5c-512mb` keeps it awake. |
| `subtrak-worker` | Background worker | `0.5c-512mb` | Celery worker + beat. Render has **no free worker plan**. |
| `subtrak-redis` | Key Value | `free` | Broker and shared cache. Internal only (`ipAllowList: []`), `noeviction`. Free keeps nothing across a restart, which is acceptable: MongoDB is the system of record. |

**Migrations run in the API's build step**, not as a pre-deploy command,
because Render offers pre-deploy only on paid plans. They are additive, so
running one build ahead of the code is safe.

**Python is pinned to 3.12** (`PYTHON_VERSION=3.12.12`), matching CI.
Render's own default is now 3.14, which nothing here has been tested on.

## First deploy

1. **MongoDB Atlas:** create a database user for production, and allow
   Render to connect (Atlas → Network Access; Render's outbound addresses
   are listed on each service's *Connect* tab). Build the connection string
   with a **production database name** in the path, e.g.
   `mongodb+srv://…/subtrak_prod?retryWrites=true&w=majority`.
2. **Render:** *New → Blueprint*, pick this repository. Render reads
   `render.yaml` and asks for every `sync: false` value. Enter them from the
   table below. Values asked for on both the API and the worker must be the
   same on both.
3. **Wait for the API's health check** (`/api/v1/health/`) to go green.
   `"status": "degraded"` is fine on the first boot: it means the worker
   or Redis is still starting.
4. **Google Cloud Console:** add
   `https://<api-name>.onrender.com/api/v1/integrations/gmail/callback` as
   an authorised redirect URI, and put the same URL in
   `GOOGLE_OAUTH_REDIRECT_URIS` on the API.
5. **Create an admin:** from the API's *Shell* tab,
   `python manage.py createsuperuser`.
6. **Run the live checks** below, once each.

## Environment variables

Everything the settings read. `—` means Render or the Blueprint supplies it.

| Variable | API | Worker | What it is |
| --- | :-: | :-: | --- |
| `DJANGO_SECRET_KEY` | generated | generated | Signs JWTs. Each service gets its own; the worker signs nothing. |
| `DJANGO_DEBUG` | `False` | `False` | Never `True` in production. |
| `DJANGO_ALLOWED_HOSTS` | only for a custom domain | — | The `onrender.com` name is added automatically. |
| `DJANGO_SECURE` | — | — | HTTPS redirect, secure cookies, HSTS. On automatically on Render. |
| `DJANGO_LOG_LEVEL` | optional | optional | `INFO` by default. |
| `MONGODB_URI` | **ask** | **ask** | Atlas, production database name. Same on both. |
| `REDIS_URL` | — | — | From `subtrak-redis`. |
| `RESEND_API_KEY` | **ask** | **ask** | Email. Unset falls back to the console, so no mail is sent. |
| `DJANGO_DEFAULT_FROM_EMAIL` | **ask** | **ask** | Must be on a domain verified in Resend, or `onboarding@resend.dev`. |
| `SUBTRAK_PUBLIC_BASE_URL` | optional | — | Defaults to the service's `onrender.com` URL. Set it for a custom domain. |
| `SUBTRAK_APP_LINK_PREFIX` | optional | — | `subtrak://` by default. |
| `EXPO_ACCESS_TOKEN` | **ask** | **ask** | Only with enhanced push security on; otherwise leave empty. |
| `LLM_API_KEY` | **ask** | **ask** | Anthropic. Unset makes extraction answer 503 and the insight use its template. |
| `LLM_MODEL` | optional | optional | `claude-opus-5-5` by default. |
| `EXTRACTION_ENABLED` | `true` | `true` | The kill switch. `false` stops every model call at once. |
| `EXTRACTION_DAILY_CAP` | `30` | `30` | Model calls per user per rolling 24 hours. |
| `GOOGLE_OAUTH_CLIENT_ID` | **ask** | **ask** | The Web-application client. |
| `GOOGLE_OAUTH_CLIENT_SECRET` | **ask** | **ask** | |
| `GOOGLE_OAUTH_REDIRECT_URIS` | **ask** | — | The callback URL from step 4, exactly. |
| `GMAIL_TOKEN_ENCRYPTION_KEY` | **ask** | **ask** | **Identical on both** (rule 6). Generate once: `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` |
| `SUBTRAK_TODAY` | **never** | **never** | Demo only (rule 4). |

## Live checks

Each touches a real service, so each needs `--live`. Run them from the
service's *Shell* tab after the first deploy, and again after changing a key.

| Check | Command (on) | Proves |
| --- | --- | --- |
| Email | `python manage.py send_test_email you@example.com --live` (API) | Resend accepts the key and the sender |
| Rates | `python manage.py refresh_rates --live` (worker) | Frankfurter answers; rates are stored |
| Push | `python manage.py send_test_push --token "ExponentPushToken[…]" --live` (worker) | Expo accepts a send to your device |
| Gmail | `python manage.py gmail_check --email you@example.com --live` (worker), after connecting from the app | The stored grant refreshes; the search runs. Prints counts only. |
| Model | `python manage.py eval_extraction --live` (worker) | Anthropic answers, within the 8 s budget, and how accurately. Run it locally with `--write` to commit the report. |

## Reading the health check

`GET /api/v1/health/` is public.

| Field | Meaning |
| --- | --- |
| `status` | `ok`; `degraded` (Redis down, or reminders more than 30 minutes overdue); or a **503** when MongoDB is unreachable, the only real outage. |
| `redis` | `ok` or `down`. Down: the app works, but scheduled work waits. |
| `oldest_overdue_reminder_minutes` | Over 30 means the worker is not dispatching. Check it is running, and that there is only one. |
| `llm` | `ok`, `open` (the breaker tripped after three failures; it retries after 5 minutes), `disabled` (kill switch) or `unconfigured`. Never makes `status` degraded: extraction has a manual fallback. |

## Logs

Every line goes to stdout, which Render collects, in the form

    2026-10-30 14:02:11,512 INFO subtrak.request [3f9c…] GET /api/v1/subscriptions 200 41ms

The bracketed value is the **request id**, also returned to the client in
the `X-Request-ID` header. When someone reports a failure, ask for that
header and search the logs for it. (The mobile app does not surface it
yet; it is in every response for when it does.) Lines outside a
request (the worker, commands) show `[-]`.

What is deliberately **not** logged: query strings (they carry single-use
verify tokens and OAuth codes, which is also why gunicorn's access log is
off), headers, tokens, and any email content.

## Rolling back

Render keeps previous deploys: *the service → Events → a past deploy →
Rollback*. Migrations are additive, so the previous code runs against the
newer schema. Roll the API and the worker back together if a change touched
tasks.

## Turning things off in a hurry

| Problem | Do this |
| --- | --- |
| The model is misbehaving or costing too much | Set `EXTRACTION_ENABLED=false` on both. Scans answer 503 ("add it manually"); the insight card uses its template. |
| A leaked key | Rotate it at the provider, update it on Render (both services), redeploy. The one key that cannot simply be rotated is `GMAIL_TOKEN_ENCRYPTION_KEY` (rule 6). |
| Duplicate reminders | A second worker is running. Scale `subtrak-worker` back to one. |

## Costs to expect

The worker is the one fixed cost (Render's smallest paid instance). The API
and Redis can stay free for a demo. Model calls are capped at 30 per user
per day; the eval measures the real per-call cost when it is run live.
