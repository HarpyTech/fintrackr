# FinTrackr — Claude Context

## Project Overview

**FinTrackr** is a personal finance management web app. It is a full-stack monorepo where a Python FastAPI backend serves a React/Vite SPA. Both live inside `app/`. The Vite build outputs into `app/static/`, which FastAPI then serves as static files with a catch-all SPA route.

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python 3, FastAPI 0.110, Uvicorn/Gunicorn |
| Auth | JWT (HTTP-only cookies), bcrypt, OTP email, WebAuthn/FIDO2, Google OAuth2 |
| Database | MongoDB via PyMongo 4.10 |
| AI | Google Gemini 2.5 Flash — bill/receipt image parsing + AI expense chat |
| Frontend | React 18, Vite 5, React Router v6, JSX (no TypeScript) |
| Charts | Recharts |
| Icons | lucide-react |
| Dates | date-fns |
| Deployment | **Google Cloud Run** via GitHub Actions (Docker image → Artifact Registry) |

## Directory Structure

```
my-finance-develop/
├── app/                          # All source (backend + frontend)
│   ├── main.py                   # FastAPI app factory & SPA catch-all
│   ├── app.py                    # Thin alternate entry point
│   ├── core/
│   │   ├── config.py             # Pydantic-settings (reads .env)
│   │   ├── security.py           # JWT/bcrypt helpers
│   │   ├── ratelimit.py
│   │   └── tracing.py            # Trace ID setup
│   ├── api/
│   │   ├── deps.py               # DI: get_current_user, DB handle
│   │   ├── csrf_helper.py
│   │   └── routes/
│   │       ├── auth.py           # /api/v1/auth/*
│   │       ├── expenses.py       # /api/v1/expenses/*
│   │       ├── users.py          # /api/v1/users/me
│   │       ├── webauthn.py       # /api/v1/webauthn/*
│   │       ├── health.py         # /health
│   │       └── web.py
│   ├── models/
│   │   ├── user.py               # Pydantic v2 request/response models
│   │   └── expense.py
│   ├── middleware/
│   │   ├── auth.py               # JWT cookie/bearer validation
│   │   ├── csrf.py               # Double-submit cookie CSRF
│   │   └── tracing.py            # X-Trace-ID injection
│   ├── db/
│   │   └── mongo.py              # PyMongo client factory
│   ├── services/
│   │   ├── auth_service.py       # Registration, login, OTP, password reset, sessions
│   │   ├── expense_service.py    # Expense CRUD and aggregations
│   │   ├── expense_extraction_service.py  # Gemini AI image/text bill parsing
│   │   ├── expense_chat_service.py        # AI chat over expense history
│   │   └── webauthn_service.py   # FIDO2 registration & authentication
│   ├── public/                   # Static source assets (favicon, PWA icons)
│   ├── static/                   # Vite build output (gitignored, served by FastAPI)
│   └── src/                      # React frontend source
│       ├── main.jsx              # Entry: wraps in AuthProvider, ThemeProvider, PwaProvider
│       ├── App.jsx               # React Router v6 route tree
│       ├── auth/AuthContext.jsx  # Auth state + all auth actions via apiRequest()
│       ├── lib/
│       │   ├── api.js            # Fetch wrapper: CSRF injection, offline queue
│       │   ├── deviceBinding.js  # IndexedDB: device ID + WebAuthn credential binding
│       │   └── featureFlags.ts   # Runtime flags from /runtime-config.js
│       ├── pages/                # Route-level components (Dashboard, Report, AddExpense …)
│       ├── components/           # Shared UI (charts, modals, sidebar, nav)
│       ├── hooks/useWebAuthn.js  # WebAuthn browser API wrapper
│       ├── pwa/
│       │   ├── PwaContext.jsx    # Install prompt state
│       │   ├── offlineQueue.js   # IndexedDB queue for offline mutations
│       │   └── register.js       # Service worker registration
│       ├── theme/ThemeContext.jsx
│       └── styles/               # Per-feature CSS modules
├── RUNBOOK.md                    # Backups/restore, migrations, manual checks, go-live list
├── .github/workflows/deploy.yml  # Cloud Run deploy (main → prod, develop → dev)
├── Dockerfile
├── docker-compose.yml
├── vite.config.js                # root:"app", outDir:"static", port:3000
├── package.json                  # Frontend dependencies
├── requirements.txt              # Python dependencies
├── .env.example                  # All env vars documented here — copy to .env
├── APPLICATION_DESIGN.md
├── CODEBASE_OVERVIEW.md
└── SECRET-MANAGEMENT.md
```

