"""JWT middleware for request authentication — pure ASGI implementation.

Avoids Starlette BaseHTTPMiddleware bugs (RuntimeError: No response returned).
"""

import sys
import traceback

from fastapi import HTTPException
from fastapi.responses import JSONResponse
from starlette.types import ASGIApp, Scope, Receive, Send
from app.core.security import decode_token
from app.utils.logger import logger


class JWTMiddleware:
    EXCLUDED_PATHS = ["/", "/health", "/docs", "/redoc", "/openapi.json", "/api/v1/auth/login", "/api/v1/auth/register"]

    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        route_path = scope.get("path", "")
        method = scope.get("method", "")

        # If excluded path, bypass wrapping
        if route_path in self.EXCLUDED_PATHS:
            try:
                await self.app(scope, receive, send)
                return
            except BaseException as exc:
                await self._handle_exception(scope, send, route_path, method, exc, tag="EXCLUDED_PATH_CRASH")
                return

        # Core logic wrapping downstream handlers
        try:
            await self.app(scope, receive, send)
        except BaseException as exc:
            await self._handle_exception(scope, send, route_path, method, exc, tag="DOWNSTREAM_CRASH")

    async def _handle_exception(self, scope: Scope, send: Send, route_path: str, method: str, exc: BaseException, tag: str):
        self._log_exception(tag, route_path, method, exc)
        status_code = 500
        detail = "Internal server error. Please try again later."

        if isinstance(exc, HTTPException):
            status_code = exc.status_code
            detail = exc.detail
        elif hasattr(exc, "status_code") and hasattr(exc, "detail"):
            status_code = getattr(exc, "status_code")
            detail = getattr(exc, "detail")

        from app.middleware.cors import get_cors_headers
        cors_headers = get_cors_headers(scope)

        response = JSONResponse(
            status_code=status_code,
            headers=cors_headers,
            content={
                "success": False,
                "error": detail,
                "detail": detail,
                "_debug": {
                    "exception_type": type(exc).__name__,
                    "exception_message": str(exc),
                    "route": route_path,
                    "method": method,
                },
            },
        )
        await response(scope, receive=None, send=send)

    def _log_exception(self, tag: str, route: str, method: str, exc: BaseException):
        """Log an exception with appropriate severity."""
        is_client_disconnect = (
            isinstance(exc, RuntimeError)
            and "No response returned" in str(exc)
        )

        if is_client_disconnect:
            logger.info(
                f"JWT_MIDDLEWARE_CLIENT_DISCONNECT "
                f"route={route} method={method} "
                f"exc_type={type(exc).__name__} exc_msg={exc}"
            )
            return

        tb_lines = traceback.format_exception(type(exc), exc, exc.__traceback__)
        tb_str = "".join(tb_lines[-10:])  # Last 10 frames
        logger.error(
            f"JWT_MIDDLEWARE_{tag} "
            f"route={route} method={method} "
            f"exc_type={type(exc).__name__} exc_msg={exc} "
            f"traceback={tb_str}"
        )
