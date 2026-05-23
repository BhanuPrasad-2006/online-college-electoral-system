"""
Redis-based distributed rate limiter with sliding window counters.

Replaces slowapi in-memory limiter for horizontal scaling.
Falls back to per-process in-memory limiting if Redis is unavailable.
"""

import time
import asyncio
from collections import defaultdict
from functools import wraps
from typing import Callable, Optional

from fastapi import HTTPException, Request, status

from app.core.config import settings
from app.utils.logger import logger


# ---- In-memory fallback store (per-process) --------------------
_in_memory_store: dict[str, list[float]] = defaultdict(list)


# ---- Rate limiting function ------------------------------------

async def check_rate_limit(
    key: str,
    max_requests: int,
    window_seconds: int = 60,
) -> bool:
    """
    Check if a request is within rate limits.

    Uses Redis sorted sets for sliding window if REDIS is enabled.
    Falls back to in-memory sliding window if Redis is unavailable.
    """
    now = time.time()
    cutoff = now - window_seconds

    if settings.USE_REDIS:
        try:
            from app.core.redis import redis_client

            # Remove expired entries using sorted set scores
            await redis_client.zremrangebyscore(key, 0, cutoff)

            # Count remaining entries in the window
            count = await redis_client.zcard(key)
            if count is not None and count >= max_requests:
                return False

            # Record this request
            await redis_client.zadd(key, {str(now): now})
            await redis_client.expire(key, window_seconds * 2)
            return True

        except Exception:
            # Redis unavailable — fall through to in-memory
            pass

    # ---- In-memory fallback --------------------------------
    records = _in_memory_store[key]
    # Prune expired records
    while records and records[0] < cutoff:
        records.pop(0)

    if len(records) >= max_requests:
        return False

    records.append(now)
    return True


# ---- Decorator factory -----------------------------------------

def rate_limit(
    max_requests: int,
    window_seconds: int = 60,
    *,
    key_func: Optional[Callable[[Request], str]] = None,
) -> Callable:
    """
    Decorator that enforces a rate limit on a FastAPI route handler.

    The decorated function **must** accept a ``request: Request`` as its
    first parameter (FastAPI auto-injects it).
    """
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        async def wrapper(*args, **kwargs):
            request: Optional[Request] = None
            for arg in args:
                if isinstance(arg, Request):
                    request = arg
                    break
            if request is None:
                request = kwargs.get("request")
            if request is None:
                logger.warning(
                    f"Rate limit decorator on {func.__name__} has no request parameter — "
                    "rate limiting silently bypassed! Add 'request: Request' as a parameter."
                )
                return await func(*args, **kwargs)

            if key_func:
                rl_key = key_func(request)
            else:
                client_ip = _get_client_ip(request)
                rl_key = f"ratelimit:{client_ip}:{request.url.path}"

            allowed = await check_rate_limit(rl_key, max_requests, window_seconds)
            if not allowed:
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="Too many requests. Please try again later.",
                )

            return await func(*args, **kwargs)

        return wrapper

    return decorator


def _get_client_ip(request: Request) -> str:
    """Extract real client IP supporting reverse proxies."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    real_ip = request.headers.get("x-real-ip")
    if real_ip:
        return real_ip.strip()
    return request.client.host if request.client else "127.0.0.1"


# ---- Pre-built common rate-limit decorators --------------------
rate_limit_10_per_minute = rate_limit(10, 60)
rate_limit_5_per_minute = rate_limit(5, 60)
rate_limit_3_per_minute = rate_limit(3, 60)
