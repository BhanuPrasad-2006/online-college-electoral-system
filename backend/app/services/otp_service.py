"""OTP service — generates and verifies one-time passwords."""

import random
import string
from datetime import datetime, timedelta
from app.core.constants import OTP_EXPIRY_MINUTES, OTP_LENGTH


class OTPService:
    @staticmethod
    def generate_otp() -> str:
        """Generate a random numeric OTP."""
        return ''.join(random.choices(string.digits, k=OTP_LENGTH))

    @staticmethod
    def is_expired(created_at: datetime) -> bool:
        """Check if OTP has expired."""
        return datetime.utcnow() > created_at + timedelta(minutes=OTP_EXPIRY_MINUTES)

    async def send_otp(self, email: str, purpose: str):
        """Generate and send OTP via email."""
        # TODO: Generate OTP, hash it, store in DB, send via email
        pass

    async def verify_otp(self, email: str, otp: str, purpose: str) -> bool:
        """Verify OTP code."""
        # TODO: Look up stored OTP, verify hash, check expiry
        pass
