"""Token generator utilities."""

import secrets
import string


def generate_token(length: int = 32) -> str:
    """Generate a URL-safe random token."""
    return secrets.token_urlsafe(length)


def generate_numeric_code(length: int = 6) -> str:
    """Generate a numeric code (e.g., for OTP)."""
    return ''.join(secrets.choice(string.digits) for _ in range(length))