## Running the Project

### Backend (development)

```bash
python -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env              # fill in required values
uvicorn app.main:app --reload --port 8000
```

### Frontend (development)

```bash
npm install
npm run dev                        # Vite dev server on localhost:3000
```

### Full-stack (Docker)

```bash
docker-compose up --build
```

### Production build

```bash
npm run build                      # outputs to app/static/
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

## Deployment — Google Cloud Run

`.github/workflows/deploy.yml` builds the Dockerfile (multi-stage: Node builds
the SPA, Python serves it) and runs `gcloud run deploy`.

| Branch | Service | Region |
|---|---|---|
| `main` | `finance-prod` | `us-central1` |
| `develop` | `finance-dev` | `us-east1` |

Before pushing, the workflow runs `npm audit --omit=dev --audit-level=high` and
a Trivy image scan; fixable CRITICAL/HIGH findings fail the job. Accept a
specific finding by adding its ID to a repo-root `.trivyignore`.

The image carries no environment values. The workflow generates
`.cloudrun.env.yaml` from the `env:` block of its "Build Cloud Run env file"
step — that block is the **single allow-list**: each non-empty `APP_<NAME>`
GitHub secret becomes `<NAME>` in the container. A setting not on that list
cannot reach the container — `ENVIRONMENT` and `COOKIE_SECURE` are both absent,
so both are derived at runtime from the `K_SERVICE` variable Cloud Run injects
(see `app/core/config.py`). Adding a new setting means adding one
`APP_<NAME>` line to that block, or deriving it the same way.

Frontend flags are runtime config too: FastAPI serves `/runtime-config.js`
(`window.__APP_CONFIG__`) from the `FEATURE_*` / `SUPPORT_EMAIL` settings, and
`app/src/lib/runtimeConfig.ts` reads it, so a flag change needs a redeploy,
not a rebuild.

There is no `k8s/` directory; Cloud Run is the only deployment target.

This workspace's git root is the parent `SLDC/` folder, which GitHub would not
read workflows from. FinTrackr deploys from its own repository; copy changes
there (with `my-finance-develop/` as the repo root) for CI/CD to run.

## Environment Variables

Copy `.env.example` to `.env`. Key variables:

| Variable | Purpose |
|---|---|
| `SECRET_KEY` | JWT signing (min 32 chars) |
| `MONGODB_URI` | MongoDB connection string |
| `MONGODB_DB` | Database name (default: `my_finance`) |
| `GEMINI_API_KEY` | Google Gemini AI (expense extraction + chat) |
| `GEMINI_MODEL` | Model ID (default: `gemini-2.5-flash`) |
| `WEBAUTHN_RP_ID` / `WEBAUTHN_ORIGIN` | FIDO2 relying party (must match frontend origin) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` / `GOOGLE_ALLOWED_DOMAINS` | Google OAuth2 |
| `SMTP_HOST` / `SMTP_*` | Email delivery for OTPs. Empty logs the OTP locally; on Cloud Run it fails closed (503) |
| `LOG_LEVEL` | Log verbosity (default `INFO`) |
| `VITE_API_BASE_URL` | Frontend API base, build-time (default: `/api/v1`) |
| `FEATURE_SUPPORT_PAGE_ENABLED` | Runtime flag: show support page (default `true`) |
| `FEATURE_BILLING_ENABLED` | Runtime flag: show Billing UI/routes |
| `FEATURE_ADMIN_ENABLED` | Runtime flag: show Admin UI/routes |
| `FEATURE_GOOGLE_SIGNIN_ENABLED` | Runtime flag: offer Google sign-in and enable `/auth/google*` (default `false`; needs `GOOGLE_*` credentials) |
| `SUPPORT_EMAIL` | Support page contact email |
| `ENVIRONMENT` | `development` or `production` (auto-detected from `K_SERVICE` on Cloud Run) |
| `COOKIE_SECURE` | Set `true` in production (forced on Cloud Run) |
| `ACCESS_TOKEN_EXPIRE_MINUTES` / `SESSION_MAX_HOURS` | Sliding cookie session: renewed while active, hard cap after sign-in (defaults 15 min / 12 h) |
| `ADMIN_EMAILS` | Comma-separated platform admins, promoted on sign-in and at startup |
| `DEFAULT_TIMEZONE` | Fallback for "today" when the browser sends no `X-Timezone` (default `Asia/Kolkata`) |
| `MAX_UPLOAD_SIZE_MB` | Receipt image size cap (default 10) |

