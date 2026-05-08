"""Anti-replay service — prevents vote replay attacks using tokens."""

import secrets
from app.core.redis import redis_client


class AntiReplayService:
    TOKEN_EXPIRY = 300  # 5 minutes

    @staticmethod
    async def generate_token(user_id: str) -> str:
        """Generate a one-time anti-replay token."""
        token = secrets.token_urlsafe(32)
        await redis_client.setex(f"anti_replay:{token}", AntiReplayService.TOKEN_EXPIRY, user_id)
        return token

    @staticmethod
    async def validate_and_consume(token: str, user_id: str) -> bool:
        """Validate and consume an anti-replay token (one-time use)."""
        stored = await redis_client.get(f"anti_replay:{token}")
        if stored != user_id:
            return False
        await redis_client.delete(f"anti_replay:{token}")
        return True
