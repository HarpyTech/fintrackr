from fastapi import APIRouter
from fastapi.responses import JSONResponse
import logging

from app.core.config import settings
from app.db.mongo import ping_database

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/health")
def health_check():
    """Basic health check"""
    logger.debug("Basic health check requested")
    return {"status": "UP"}


@router.get("/api/v1/health")
def api_health_check():
    """API health check"""
    logger.debug("API health check requested")
    return {
        "status": "UP",
        "service": settings.PROJECT_NAME,
    }


@router.get("/api/v1/health/build")
def build_health_check():
    """Detailed health check including database connectivity"""
    logger.info("Build health check requested")
    try:
        mongo_up = ping_database()
        payload = {
            "status": "UP" if mongo_up else "DEGRADED",
            "build_ready": mongo_up,
            "mongo": "UP" if mongo_up else "DOWN",
            "service": settings.PROJECT_NAME,
            "build_version": settings.BUILD_VERSION,
        }
        if mongo_up:
            logger.info("Health check: All systems operational")
            return payload
        logger.warning("Health check: MongoDB is DEGRADED")
        return JSONResponse(status_code=503, content=payload)
    except Exception as exc:
        logger.error(f"Health check failed: {type(exc).__name__}", exc_info=True)
        payload = {
            "status": "DOWN",
            "build_ready": False,
            "mongo": "ERROR",
            "service": settings.PROJECT_NAME,
            "build_version": settings.BUILD_VERSION,
        }
        return JSONResponse(status_code=503, content=payload)
