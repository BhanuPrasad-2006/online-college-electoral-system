"""CORS configuration."""

import re
from typing import Dict, Any, Union
from fastapi import Request
from app.core.config import settings

CORS_CONFIG = {
    "allow_origins": settings.ALLOWED_ORIGINS,
    "allow_credentials": True,
    "allow_methods": ["*"],
    "allow_headers": ["*"],
}

ALLOWED_ORIGINS_SET = set(settings.ALLOWED_ORIGINS)
ORIGIN_REGEX = re.compile(
    r"(^https://.*\.vercel\.app$)"
    r"|(^http://localhost(:\d+)?$)"
    r"|(^http://127\.0\.0\.1(:\d+)?$)"
    r"|(^http://192\.168\.\d+\.\d+(:\d+)?$)"
    r"|(^http://10\.\d+\.\d+\.\d+(:\d+)?$)"
    r"|(^http://172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+(:\d+)?$)"
)

def get_cors_headers_from_origin(origin: str | None) -> Dict[str, str]:
    if not origin:
        return {}
    
    # Check if origin is allowed
    is_allowed = False
    if origin in ALLOWED_ORIGINS_SET:
        is_allowed = True
    elif ORIGIN_REGEX.match(origin):
        is_allowed = True
        
    if is_allowed:
        return {
            "Access-Control-Allow-Origin": origin,
            "Access-Control-Allow-Credentials": "true",
            "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS, PATCH",
            "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept, Origin, X-Requested-With, X-CSRF-Token, x-csrf-token, X-Device-Fingerprint",
        }
    return {}

def get_cors_headers(request_or_scope: Union[Request, dict, Any]) -> Dict[str, str]:
    origin = None
    if isinstance(request_or_scope, Request):
        origin = request_or_scope.headers.get("origin")
    elif isinstance(request_or_scope, dict) and "headers" in request_or_scope:
        # Check ASGI scope headers
        headers_list = request_or_scope.get("headers", [])
        for k, v in headers_list:
            if k == b"origin":
                origin = v.decode("utf-8")
                break
    elif hasattr(request_or_scope, "headers"):
        origin = getattr(request_or_scope.headers, "get", lambda x: None)("origin")
        
    return get_cors_headers_from_origin(origin)

