from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.exceptions.auth_exceptions import (
    AuthException,
    InvalidCredentialsError,
    AccountNotVerifiedError,
    OTPError,
    OTPSessionExpiredError,
    MobileEmailMismatchError,
)
from app.routes.auth import router as auth_router
from app.routes.vote import router as vote_router
from app.routes.candidates import router as candidates_router
from app.routes.ai import router as ai_router
from app.utils.logger import logger


# ── App ───────────────────────────────────────────────────────
app = FastAPI(
    title=settings.APP_NAME,
    description="Secure AI-powered College Online Voting System API",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)


# ── CORS ──────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Routers ───────────────────────────────────────────────────
app.include_router(auth_router,       prefix=settings.API_V1_PREFIX)
app.include_router(vote_router,       prefix=f"{settings.API_V1_PREFIX}/vote",       tags=["Vote"])
app.include_router(candidates_router, prefix=f"{settings.API_V1_PREFIX}/candidates", tags=["Candidates"])
app.include_router(ai_router,         prefix=f"{settings.API_V1_PREFIX}/ai",         tags=["AI"])


# ── Auth Exception Handlers ──────────────────────────────────

@app.exception_handler(InvalidCredentialsError)
async def invalid_credentials_handler(request: Request, exc: InvalidCredentialsError):
    return JSONResponse(status_code=401, content={"detail": exc.message})


@app.exception_handler(AccountNotVerifiedError)
async def account_not_verified_handler(request: Request, exc: AccountNotVerifiedError):
    return JSONResponse(status_code=403, content={"detail": exc.message})


@app.exception_handler(OTPError)
async def otp_error_handler(request: Request, exc: OTPError):
    return JSONResponse(status_code=400, content={"detail": exc.message})


@app.exception_handler(OTPSessionExpiredError)
async def otp_session_expired_handler(request: Request, exc: OTPSessionExpiredError):
    return JSONResponse(status_code=401, content={"detail": exc.message})


@app.exception_handler(MobileEmailMismatchError)
async def mobile_mismatch_handler(request: Request, exc: MobileEmailMismatchError):
    return JSONResponse(status_code=400, content={"detail": exc.message})


@app.exception_handler(AuthException)
async def auth_exception_handler(request: Request, exc: AuthException):
    return JSONResponse(status_code=401, content={"detail": exc.message})


# ── Global Exception Handler ─────────────────────────────────
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error. Please try again later."},
    )


# ── Startup Validation ───────────────────────────────────────
@app.on_event("startup")
async def startup_validation():
    """Validate critical configuration and DB connectivity at boot."""
    errors = []

    # Required env vars
    if settings.JWT_SECRET_KEY == "your-super-secret-key-change-in-production":
        errors.append("JWT_SECRET_KEY is not set (still using default)")

    if settings.GMAIL_SENDER_EMAIL == "your-email@gmail.com":
        errors.append("GMAIL_SENDER_EMAIL is not configured")

    if settings.GMAIL_APP_PASSWORD == "your-gmail-app-password":
        errors.append("GMAIL_APP_PASSWORD is not configured")

    if settings.FAST2SMS_API_KEY == "your-fast2sms-api-key":
        errors.append("FAST2SMS_API_KEY is not configured")

    for err in errors:
        logger.warning(f"CONFIG WARNING: {err}")

    # DB connection check
    from app.db.session import check_db_connection
    try:
        await check_db_connection()
        logger.info("Database connection verified.")
    except Exception as e:
        logger.error(f"STARTUP FAILURE: {e}")
        raise

    logger.info(f"{settings.APP_NAME} started successfully.")


# ── Health Check ──────────────────────────────────────────────
@app.get("/health", tags=["Health"])
async def health_check():
    return {"status": "ok", "app": settings.APP_NAME}


@app.get("/", tags=["Root"])
async def root():
    return {
        "message": f"Welcome to {settings.APP_NAME}",
        "docs": "/docs",
        "health": "/health",
    }