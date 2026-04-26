from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path
import logging
import traceback

from app.core.config import settings
from app.core.tracing import setup_trace_logging
from app.api.routes import auth, users, health, expenses
from app.middleware.tracing import TraceIDMiddleware
from app.middleware.auth import AuthenticationMiddleware
from app.middleware.csrf import CSRFProtectionMiddleware

# Configure logging with trace ID support
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
setup_trace_logging()
logger = logging.getLogger(__name__)

app = FastAPI(title=settings.PROJECT_NAME)


# --------------------
# Event Handlers
# --------------------
@app.on_event("startup")
async def startup_event():
    """Log application startup"""
    logger.info(f"Starting {settings.PROJECT_NAME}")
    logger.info(f"Build version: {settings.BUILD_VERSION}")
    logger.info(f"API prefix: {settings.API_V1_STR}")
    logger.info("MongoDB connection configured")


@app.on_event("shutdown")
async def shutdown_event():
    """Log application shutdown"""
    logger.info(f"Shutting down {settings.PROJECT_NAME}")


# --------------------
# Exception Handlers
# --------------------
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """
    Global exception handler to catch all unhandled exceptions
    and log them with full traceback
    """
    logger.error(
        f"Unhandled exception on {request.method} {request.url.path}: "
        f"{type(exc).__name__}: {str(exc)}"
    )
    logger.error(f"Traceback:\n{traceback.format_exc()}")

    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
    )


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
    allow_headers=["Authorization", "Content-Type", "X-CSRF-Token"],
)
logger.info("CORS middleware registered")

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
