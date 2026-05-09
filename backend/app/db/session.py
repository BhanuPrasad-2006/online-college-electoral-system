from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from app.core.config import settings


# ── Engine ────────────────────────────────────────────────────
# Uses SESSION POOLER URL (port 6543) for all runtime queries.
# pool_pre_ping=True  → drops stale Supabase connections automatically
# pool_size=10        → max persistent connections in pool
# max_overflow=20     → extra connections allowed under peak load
# pool_recycle=300    → recycle connections every 5 min (Supabase idle timeout)

engine = create_engine(
    settings.DATABASE_POOLER_URL,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
    pool_recycle=300,
    echo=(settings.APP_ENV == "development"),   # logs SQL in dev only
)


# ── Session Factory ───────────────────────────────────────────
SessionLocal = sessionmaker(
    bind=engine,
    autocommit=False,
    autoflush=False,
)


# ── FastAPI Dependency ────────────────────────────────────────
# Use this in every route:
#   db: Session = Depends(get_db)

def get_db():
    db = SessionLocal()
    try:
        yield db
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


# ── Health Check ──────────────────────────────────────────────
def check_db_connection() -> bool:
    """
    Called at app startup to verify Supabase is reachable.
    Returns True if connected, raises on failure.
    """
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception as e:
        raise RuntimeError(f"Database connection failed: {e}")