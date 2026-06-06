"""
Device fingerprinting service for token binding.

Generates a deterministic fingerprint hash from request headers
and validates it against a stored fingerprint in JWT claims.
"""

import hashlib
import json
from typing import Optional

from fastapi import HTTPException, Request, status

from app.core.config import settings


FINGERPRINT_HEADER = "X-Client-Signature"


def generate_fingerprint(request: Request) -> str:
    """
    Generate a device fingerprint from request headers.

    Combines browser-provided signals into a deterministic hash.
    The client-side script sends these as a single header value.
    """
    fingerprint_raw = request.headers.get(FINGERPRINT_HEADER, "")
    if fingerprint_raw:
        return hashlib.sha256(fingerprint_raw.encode("utf-8")).hexdigest()

    signals = {
        "ua": request.headers.get("user-agent", ""),
        "accept": request.headers.get("accept", ""),
        "accept-language": request.headers.get("accept-language", ""),
        "accept-encoding": request.headers.get("accept-encoding", ""),
        "sec-ch-ua": request.headers.get("sec-ch-ua", ""),
        "sec-ch-ua-platform": request.headers.get("sec-ch-ua-platform", ""),
        "sec-ch-ua-mobile": request.headers.get("sec-ch-ua-mobile", ""),
        "ip": _get_client_ip(request),
    }
    raw = json.dumps(signals, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def validate_fingerprint(request: Request, token_fingerprint: Optional[str]) -> None:
    """
    Validate the request's device fingerprint against the one stored in the JWT.

    This check is disabled by default in the current app configuration.
    """
    if not settings.ENABLE_DEVICE_FINGERPRINT_BINDING:
        return

    if not token_fingerprint:
        return

    current_fp = generate_fingerprint(request)
    if current_fp != token_fingerprint:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Device fingerprint mismatch. Please log in again.",
        )


def _get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    real_ip = request.headers.get("x-real-ip")
    if real_ip:
        return real_ip.strip()
    return request.client.host if request.client else "127.0.0.1"
