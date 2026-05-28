"""
Rate limiting middleware.

Exports both the slowapi-based limiter (backward compatible) and the new
Redis-based distributed rate limiter and decorators.
"""

from fastapi import Request

from app.middleware.redis_rate_limiter import (
    check_rate_limit,
    rate_limit,
    rate_limit_10_per_minute,
    rate_limit_5_per_minute,
    rate_limit_3_per_minute,
    _get_client_ip,
)

# Re-export for backward compatibility with existing imports
def get_client_ip(request: Request) -> str:
    """Extract real client IP supporting reverse proxies."""
    return _get_client_ip(request)


# Keep slowapi limiter for gradual migration
# New code should use redis_rate_limiter directly
from slowapi import Limiter
from app.core.config import settings

limiter = Limiter(key_func=get_client_ip)
if settings.APP_ENV == "development":
    limiter.enabled = False


__all__ = [
    "limiter",
    "get_client_ip",
    "check_rate_limit",
    "rate_limit",
    "rate_limit_10_per_minute",
    "rate_limit_5_per_minute",
    "rate_limit_3_per_minute",
]
