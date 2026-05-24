import uuid
import ssl

from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.pool import NullPool, AsyncAdaptedQueuePool
from sqlalchemy import text

from app.core.config import settings


def _make_async_url(url: str) -> str:
    if url.startswith("postgresql+asyncpg://"):
        return url
    if url.startswith("postgresql+psycopg2://"):
        return url.replace("postgresql+psycopg2://", "postgresql+asyncpg://", 1)
    if url.startswith("postgresql://"):
        return url.replace("postgresql://", "postgresql+asyncpg://", 1)
    return url


def _db_url() -> str:
    return _make_async_url(settings.DATABASE_POOLER_URL or settings.DATABASE_URL)


def _use_null_pool(url: str) -> bool:
    """Supabase transaction pooler (port 6543) requires NullPool on the client."""
    return ":6543" in url or "pooler.supabase.com" in url and ":5432" not in url


ssl_context = ssl.create_default_context()
ssl_context.check_hostname = False
ssl_context.verify_mode = ssl.CERT_NONE

_connect_args = {
    "prepared_statement_cache_size": 0,
    "prepared_statement_name_func": lambda: f"__asyncpg_{uuid.uuid4().hex}__",
    "statement_cache_size": 0,
    "ssl": ssl_context,
}

_db_url_resolved = _db_url()
_engine_kwargs: dict = {
    "echo": settings.APP_ENV == "development",
    "connect_args": _connect_args,
}

if _use_null_pool(_db_url_resolved):
    _engine_kwargs["poolclass"] = NullPool
else:
    _engine_kwargs.update(
        poolclass=AsyncAdaptedQueuePool,
        pool_size=25,
        max_overflow=50,
        pool_pre_ping=True,
        pool_recycle=300,
    )

engine = create_async_engine(_db_url_resolved, **_engine_kwargs)

SessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def get_db():
    """Yield an async session; auto-commit on success, rollback on error."""
    async with SessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def check_db_connection() -> bool:
    """Async check — verifies database is reachable."""
    async with engine.begin() as conn:
        await conn.execute(text("SELECT 1"))
    return True
