"""Audit middleware — logs all API requests for accountability to database."""

import re
import json
from fastapi import Request
from starlette.types import ASGIApp, Scope, Receive, Send, Message
import structlog

from app.db.session import SessionLocal
from app.middleware.rate_limit import get_client_ip

logger = structlog.get_logger()

SENSITIVE_KEYS = {
    "password", "pass", "pwd", "otp", "code", "token", "jwt",
    "access_token", "face", "image", "face_image", "photo",
    "verification_id", "private_key", "secret", "cvv", "card",
    "manifesto"
}

def sanitize_dict(d):
    if not isinstance(d, dict):
        return d
    sanitized = {}
    for k, v in d.items():
        k_lower = k.lower()
        is_sensitive = any(s in k_lower for s in SENSITIVE_KEYS)
        if is_sensitive:
            sanitized[k] = "[REDACTED]"
        elif isinstance(v, dict):
            sanitized[k] = sanitize_dict(v)
        elif isinstance(v, list):
            sanitized[k] = [sanitize_dict(item) if isinstance(item, dict) else item for item in v]
        else:
            sanitized[k] = v
    return sanitized

def sanitize_payload(payload_str: str) -> str:
    if not payload_str:
        return ""
    # Try parsing as JSON first
    try:
        data = json.loads(payload_str)
        if isinstance(data, dict):
            return json.dumps(sanitize_dict(data))
        elif isinstance(data, list):
            return json.dumps([sanitize_dict(item) if isinstance(item, dict) else item for item in data])
    except Exception:
        pass

    # Regex fallback
    sanitized = payload_str
    for key in SENSITIVE_KEYS:
        # Match key=value or key:value patterns and replace the value
        sanitized = re.sub(
            rf"({key})[\s:=]+[^&\s,}}]+",
            r"\1=[REDACTED]",
            sanitized,
            flags=re.IGNORECASE
        )
    return sanitized

def sanitize_url(url: str) -> str:
    parts = url.split("?", 1)
    if len(parts) < 2:
        return url
    base, query = parts
    sanitized_query = sanitize_payload(query)
    return f"{base}?{sanitized_query}"


class AuditMiddleware:
    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        # Reconstruct request wrapper for metadata extraction
        request = Request(scope, receive)
        method = request.method

        # Track the incoming request body chunks
        body_chunks = []
        
        async def wrapped_receive() -> Message:
            message = await receive()
            if message["type"] == "http.request":
                body_chunks.append(message.get("body", b""))
            return message

        # Track response status code
        status_code = [200]
        
        async def wrapped_send(message: Message) -> None:
            if message["type"] == "http.response.start":
                status_code[0] = message.get("status", 200)
            await send(message)

        # Call the application with intercepted channels
        try:
            await self.app(scope, wrapped_receive, wrapped_send)
        except Exception as exc:
            # Ensure log is written on crash
            await self._persist_log(request, body_chunks, 500)
            raise exc

        # Check if we should audit log this request
        if method in ["POST", "PUT", "DELETE", "PATCH"] or status_code[0] >= 400:
            await self._persist_log(request, body_chunks, status_code[0])

    async def _persist_log(self, request: Request, body_chunks: list[bytes], status_code: int):
        body_bytes = b"".join(body_chunks)
        body_str = body_bytes.decode("utf-8", errors="ignore")
        
        sanitized_body = sanitize_payload(body_str)
        sanitized_path = sanitize_url(str(request.url))
        ip_address = get_client_ip(request)

        # Extract actor_id from Authorization header if available
        actor_id = None
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.lower().startswith("bearer "):
            token = auth_header.split(" ", 1)[1].strip()
            try:
                from app.security.jwt_service import decode_access_token
                payload = decode_access_token(token)
                actor_id = payload.get("sub")
            except Exception:
                pass

        # Log to stdout
        logger.info(
            "api_audit_log",
            method=request.method,
            path=sanitized_path,
            ip=ip_address,
            actor_id=actor_id,
            status_code=status_code
        )

        # Write to Database
        try:
            event_type = f"HTTP_{request.method}"
            if status_code >= 400:
                event_type = f"HTTP_{request.method}_ERROR"
                
            description = f"Path: {sanitized_path} | Status: {status_code} | Body: {sanitized_body}"
            
            async with SessionLocal() as db:
                from app.security.audit_service import AuditService
                audit_service = AuditService(db)
                await audit_service.log(
                    event_type=event_type[:80],
                    actor_id=actor_id,
                    description=description,
                    ip_address=ip_address
                )
        except Exception as e:
            logger.error("Failed to write audit log to database", error=str(e))
