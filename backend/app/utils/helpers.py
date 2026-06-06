"""General helper utilities."""

import re
from datetime import datetime
from fastapi import Request


# Valid IPv4/IPv6 patterns for X-Forwarded-For validation
_IP_PATTERN = re.compile(
    r"^([0-9a-fA-F:.]+|[a-zA-Z0-9._-]+)$"
)


def extract_client_ip(request: Request) -> str:
    """
    Extract the true client IP from a request, with X-Forwarded-For hardening.

    When behind a reverse proxy (nginx, Cloudflare, etc.), the real client IP
    is in the ``X-Forwarded-For`` header.  This function:

    1. Validates the header format (no newlines, valid IP or hostname).
    2. Limits the chain depth to 3 entries to prevent header injection.
    3. Takes the *leftmost* (original client) entry, as per the spec.
    4. Falls back to ``request.client.host`` when no header is present.

    Returns a sanitized IP string suitable for audit logging.
    """
    xff = request.headers.get("x-forwarded-for")
    if xff:
        # Anti-injection: reject headers containing newlines or null bytes
        if any(c in xff for c in ("\n", "\r", "\x00")):
            # Malicious header — ignore entirely
            pass
        else:
            # Split chain, limit depth, and validate each entry
            parts = [p.strip() for p in xff.split(",")][:3]
            for part in parts:
                if _IP_PATTERN.match(part) and part:
                    return part

    return request.client.host if request.client else "127.0.0.1"


def utcnow() -> datetime:
    """Get current UTC datetime."""
    return datetime.utcnow()


def paginate(query, page: int, page_size: int):
    """Apply pagination to a SQLAlchemy query."""
    offset = (page - 1) * page_size
    return query.offset(offset).limit(page_size)
