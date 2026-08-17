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
│       │   └── featureFlags.js   # VITE_FEATURE_* env var flags
│       ├── pages/                # Route-level components (Dashboard, Report, AddExpense …)
│       ├── components/           # Shared UI (charts, modals, sidebar, nav)
│       ├── hooks/useWebAuthn.js  # WebAuthn browser API wrapper
│       ├── pwa/
│       │   ├── PwaContext.jsx    # Install prompt state
│       │   ├── offlineQueue.js   # IndexedDB queue for offline mutations
│       │   └── register.js       # Service worker registration
│       ├── theme/ThemeContext.jsx
│       └── styles/               # Per-feature CSS modules
├── k8s/                          # GKE manifests — NOT used by any workflow (legacy)
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

The workflow generates `.cloudrun.env.yaml` from an **explicit allow-list** of
`APP_*` GitHub secrets. A setting that is not on that list cannot reach the
container — `ENVIRONMENT` and `COOKIE_SECURE` are both absent, so both are
derived at runtime from the `K_SERVICE` variable Cloud Run injects
(see `app/core/config.py`). Adding a new setting means adding it to that
allow-list, or deriving it the same way.

The `k8s/` directory holds GKE manifests that no workflow references. Treat
them as legacy unless that changes.

## Environment Variables

Copy `.env.example` to `.env`. Key variables:

| Variable | Purpose |
|---|---|
| `SECRET_KEY` / `JWT_SECRET` | JWT signing (min 32 chars) |
| `MONGODB_URI` | MongoDB connection string |
| `MONGODB_DB` | Database name (default: `my_finance`) |
| `GEMINI_API_KEY` | Google Gemini AI (expense extraction + chat) |
| `GEMINI_MODEL` | Model ID (default: `gemini-2.5-flash`) |
| `WEBAUTHN_RP_ID` / `WEBAUTHN_ORIGIN` | FIDO2 relying party (must match frontend origin) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth2 |
| `SMTP_HOST` / `SMTP_*` | Email delivery for OTPs (empty = console log) |
| `VITE_API_BASE_URL` | Frontend API base (default: `/api/v1`) |
| `VITE_FEATURE_SUPPORT_PAGE_ENABLED` | Feature flag: show support page |
| `ENVIRONMENT` | `development` or `production` |
| `COOKIE_SECURE` | Set `true` in production (HTTPS only) |

Special chars in MongoDB credentials must be URL-encoded (see `.env.example` for details).

## API Routes

All API routes under `/api/v1`. Middleware order: TraceID → CSRF → Auth → CORS.

| Prefix | Module | Notes |
|---|---|---|
| `/api/v1/auth` | `api/routes/auth.py` | login, register, OTP verify, refresh, Google OAuth |
| `/api/v1/users` | `api/routes/users.py` | `GET /me` — current user profile |
| `/api/v1/expenses` | `api/routes/expenses.py` | CRUD, AI extraction, AI chat |
| `/api/v1/webauthn` | `api/routes/webauthn.py` | FIDO2 passkey registration + auth |
| `/health` | `api/routes/health.py` | health check (no auth) |

FastAPI auto-generates OpenAPI docs at `/docs` (Swagger) and `/redoc`.

## Security Model

- **Auth**: JWT stored as HTTP-only cookie. Bearer token also accepted for API clients.
- **CSRF**: Double-submit cookie pattern. Frontend reads `csrf_token` cookie and sends it as `X-CSRF-Token` header on all mutating requests.
- **WebAuthn**: FIDO2 passkey support via `webauthn==2.1.0`. Device credentials stored in IndexedDB (`app/src/lib/deviceBinding.js`).
- **OTP**: 6-digit OTP sent via SMTP for signup and password reset. Configurable expiry (`SIGNUP_OTP_EXPIRY_MINUTES`).
- **Google OAuth2**: Authorization Code Flow with optional domain restriction (`GOOGLE_ALLOWED_DOMAINS`).

## Frontend Architecture

- **No TypeScript** — plain JSX throughout.
- **State**: React Context only (`AuthContext`, `ThemeContext`, `PwaContext`). No Redux or Zustand.
- **API calls**: All go through `app/src/lib/api.js` which handles CSRF injection and offline queuing.
- **Offline support**: Service worker + IndexedDB queue (`pwa/offlineQueue.js`) replays mutations when back online.
- **Feature flags**: `app/src/lib/featureFlags.js` reads `VITE_FEATURE_*` env vars at build time.
- **Charts**: Recharts — bar, donut, and daily expense line charts on Dashboard and Report pages.

## MongoDB Collections

| Collection | Purpose |
|---|---|
| `users` | User accounts, hashed passwords, OTP state, WebAuthn credentials |
| `expenses` | Expense records with category, amount, date, receipt metadata |

## Key Conventions

- Pydantic v2 models for all request/response I/O (`app/models/`).
- Services are plain Python classes/functions; routes are thin and delegate to services.
- All log lines include a `X-Trace-ID` propagated from `TraceIDMiddleware`.
- `deps.py` is the single source of FastAPI dependency injection (current user, DB handle).
- Frontend `fetch` calls always use `credentials: 'include'` to send cookies cross-origin in dev.
