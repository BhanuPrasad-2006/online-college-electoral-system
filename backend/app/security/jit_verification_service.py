"""JIT verification service — just-in-time identity verification before voting."""

import secrets
from app.core.redis import redis_client


class JITVerificationService:
    TOKEN_EXPIRY = 600  # 10 minutes

    @staticmethod
    async def request_verification(user_id: str) -> str:
        """Generate a JIT verification token."""
        token = secrets.token_urlsafe(32)
        await redis_client.setex(f"jit:{token}", JITVerificationService.TOKEN_EXPIRY, user_id)
        return token

    @staticmethod
    async def verify(token: str, user_id: str) -> bool:
        """Verify a JIT token."""
        stored = await redis_client.get(f"jit:{token}")
        if stored != user_id:
            return False
        await redis_client.delete(f"jit:{token}")
        return True
