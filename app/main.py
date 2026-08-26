import logging
import traceback
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from app.core.config import settings
from app.core.errors import AppError, http_code
from app.core.telemetry import setup_telemetry
from app.core.tracing import setup_trace_logging, get_trace_id
from app.api.routes import auth, users, health, expenses, webauthn, analytics, admin
from app.db.mongo import backfill_tenant_ids, bootstrap_indexes
from app.middleware.tracing import TraceIDMiddleware
from app.middleware.auth import AuthenticationMiddleware
from app.middleware.csrf import CSRFProtectionMiddleware
from app.middleware.security_headers import SecurityHeadersMiddleware

# Configure logging with trace ID support
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
setup_trace_logging()
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(f"Starting {settings.PROJECT_NAME}")
    logger.info(f"Build version: {settings.BUILD_VERSION}")
    logger.info(f"API prefix: {settings.API_V1_STR}")
    setup_telemetry(app)
    logger.info("Running startup tenant ID migration")
    backfill_tenant_ids()
    logger.info("Startup tenant ID migration finished")
    bootstrap_indexes()
    yield
    logger.info(f"Shutting down {settings.PROJECT_NAME}")


# Interactive docs expose the full auth, WebAuthn and expense surface.
# They stay available outside production and are disabled in it.
_docs_enabled = not settings.is_production

app = FastAPI(
    title=settings.PROJECT_NAME,
    docs_url="/docs" if _docs_enabled else None,
    redoc_url="/redoc" if _docs_enabled else None,
    openapi_url="/openapi.json" if _docs_enabled else None,
    lifespan=lifespan,
)


# --------------------
# Exception Handlers
# --------------------
def _error_envelope(code: str, message: str, status: int) -> JSONResponse:
    return JSONResponse(
        status_code=status,
        content={"code": code, "message": message, "trace_id": get_trace_id() or ""},
    )


@app.exception_handler(AppError)
async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    return _error_envelope(exc.code, exc.message, exc.status_code)


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    return _error_envelope(http_code(exc.status_code), str(exc.detail), exc.status_code)


@app.exception_handler(RequestValidationError)
async def validation_error_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    first = exc.errors()[0] if exc.errors() else {}
    message = (
        first.get("msg", "Validation error")
        if isinstance(first, dict)
        else "Validation error"
    )
    return _error_envelope("VALIDATION_ERROR", message, 422)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.error(
        f"Unhandled exception on {request.method} {request.url.path}: "
        f"{type(exc).__name__}: {str(exc)}"
    )
    logger.error(f"Traceback:\n{traceback.format_exc()}")
    return _error_envelope("INTERNAL_SERVER_ERROR", "Internal server error", 500)


# --------------------
# Middleware
# --------------------
# Trace ID middleware (must be first to track all requests)
app.add_middleware(TraceIDMiddleware)
logger.info("Trace ID middleware registered")

# CSRF Protection middleware (must be before authentication)
app.add_middleware(CSRFProtectionMiddleware)
logger.info("CSRF Protection middleware registered")

# Authentication & Authorization middleware
app.add_middleware(AuthenticationMiddleware)
logger.info("Authentication middleware registered")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-CSRF-Token", "Idempotency-Key"],
)
logger.info("CORS middleware registered")

# Registered last so it is the outermost layer — this guarantees the headers
# are attached to every response, including error responses produced by the
# inner middleware and the SPA catch-all.
app.add_middleware(SecurityHeadersMiddleware)
logger.info("Security headers middleware registered")

_env_source = (
    f"ENVIRONMENT={settings.ENVIRONMENT}"
    if settings.ENVIRONMENT
    else f"inferred from K_SERVICE={settings.cloud_run_service or '<none>'}"
)
if _docs_enabled:
    logger.info(f"API docs enabled at /docs and /redoc ({_env_source})")
else:
    logger.info(f"API docs disabled — production deployment ({_env_source})")

# --------------------
# API Routes
# --------------------
app.include_router(health.router, tags=["Health"])
logger.info("Health routes registered")

app.include_router(
    auth.router,
    prefix=f"{settings.API_V1_STR}/auth",
    tags=["Auth"],
)
logger.info("Auth routes registered")

app.include_router(
    users.router,
    prefix=f"{settings.API_V1_STR}/users",
    tags=["Users"],
)
logger.info("User routes registered")

