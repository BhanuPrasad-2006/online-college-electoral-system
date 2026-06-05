import uuid
import ssl
import asyncio
import logging

from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.pool import NullPool, AsyncAdaptedQueuePool
from sqlalchemy import text, event

from app.core.config import settings

logger = logging.getLogger(__name__)

# ── URL helpers ─────────────────────────────────────────────────

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


# ── SSL context (relaxed cert verification for cloud-hosted DBs) ─
ssl_context = ssl.create_default_context()
ssl_context.check_hostname = False
ssl_context.verify_mode = ssl.CERT_NONE

# ── Connection arguments ────────────────────────────────────
# - prepared_statement_cache_size=0 disables asyncpg's statement cache
#   (required for Supabase transaction pooler which doesn't support DEALLOCATE)
# - statement_cache_size=0 disables SQLAlchemy's statement cache
# - timeout=30  connection timeout (seconds) — prevents indefinite TCP hangs
# - command_timeout=60  default query timeout (seconds) — catches runaway queries
# - ssl=ssl_context uses relaxed cert verification
_connect_args = {
    "prepared_statement_cache_size": 0,
    "prepared_statement_name_func": lambda: f"__asyncpg_{uuid.uuid4().hex}__",
    "statement_cache_size": 0,
    "timeout": 60,
    "command_timeout": 60,
    "ssl": ssl_context,
}

_db_url_resolved = _db_url()

# Parse host and DB name for startup logging
_db_host = "unknown"
_db_name = "unknown"
try:
    # Format: postgresql+asyncpg://user:pass@host:port/dbname
    import re
    match = re.search(r"@([^:/]+)(?::(\d+))?/([^?\s]+)", _db_url_resolved)
    if match:
        _db_host = match.group(1)
        _db_name = match.group(3)
except Exception:
    pass

_engine_kwargs: dict = {
    "echo": settings.SQLALCHEMY_ECHO,
    "connect_args": _connect_args,
}

# ── Pool configuration based on connection type ────────────────
if _use_null_pool(_db_url_resolved):
    # Supabase transaction pooler (port 6543) — every session gets a
    # fresh connection. Add connect-time validation to catch dead
    # connections early.
    _engine_kwargs["poolclass"] = NullPool
else:
    # Direct Postgres connection — use connection pooling with
    # pre-ping health checks and periodic recycle to avoid
    # stale connections.
    _engine_kwargs.update(
        poolclass=AsyncAdaptedQueuePool,
        pool_size=25,
        max_overflow=50,
        pool_pre_ping=True,
        pool_recycle=300,
        pool_timeout=30,
    )

engine = create_async_engine(_db_url_resolved, **_engine_kwargs)

# ── Connection-safety logging (for NullPool transaction pooler) ──
# Note: SQLAlchemy async engines don't support `@event.listens_for`.
# Connection lifecycle logging is handled by the engine-level pool
# configuration (pool_pre_ping, pool_recycle) and the startup
# check_db_connection() function.


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


async def check_db_connection(max_retries: int = 3) -> bool:
    """
    Async check — verifies database is reachable.
    Retries up to `max_retries` times with exponential backoff
    to handle transient pooler reconnection.
    """
    last_error = None
    for attempt in range(1, max_retries + 1):
        try:
            async with engine.begin() as conn:
                await conn.execute(text("SELECT 1"))
            return True
        except Exception as e:
            last_error = e
            logger.warning(
                f"DB connection attempt {attempt}/{max_retries} failed: {e}"
            )
            if attempt < max_retries:
                await asyncio.sleep(attempt * 2)  # 2s, 4s, 6s
    raise last_error  # Re-raise final failure


async def retry_operation(operation, max_retries: int = 2, label: str = "operation"):
    """
    Run an async operation with retries for transient DB failures.
    Catches ConnectionDoesNotExistError and similar "connection was closed"
    errors that occur with Supabase transaction pooler during long operations.
    """
    import asyncpg
    last_error = None
    for attempt in range(1, max_retries + 1):
        try:
            return await operation()
        except (asyncpg.exceptions.ConnectionDoesNotExistError,
                asyncpg.exceptions.ConnectionFailureError,
                OSError) as e:
            last_error = e
            logger.warning(
                f"{label} attempt {attempt}/{max_retries} failed (transient): {e}"
            )
            if attempt < max_retries:
                await asyncio.sleep(attempt * 3)  # 3s, 6s
        except Exception as e:
            # Non-transient — raise immediately
            logger.error(f"{label} failed with non-transient error: {e}")
            raise
    raise last_error
