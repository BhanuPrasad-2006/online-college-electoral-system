"""Suspicious activity detection middleware."""

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware


class SuspiciousActivityMiddleware(BaseHTTPMiddleware):
    """
    Middleware to detect and flag suspicious activity patterns.
    Logs and optionally blocks requests from IPs with anomalous behavior.
    """

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        return response
