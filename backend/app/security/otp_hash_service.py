"""OTP hash service — secure OTP storage and verification using bcrypt."""

import bcrypt
from datetime import datetime, timedelta
from app.core.constants import OTP_EXPIRY_MINUTES


class OTPHashService:
    @staticmethod
    def hash_otp(otp: str) -> str:
        """Hash an OTP code using bcrypt for secure storage."""
        return bcrypt.hashpw(otp.encode(), bcrypt.gensalt()).decode()

    @staticmethod
    def verify_otp(otp: str, hashed: str) -> bool:
        """Verify an OTP against its stored bcrypt hash."""
        return bcrypt.checkpw(otp.encode(), hashed.encode())

    @staticmethod
    def is_expired(created_at: datetime) -> bool:
        """Check if the OTP has expired."""
        return datetime.utcnow() > created_at + timedelta(minutes=OTP_EXPIRY_MINUTES)

    @staticmethod
    def check_rate_limit(attempts: int, max_attempts: int = 5) -> bool:
        """Check if OTP verification attempts have been exceeded."""
        return attempts >= max_attempts
