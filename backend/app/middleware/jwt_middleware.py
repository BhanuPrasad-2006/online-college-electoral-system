"""JWT middleware for request authentication."""

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from app.core.security import decode_token


class JWTMiddleware(BaseHTTPMiddleware):
    EXCLUDED_PATHS = ["/", "/health", "/docs", "/redoc", "/openapi.json", "/api/v1/auth/login", "/api/v1/auth/register"]

    async def dispatch(self, request: Request, call_next):
        if request.url.path in self.EXCLUDED_PATHS:
            return await call_next(request)

        # JWT validation is handled by Depends(get_current_user) in routes
        response = await call_next(request)
        return response
