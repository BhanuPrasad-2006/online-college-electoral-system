"""Security headers middleware — pure ASGI implementation."""

from starlette.types import ASGIApp, Scope, Receive, Send, Message


class SecurityHeadersMiddleware:
    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        route_path = scope.get("path", "")

        async def wrapped_send(message: Message) -> None:
            if message["type"] == "http.response.start":
                # Convert list of headers to a lowercase dict for easy manipulation
                headers = {}
                for k, v in message.get("headers", []):
                    headers[k.lower()] = v

                headers[b"x-content-type-options"] = b"nosniff"
                if not route_path.startswith("/uploads"):
                    headers[b"x-frame-options"] = b"DENY"
                    headers[b"x-xss-protection"] = b"1; mode=block"
                else:
                    if b"x-frame-options" in headers:
                        del headers[b"x-frame-options"]

                headers[b"strict-transport-security"] = b"max-age=31536000; includeSubDomains"
                headers[b"referrer-policy"] = b"strict-origin-when-cross-origin"
                headers[b"permissions-policy"] = b"camera=*, microphone=(), geolocation=(), interest-cohort=()"

                # Content-Security-Policy (CSP) Configuration
                if route_path.startswith("/docs") or route_path.startswith("/redoc") or route_path.startswith("/openapi.json"):
                    headers[b"content-security-policy"] = (
                        b"default-src 'self'; "
                        b"script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net; "
                        b"style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
                        b"img-src 'self' data: https://fastapi.tiangolo.com; "
                        b"connect-src 'self';"
                    )
                elif route_path.startswith("/uploads"):
                    headers[b"content-security-policy"] = (
                        b"default-src 'self'; "
                        b"script-src 'none'; "
                        b"style-src 'self' 'unsafe-inline'; "
                        b"img-src 'self' data: blob: http://localhost:5173 http://127.0.0.1:5173; "
                        b"media-src 'self' data: blob: http://localhost:5173 http://127.0.0.1:5173; "
                        b"frame-ancestors 'self' http://localhost:5173 http://127.0.0.1:5173; "
                        b"connect-src 'self';"
                    )
                else:
                    headers[b"content-security-policy"] = (
                        b"default-src 'self'; "
                        b"script-src 'none'; "
                        b"style-src 'none'; "
                        b"img-src 'self' data:; "
                        b"connect-src 'self'; "
                        b"frame-ancestors 'none';"
                    )

                # Re-pack headers list
                message["headers"] = [(k, v) for k, v in headers.items()]

            await send(message)

        await self.app(scope, receive, wrapped_send)
