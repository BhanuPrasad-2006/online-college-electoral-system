"""TOTP service — Time-based One-Time Password for 2FA."""

import pyotp


class TOTPService:
    @staticmethod
    def generate_secret() -> str:
        """Generate a new TOTP secret."""
        return pyotp.random_base32()

    @staticmethod
    def get_provisioning_uri(secret: str, email: str) -> str:
        """Generate QR code provisioning URI."""
        totp = pyotp.TOTP(secret)
        return totp.provisioning_uri(email, issuer_name="College Election System")

    @staticmethod
    def verify(secret: str, code: str) -> bool:
        """Verify a TOTP code."""
        totp = pyotp.TOTP(secret)
        return totp.verify(code)
