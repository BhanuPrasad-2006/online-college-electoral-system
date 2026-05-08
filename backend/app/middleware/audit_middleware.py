"""Audit middleware — logs all API requests for accountability."""

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
import structlog

logger = structlog.get_logger()


class AuditMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # Log request
        logger.info(
            "api_request",
            method=request.method,
            path=request.url.path,
            ip=request.client.host if request.client else "unknown",
        )

        response = await call_next(request)

        # Log response
        logger.info(
            "api_response",
            method=request.method,
            path=request.url.path,
            status_code=response.status_code,
        )

        return response
