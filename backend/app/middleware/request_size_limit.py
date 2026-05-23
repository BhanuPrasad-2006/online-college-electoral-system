"""Request body size limit middleware."""

from starlette.middleware.base import BaseHTTPMiddleware
from fastapi import Request, Response, status

class RequestBodySizeLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, max_size_bytes: int = 10 * 1024 * 1024):  # 10MB default
        super().__init__(app)
        self.max_size_bytes = max_size_bytes

    async def dispatch(self, request: Request, call_next):
        content_length = request.headers.get("content-length")
        if content_length:
            try:
                if int(content_length) > self.max_size_bytes:
                    return Response(
                        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        content="Payload Too Large. Maximum allowed size is 10MB."
                    )
            except ValueError:
                return Response(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    content="Invalid Content-Length header."
                )
        return await call_next(request)
