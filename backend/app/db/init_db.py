from sqlalchemy import inspect

from app.db.session import engine
from app.db.base import Base                    # the actual declarative base
import app.db.base  # noqa: F401 — registers all models with Base.metadata

from app.utils.logger import logger


EXPECTED_TABLES = [
    "admin_users",
    "voters",
    "elections",
    "positions",
    "candidates",
    "manifestos",
    "votes",
    "concerns",
    "otp_requests",
    "audit_logs",
    "ai_reports",
    "ai_alerts",
    "vote_stats",
    "anti_replay_tokens",
    "announcements",
]


async def verify_tables() -> None:
    """
    Checks all expected tables exist in Supabase.
    Does NOT create tables — schema is managed via SQL editor / Alembic.
    Raises on missing tables so the app fails fast at startup.
    """
    async with engine.connect() as conn:
        # Run sync inspect in the async greenlet
        existing = await conn.run_sync(
            lambda sync_conn: set(inspect(sync_conn).get_table_names())
        )

    missing = [t for t in EXPECTED_TABLES if t not in existing]

    if missing:
        raise RuntimeError(
            f"Missing tables in database: {missing}\n"
            f"Run 01_schema.sql in Supabase SQL editor first."
        )

    logger.info(f"All {len(EXPECTED_TABLES)} tables verified in Supabase.")


async def init_db() -> None:
    """Entry point called from main.py on startup."""
    await verify_tables()