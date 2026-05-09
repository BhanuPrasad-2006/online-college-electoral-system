from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.core.config import settings
from app.db.session import check_db_connection
from app.db.init_db import init_db


# ── Startup / Shutdown ────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    # startup
    check_db_connection()
    init_db()
    print(f"🚀 {settings.APP_NAME} started — ENV: {settings.APP_ENV}")
    yield
    # shutdown
    print("🛑 Server shutting down.")


# ── App ───────────────────────────────────────────────────────
app = FastAPI(
    title=settings.APP_NAME,
    version="1.0.0",
    docs_url="/docs"    if settings.APP_ENV == "development" else None,
    redoc_url="/redoc"  if settings.APP_ENV == "development" else None,
    lifespan=lifespan,
)

# ── CORS ──────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers (add as you build each one) ──────────────────────
# from app.api.v1 import auth, vote, candidates, concerns, admin, analytics, ai
# app.include_router(auth.router,       prefix="/api/v1/auth",       tags=["Auth"])
# app.include_router(vote.router,       prefix="/api/v1/vote",       tags=["Vote"])
# app.include_router(candidates.router, prefix="/api/v1/candidates", tags=["Candidates"])
# app.include_router(concerns.router,   prefix="/api/v1/concerns",   tags=["Concerns"])
# app.include_router(admin.router,      prefix="/api/v1/admin",      tags=["Admin"])
# app.include_router(analytics.router,  prefix="/api/v1/analytics",  tags=["Analytics"])
# app.include_router(ai.router,         prefix="/api/v1/ai",         tags=["AI"])


@app.get("/health", tags=["Health"])
def health_check():
    return {"status": "ok", "env": settings.APP_ENV}