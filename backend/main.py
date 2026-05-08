from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.v1 import auth, vote, candidates, concerns, admin, analytics, ai
from app.core.config import settings

app = FastAPI(
    title="College Election System API",
    description="Secure, AI-powered online voting platform for college elections",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register API routes
app.include_router(auth.router, prefix="/api/v1/auth", tags=["Authentication"])
app.include_router(vote.router, prefix="/api/v1/vote", tags=["Voting"])
app.include_router(candidates.router, prefix="/api/v1/candidates", tags=["Candidates"])
app.include_router(concerns.router, prefix="/api/v1/concerns", tags=["Concerns"])
app.include_router(admin.router, prefix="/api/v1/admin", tags=["Admin"])
app.include_router(analytics.router, prefix="/api/v1/analytics", tags=["Analytics"])
app.include_router(ai.router, prefix="/api/v1/ai", tags=["AI"])


@app.get("/", tags=["Health"])
async def root():
    return {"status": "healthy", "service": "College Election System API", "version": "1.0.0"}


@app.get("/health", tags=["Health"])
async def health_check():
    return {"status": "ok"}
