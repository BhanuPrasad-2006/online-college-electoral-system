"""JWT service — token creation and validation wrapper."""

from app.core.security import create_access_token, create_refresh_token, decode_token


class JWTService:
    @staticmethod
    def create_tokens(user_id: str, role: str) -> dict:
        """Create access and refresh token pair."""
        data = {"sub": user_id, "role": role}
        return {
            "access_token": create_access_token(data),
            "refresh_token": create_refresh_token(data),
            "token_type": "bearer",
        }

    @staticmethod
    def decode(token: str) -> dict:
        """Decode and validate a JWT token."""
        return decode_token(token)
