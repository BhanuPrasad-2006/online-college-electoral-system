from sqlalchemy import inspect
from app.db.session import engine
from app.db.base import Base   # imports all models
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
]


def verify_tables() -> None:
    """
    Checks all expected tables exist in Supabase.
    Does NOT create tables — schema is managed via SQL editor / Alembic.
    Raises on missing tables so the app fails fast at startup.
    """
    inspector    = inspect(engine)
    existing     = set(inspector.get_table_names())
    missing      = [t for t in EXPECTED_TABLES if t not in existing]

    if missing:
        raise RuntimeError(
            f"Missing tables in database: {missing}\n"
            f"Run 01_schema.sql in Supabase SQL editor first."
        )

    logger.info(f"✅ All {len(EXPECTED_TABLES)} tables verified in Supabase.")


def init_db() -> None:
    """
    Entry point called from main.py on startup.
    """
    verify_tables()