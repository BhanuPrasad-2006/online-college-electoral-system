"""OTP abuse prevention service with rate limiting and lockout."""

from datetime import datetime, timedelta, timezone

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.otp_attempt import OTPAttempt
from app.utils.logger import logger


class OTPAbuseService:
    """
    Guards OTP endpoints against abuse:
    - Send cooldown: minimum interval between OTP sends
    - Verify attempt limits: max failed verifies before temp lockout
    - Hourly send cap: max OTP sends per recipient per hour
    """

    @staticmethod
    async def check_resend_cooldown(
        db: AsyncSession,
        recipient: str,
    ) -> tuple[bool, str]:
        """
        Check if enough time has passed since the last OTP send.
        Returns (allowed, message).
        """
        cutoff = datetime.now(timezone.utc) - timedelta(
            seconds=settings.OTP_RESEND_COOLDOWN_SECONDS
        )
        stmt = select(func.count()).select_from(OTPAttempt).where(
            OTPAttempt.recipient == recipient,
            OTPAttempt.attempt_type == "send",
            OTPAttempt.created_at > cutoff,
        )
        result = await db.execute(stmt)
        count = result.scalar() or 0
        if count > 0:
            return False, f"Please wait {settings.OTP_RESEND_COOLDOWN_SECONDS}s before requesting another OTP."
        return True, ""

    @staticmethod
    async def check_send_cooldown(
        db: AsyncSession,
        recipient: str,
    ) -> tuple[bool, str, int]:
        """
        Check send cooldown with remaining value.
        Returns (allowed, message, remaining_seconds).
        """
        allowed, msg = await OTPAbuseService.check_resend_cooldown(db, recipient)
        if not allowed:
            return False, msg, settings.OTP_RESEND_COOLDOWN_SECONDS
        return True, "", 0

    @staticmethod
    async def check_verify_attempts(
        db: AsyncSession,
        recipient: str,
    ) -> tuple[bool, str, bool]:
        """
        Check if the recipient has exceeded max failed verify attempts.
        Returns (allowed, message, locked).
        """
        window = datetime.now(timezone.utc) - timedelta(
            minutes=settings.OTP_LOCKOUT_MINUTES
        )
        stmt = select(func.count()).select_from(OTPAttempt).where(
            OTPAttempt.recipient == recipient,
            OTPAttempt.attempt_type == "verify",
            OTPAttempt.success == False,
            OTPAttempt.created_at > window,
        )
        result = await db.execute(stmt)
        failed_count = result.scalar() or 0

        if failed_count >= settings.OTP_MAX_ATTEMPTS:
            return (
                False,
                f"Too many failed attempts. Account locked for {settings.OTP_LOCKOUT_MINUTES} minutes.",
                True,
            )
        return True, "", False

    @staticmethod
    async def record_attempt(
        db: AsyncSession,
        recipient: str,
        attempt_type: str,
        success: bool,
        ip_address: str | None = None,
    ) -> None:
        """
        Record an OTP attempt (send or verify) in the database.
        """
        attempt = OTPAttempt(
            recipient=recipient,
            attempt_type=attempt_type,
            success=success,
            ip_address=ip_address,
            created_at=datetime.now(timezone.utc),
        )
        db.add(attempt)
        await db.commit()

    @staticmethod
    async def check_hourly_send_limit(
        db: AsyncSession,
        recipient: str,
    ) -> tuple[bool, str]:
        """
        Check if the recipient has exceeded the max sends per hour.
        Returns (allowed, message).
        """
        cutoff = datetime.now(timezone.utc) - timedelta(hours=1)
        stmt = select(func.count()).select_from(OTPAttempt).where(
            OTPAttempt.recipient == recipient,
            OTPAttempt.attempt_type == "send",
            OTPAttempt.created_at > cutoff,
        )
        result = await db.execute(stmt)
        count = result.scalar() or 0
        if count >= settings.OTP_MAX_SENDS_PER_HOUR:
            return False, "OTP send limit reached for this hour. Please try again later."
        return True, ""