app.include_router(
    expenses.router,
    prefix=f"{settings.API_V1_STR}/expenses",
    tags=["Expenses"],
)
logger.info("Expense routes registered")

app.include_router(
    webauthn.router,
    prefix=f"{settings.API_V1_STR}/webauthn",
    tags=["WebAuthn"],
)
logger.info("WebAuthn routes registered")

app.include_router(
    analytics.router,
    prefix=f"{settings.API_V1_STR}/insights",
    tags=["Insights"],
)
logger.info("Insights analytics routes registered")

app.include_router(
    admin.router,
    prefix=f"{settings.API_V1_STR}/admin",
    tags=["Admin"],
)
logger.info("Admin routes registered")


BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
INDEX_FILE = STATIC_DIR / "index.html"
ASSETS_DIR = STATIC_DIR / "assets"
PWA_DIR = STATIC_DIR / "pwa"
FAVICON_FILE = STATIC_DIR / "favicon.ico"
PUBLIC_FAVICON_FILE = BASE_DIR / "public" / "favicon.ico"
MANIFEST_FILE = STATIC_DIR / "manifest.json"
SERVICE_WORKER_FILE = STATIC_DIR / "service-worker.js"
BROWSERCONFIG_FILE = STATIC_DIR / "browserconfig.xml"
OFFLINE_FILE = STATIC_DIR / "offline.html"

if ASSETS_DIR.exists():
    app.mount("/assets", StaticFiles(directory=ASSETS_DIR), name="assets")
    logger.info(f"Static assets mounted from {ASSETS_DIR}")
else:
    logger.warning(f"Static assets directory not found: {ASSETS_DIR}")

if PWA_DIR.exists():
    app.mount("/pwa", StaticFiles(directory=PWA_DIR), name="pwa")
    logger.info(f"PWA assets mounted from {PWA_DIR}")
else:
    logger.warning(f"PWA assets directory not found: {PWA_DIR}")


def _serve_static_file(
    file_path: Path,
    media_type: str | None = None,
) -> FileResponse:
    if file_path.exists():
        return FileResponse(file_path, media_type=media_type)
    raise HTTPException(
        status_code=404,
        detail=f"Static file not found: {file_path.name}",
    )


@app.get("/favicon.ico", include_in_schema=False)
def favicon() -> FileResponse:
    """Serve favicon from build output, or fallback to source public folder."""
    if FAVICON_FILE.exists():
        return FileResponse(FAVICON_FILE)
    if PUBLIC_FAVICON_FILE.exists():
        return FileResponse(PUBLIC_FAVICON_FILE)
    raise HTTPException(status_code=404, detail="Favicon not found")


@app.get("/manifest.json", include_in_schema=False)
def manifest() -> FileResponse:
    """Serve the web app manifest with the correct media type."""
    return _serve_static_file(
        MANIFEST_FILE,
        media_type="application/manifest+json",
    )


@app.get("/service-worker.js", include_in_schema=False)
def service_worker() -> FileResponse:
    """Serve the PWA service worker."""
    return _serve_static_file(
        SERVICE_WORKER_FILE,
        media_type="text/javascript",
    )


@app.get("/browserconfig.xml", include_in_schema=False)
def browserconfig() -> FileResponse:
    """Serve Windows tile metadata."""
    return _serve_static_file(BROWSERCONFIG_FILE, media_type="application/xml")


@app.get("/offline.html", include_in_schema=False)
def offline_page() -> FileResponse:
    """Serve the offline fallback shell."""
    return _serve_static_file(OFFLINE_FILE, media_type="text/html")


@app.get("/{full_path:path}")
def serve_spa(full_path: str):
    """Serve the React SPA for all non-API routes"""
    if full_path.startswith("api/") or full_path in {
        "docs",
        "redoc",
        "openapi.json",
        "health",
    }:
        logger.debug(f"404 for path: {full_path}")
        raise HTTPException(status_code=404, detail="Not Found")

    if INDEX_FILE.exists():
        return FileResponse(INDEX_FILE)

    logger.warning("Frontend build not found, serving error message")
    return {
        "detail": (
            "Frontend build not found. Run `npm install` and `npm run build` "
            "to generate app/static."
        ),
    }