Special chars in MongoDB credentials must be URL-encoded (see `.env.example` for details).

## API Routes

All API routes under `/api/v1`. Middleware runs outermost first:
SecurityHeaders → CORS → Auth → CSRF → Timezone → TraceID → route
(Starlette runs the last `add_middleware` call first).

| Prefix | Module | Notes |
|---|---|---|
| `/api/v1/auth` | `api/routes/auth.py` | login, register, OTP verify, refresh, Google OAuth |
| `/api/v1/users` | `api/routes/users.py` | `/me` profile (incl. timezone), `/me/export`, `/me/delete`, `/me/plan` |
| `/api/v1/expenses` | `api/routes/expenses.py` | CRUD, AI extraction, AI chat; creates honour `Idempotency-Key` |
| `/api/v1/webauthn` | `api/routes/webauthn.py` | Passkeys: enrolment needs a session; sign-in is public |
| `/api/v1/insights` | `api/routes/analytics.py` | AI analytics agent (SSE stream), overview, history |
| `/api/v1/admin` | `api/routes/admin.py` | Platform admin: all users, plans, limits |
| `/health` | `api/routes/health.py` | health check (no auth) |

Docs at `/docs` and `/redoc` are disabled in production.

## Security Model

- **Auth**: JWT (`type: access`) in an HTTP-only cookie, slid while active. Bearer also accepted; refresh tokens (PWA only) are never valid as access tokens.
- **Lockout**: 10 failed logins per account per 15 min, independent of client IP; OTPs burn after `SIGNUP_OTP_MAX_ATTEMPTS` guesses.
- **CSRF**: Double-submit cookie pattern. Frontend reads `csrf_token` cookie and sends it as `X-CSRF-Token` header on all mutating requests.
- **WebAuthn**: FIDO2 passkey support via `webauthn==2.1.0`. Device credentials stored in IndexedDB (`app/src/lib/deviceBinding.ts`).
- **OTP**: 6-digit OTP sent via SMTP for signup and password reset. Configurable expiry (`SIGNUP_OTP_EXPIRY_MINUTES`).
- **Google OAuth2**: Authorization Code Flow with optional domain restriction (`GOOGLE_ALLOWED_DOMAINS`).

## Frontend Architecture

- **TypeScript** (`.ts`/`.tsx`, `strict`), MUI components, React Query for server state.
- **State**: React Context (`AuthContext`, `ThemeContext`, `PwaContext`) plus React Query. Logout clears the query cache and offline queue.
- **API calls**: All go through `app/src/lib/api.ts` (CSRF header, `X-Timezone`, offline queuing with an `Idempotency-Key`). `insightsStream.ts` is the one SSE exception.
- **Offline support**: Service worker + IndexedDB queue (`pwa/offlineQueue.ts`). The worker never caches `/api` responses and replays queued writes only for the user who queued them.
- **Feature flags**: `app/src/lib/runtimeConfig.ts` reads `window.__APP_CONFIG__` (served by `/runtime-config.js`); `featureFlags.ts` re-exports it.
- **Dates**: `app/src/lib/timezone.ts` (`todayIso`, `getUserTimezone`); never use `toISOString()` for a calendar date.
- **Charts**: Recharts — bar, donut, and daily expense line charts on Dashboard and Report pages.

## MongoDB Collections

| Collection | Purpose |
|---|---|
| `users` | Accounts, password hash, OTP state, plan, role, timezone |
| `expenses` / `expense_line_items` | Expenses (soft-deleted via `is_deleted`) and receipt line items |
| `webauthn_credentials` / `webauthn_challenges` | Passkeys and pending challenges (TTL) |
| `refresh_tokens` | PWA refresh tokens (TTL) |
| `insight_history` | Insights answers (90-day TTL) |
| `idempotency_keys` | Unique `(key, user_id)` reservations for create requests (24 h TTL) |
| `*_attempts` | Rate-limit counters for login, OTP, WebAuthn, LLM (TTL) |

## Key Conventions

- Pydantic v2 models for all request/response I/O (`app/models/`).
- Services are plain Python classes/functions; routes are thin and delegate to services.
- All log lines include a `X-Trace-ID` propagated from `TraceIDMiddleware`.
- Server-side "today" is always `app.core.timeutil.local_today()`, never `date.today()`.
- `deps.py` is the single source of FastAPI dependency injection (current user, DB handle).
- Frontend `fetch` calls always use `credentials: 'include'` to send cookies cross-origin in dev.
