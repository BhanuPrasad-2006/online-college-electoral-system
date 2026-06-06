"""Request body size limit middleware — pure ASGI implementation."""

from starlette.types import ASGIApp, Scope, Receive, Send
from starlette.responses import Response


class RequestBodySizeLimitMiddleware:
    def __init__(self, app: ASGIApp, max_size_bytes: int = 10 * 1024 * 1024):  # 10MB default
        self.app = app
        self.max_size_bytes = max_size_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        # Extract content-length header
        headers = dict(scope.get("headers", []))
        content_length_bytes = headers.get(b"content-length")

        if content_length_bytes:
            try:
                content_length = int(content_length_bytes.decode("latin-1"))
                if content_length > self.max_size_bytes:
                    response = Response(
                        status_code=413,
                        content="Payload Too Large. Maximum allowed size is 10MB."
                    )
                    await response(scope, receive, send)
                    return
            except ValueError:
                response = Response(
                    status_code=400,
                    content="Invalid Content-Length header."
                )
                await response(scope, receive, send)
                return

        await self.app(scope, receive, send)
