"""Anti-replay service — prevents vote replay attacks using tokens.

Primary store: PostgreSQL (reliable, always available).
Redis is used as an optional fast cache — skipped gracefully if unavailable.
"""

import secrets
from datetime import datetime, timezone, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.anti_replay_token import AntiReplayToken
from app.utils.logger import logger


class AntiReplayService:
    TOKEN_EXPIRY = 1800  # 30 minutes

    @staticmethod
    async def generate_token(user_id: str, db_session: AsyncSession = None) -> str:
        """Generate a one-time anti-replay token.

        Always stores in DB (reliable).
        Optionally caches in Redis for faster validation.
        """
        token = secrets.token_urlsafe(32)
        user_id_str = str(user_id)

        if db_session is None:
            raise RuntimeError("A database session is required to generate an anti-replay token.")

        expires_at = datetime.now(timezone.utc) + timedelta(seconds=AntiReplayService.TOKEN_EXPIRY)

        # Store in DB (primary store, always works)
        db_token = AntiReplayToken(
            token=token,
            user_id=user_id_str,
            expires_at=expires_at,
        )
        db_session.add(db_token)
        try:
            await db_session.commit()
        except Exception as e:
            await db_session.rollback()
            logger.error(f"Failed to store anti-replay token in DB: {e}")
            raise RuntimeError("Failed to generate security token. Please try again.") from e

        # Optionally cache in Redis (best-effort, never blocks the response)
        try:
            from app.core.redis import redis_client
            await redis_client.setex(
                f"anti_replay:{token}",
                AntiReplayService.TOKEN_EXPIRY,
                user_id_str,
            )
        except Exception:
            pass  # Redis unavailable — DB is sufficient

        return token

    @staticmethod
    async def validate_and_consume(
        token: str,
        user_id: str,
        db_session: AsyncSession = None,
        consume: bool = True,
    ) -> bool:
        """Validate and consume an anti-replay token (one-time use).

        1. Check Redis cache first (fast path).
        2. If not in Redis, check DB.
        3. Delete on success (only if consume is True).
        """
        user_id_str = str(user_id)

        if db_session is None:
            logger.error("No database session provided for anti-replay validation.")
            return False

        # ── Step 1: Try Redis fast-path ────────────────────────
        try:
            from app.core.redis import redis_client
            stored = await redis_client.get(f"anti_replay:{token}")
            if stored is not None:
                if isinstance(stored, bytes):
                    stored = stored.decode("utf-8")
                if str(stored) != user_id_str:
                    return False
                if consume:
                    await redis_client.delete(f"anti_replay:{token}")
                return True
        except Exception:
            pass  # Redis unavailable — continue to DB

        # ── Step 2: Check DB (primary store) ───────────────────
        query = select(AntiReplayToken).where(AntiReplayToken.token == token)
        result = await db_session.execute(query)
        db_token = result.scalar_one_or_none()

        if not db_token:
            return False

        # ── Step 3: Validate expiry ────────────────────────────
        now = datetime.now(timezone.utc)
        expires_at = db_token.expires_at

        # Normalize to timezone-aware UTC for comparison
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(timezone.utc)
        else:
            expires_at = expires_at.astimezone(timezone.utc)

        if str(db_token.user_id) != user_id_str or expires_at < now:
            # Token is invalid or expired — delete it anyway
            await db_session.delete(db_token)
            await db_session.commit()
            return False

        # ── Step 4: Consume the token (delete from DB) ─────────
        if consume:
            await db_session.delete(db_token)
            try:
                await db_session.commit()
            except Exception as e:
                await db_session.rollback()
                logger.error(f"Failed to consume anti-replay token: {e}")
                return False

        return True
