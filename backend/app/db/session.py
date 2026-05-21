import uuid

from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.pool import NullPool
from sqlalchemy import text

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


import ssl
import uuid

ssl_context = ssl.create_default_context()
ssl_context.check_hostname = False
ssl_context.verify_mode = ssl.CERT_NONE

# ── Async Engine (runtime) ────────────────────────────────────
engine = create_async_engine(
    _make_async_url(settings.DATABASE_POOLER_URL),
    poolclass=NullPool,
    echo=(settings.APP_ENV == "development"),
    connect_args={
        "prepared_statement_cache_size": 0,
        "prepared_statement_name_func": lambda: f"__asyncpg_{uuid.uuid4().hex}__",
        "statement_cache_size": 0,
        "prepared_statement_name_func": lambda: f"__asyncpg_{uuid.uuid4()}__",
        "ssl": ssl_context
    },   # required for Supabase pgBouncer + permissive SSL
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
    async with engine.begin() as conn:
        await conn.execute(text("SELECT 1"))
    return True
