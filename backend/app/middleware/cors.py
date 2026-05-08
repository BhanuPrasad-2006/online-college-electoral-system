"""CORS configuration."""

from app.core.config import settings

CORS_CONFIG = {
    "allow_origins": settings.CORS_ORIGINS,
    "allow_credentials": True,
    "allow_methods": ["*"],
    "allow_headers": ["*"],
}
