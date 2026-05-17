from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy import text
import logging
logger = logging.getLogger(__name__)
from uuid import uuid4  # <-- Add this import at the top of your file

from app.core.config import settings


# ── URL conversion ────────────────────────────────────────────
# Supabase provides postgresql:// URLs. Convert for asyncpg.
def _make_async_url(url: str) -> str:
    if url.startswith("postgresql+asyncpg://"):
        return url
    if url.startswith("postgresql+psycopg2://"):
        return url.replace("postgresql+psycopg2://", "postgresql+asyncpg://", 1)
    if url.startswith("postgresql://"):
        return url.replace("postgresql://", "postgresql+asyncpg://", 1)
    return url


# ── Async Engine (runtime) ────────────────────────────────────
engine = create_async_engine(
    _make_async_url(settings.DATABASE_POOLER_URL),
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
    pool_recycle=300,
    echo=(settings.APP_ENV == "development"),
    connect_args={
        "statement_cache_size": 0,
        "prepared_statement_cache_size": 0,
        # This completely randomizes statement names so pgBouncer can never throw duplicate name conflicts
        "prepared_statement_name_func": lambda: f"__asyncpg_{uuid4()}__",
    },   
)

SessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


# ── FastAPI Dependency ────────────────────────────────────────
async def get_db():
    """Yield an async session; auto-commit on success, rollback on error."""
    async with SessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


# ── Health Check (async) ──────────────────────────────────────
async def check_db_connection() -> bool:
    """Async check — verifies Supabase is reachable."""
    try:
        async with engine.connect() as conn:
            await conn.exec_driver_sql("SELECT 1")
        return True
    except Exception as e:
        logger.warning(f"Database startup ping returned a warning/error: {e}. Proceeding anyway.")
        return False