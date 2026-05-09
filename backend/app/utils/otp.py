import os
import random
import string
import hashlib
import hmac
from datetime import datetime, timedelta
from typing import Optional

OTP_LENGTH = int(os.getenv("OTP_LENGTH", 6))
OTP_EXPIRY_MINUTES = int(os.getenv("OTP_EXPIRY_MINUTES", 10))
OTP_SECRET = os.getenv("OTP_SECRET", "otp-secret-change-in-production")

# In-memory store for demo purposes; replace with Redis/DB in production
_otp_store: dict[str, dict] = {}


def generate_otp(length: int = OTP_LENGTH) -> str:
    """Generate a random numeric OTP of the given length."""
    return "".join(random.choices(string.digits, k=length))


def _hash_otp(otp: str) -> str:
    """HMAC-SHA256 hash of the OTP using the shared secret."""
    return hmac.new(OTP_SECRET.encode(), otp.encode(), hashlib.sha256).hexdigest()


def store_otp(identifier: str, otp: str) -> None:
    """Store a hashed OTP for the given identifier (e.g. voter email/phone)."""
    _otp_store[identifier] = {
        "hash": _hash_otp(otp),
        "expires_at": datetime.utcnow() + timedelta(minutes=OTP_EXPIRY_MINUTES),
    }


def verify_otp(identifier: str, otp: str) -> bool:
    """Verify a submitted OTP for the given identifier. Deletes the entry on success."""
    record = _otp_store.get(identifier)
    if not record:
        return False
    if datetime.utcnow() > record["expires_at"]:
        _otp_store.pop(identifier, None)
        return False
    if hmac.compare_digest(record["hash"], _hash_otp(otp)):
        _otp_store.pop(identifier, None)
        return True
    return False


def invalidate_otp(identifier: str) -> None:
    """Manually invalidate a stored OTP for the given identifier."""
    _otp_store.pop(identifier, None)
