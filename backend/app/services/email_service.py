"""Email service — sends emails via SMTP."""

from app.core.config import settings


class EmailService:
    async def send_otp(self, email: str, otp: str):
        """Send OTP code via email."""
        # TODO: Implement SMTP sending
        pass

    async def send_verification(self, email: str, link: str):
        """Send account verification email."""
        pass

    async def send_notification(self, email: str, subject: str, body: str):
        """Send general notification email."""
        pass
