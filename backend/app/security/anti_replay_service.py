"""Anti-replay service — prevents vote replay attacks using tokens."""

import secrets
from datetime import datetime, timezone, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from app.core.redis import redis_client
from app.models.anti_replay_token import AntiReplayToken
from app.utils.logger import logger

class AntiReplayService:
    TOKEN_EXPIRY = 300  # 5 minutes

    @staticmethod
    async def generate_token(user_id: str, db_session: AsyncSession = None) -> str:
        """Generate a one-time anti-replay token."""
        token = secrets.token_urlsafe(32)
        user_id_str = str(user_id)
        try:
            # Try to store in Redis
            await redis_client.setex(f"anti_replay:{token}", AntiReplayService.TOKEN_EXPIRY, user_id_str)
        except Exception as e:
            # Fallback to DB
            logger.warning(f"Redis error during generate_token, falling back to DB: {e}")
            if db_session is not None:
                expires_at = datetime.now(timezone.utc) + timedelta(seconds=AntiReplayService.TOKEN_EXPIRY)
                db_token = AntiReplayToken(token=token, user_id=user_id_str, expires_at=expires_at)
                db_session.add(db_token)
                await db_session.commit()
            else:
                logger.error("No database session provided for anti-replay fallback.")
                raise e
        return token

    @staticmethod
    async def validate_and_consume(token: str, user_id: str, db_session: AsyncSession = None) -> bool:
        """Validate and consume an anti-replay token (one-time use)."""
        user_id_str = str(user_id)
        try:
            # Try Redis first
            stored = await redis_client.get(f"anti_replay:{token}")
            if stored is not None:
                if isinstance(stored, bytes):
                    stored = stored.decode("utf-8")
                if str(stored) != user_id_str:
                    return False
                await redis_client.delete(f"anti_replay:{token}")
                return True
        except Exception as e:
            logger.warning(f"Redis error during validate_and_consume, checking DB: {e}")
            
        # Fallback/fallback check in DB
        if db_session is not None:
            # Cleanup expired tokens while we're here
            now = datetime.now(timezone.utc)
            try:
                await db_session.execute(delete(AntiReplayToken).where(AntiReplayToken.expires_at < now))
            except Exception as clean_err:
                logger.error(f"Error during expired anti-replay tokens cleanup: {clean_err}")
            
            # Find the token
            query = select(AntiReplayToken).where(AntiReplayToken.token == token)
            result = await db_session.execute(query)
            db_token = result.scalar_one_or_none()
            if db_token:
                # Normalize datetimes to naive UTC for Python comparison
                expires_at_naive = db_token.expires_at.astimezone(timezone.utc).replace(tzinfo=None) if db_token.expires_at.tzinfo else db_token.expires_at
                now_naive = now.replace(tzinfo=None)
                if str(db_token.user_id) != user_id_str or expires_at_naive < now_naive:
                    return False
                # Consume it (delete)
                await db_session.delete(db_token)
                await db_session.commit()
                return True
        else:
            logger.error("No database session provided for anti-replay validation.")
        return False
