"""SMS service — sends OTP via SMS for candidate mobile verification."""

import httpx
from app.core.config import settings


class SMSService:
    def __init__(self):
        self.api_key = getattr(settings, "SMS_API_KEY", "")
        self.sender_id = getattr(settings, "SMS_SENDER_ID", "ELECTN")

    async def send_otp(self, phone: str, otp: str) -> bool:
        """Send OTP code via SMS to the given phone number."""
        # TODO: Integrate with SMS gateway (Twilio, MSG91, etc.)
        try:
            message = f"Your College Election verification code is: {otp}. Valid for 10 minutes."
            # Placeholder for SMS API call
            print(f"[SMS] Sending to {phone}: {message}")
            return True
        except Exception as e:
            print(f"[SMS] Failed to send to {phone}: {e}")
            return False

    async def send_notification(self, phone: str, message: str) -> bool:
        """Send a generic SMS notification."""
        try:
            print(f"[SMS] Notification to {phone}: {message}")
            return True
        except Exception as e:
            print(f"[SMS] Notification failed for {phone}: {e}")
            return False
