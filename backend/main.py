from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.core.config import settings
from app.exceptions.auth_exceptions import (
    AuthException,
    InvalidCredentialsError,
    AccountNotVerifiedError,
    OTPError,
    OTPSessionExpiredError,
    MobileEmailMismatchError,
    CandidateRejectedError,
    CandidateEligibilityError,
)
from app.routes.auth import router as auth_router
from app.routes.vote import router as vote_router
from app.routes.candidates import router as candidates_router
from app.routes.ai import router as ai_router
from app.routes.election import router as election_router
from app.routes.admin import router as admin_router
from app.routes.media import router as media_router
from app.routes.concerns import router as concerns_router
from app.routes.announcements import router as announcements_router

from app.utils.logger import logger


# ── App ───────────────────────────────────────────────────────
app = FastAPI(
    title=settings.APP_NAME,
    description="Secure AI-powered College Online Voting System API",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")


# ── CORS ──────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_origin_regex=(
        r"(^https://.*\.vercel\.app$)"
        r"|(^http://localhost(:\d+)?$)"
        r"|(^http://127\.0\.0\.1(:\d+)?$)"
        r"|(^http://192\.168\.\d+\.\d+(:\d+)?$)"
        r"|(^http://10\.\d+\.\d+\.\d+(:\d+)?$)"
        r"|(^http://172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+(:\d+)?$)"
    ),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=["Content-Type", "Authorization", "Accept", "Origin", "X-Requested-With", "X-CSRF-Token", "x-csrf-token", "X-Device-Fingerprint"],
)

# ── Rate Limiting (Redis-backed with in-memory fallback) ──────────────
from app.middleware.rate_limit import limiter
from slowapi.errors import RateLimitExceeded
from slowapi import _rate_limit_exceeded_handler

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
# ── Custom Security, Logging & JWT Middlewares ──────────────
from app.middleware.security_headers import SecurityHeadersMiddleware
from app.middleware.request_size_limit import RequestBodySizeLimitMiddleware
from app.middleware.audit_middleware import AuditMiddleware
from app.middleware.jwt_middleware import JWTMiddleware

app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(RequestBodySizeLimitMiddleware)
app.add_middleware(AuditMiddleware)
app.add_middleware(JWTMiddleware)

# ── Routers ───────────────────────────────────────────────────
app.include_router(auth_router,       prefix=settings.API_V1_PREFIX)
app.include_router(vote_router,       prefix=f"{settings.API_V1_PREFIX}/vote",       tags=["Vote"])
app.include_router(candidates_router, prefix=f"{settings.API_V1_PREFIX}/candidates", tags=["Candidates"])
app.include_router(ai_router,         prefix=f"{settings.API_V1_PREFIX}/ai",         tags=["AI"])
app.include_router(election_router,   prefix=f"{settings.API_V1_PREFIX}/election",   tags=["Election"])
app.include_router(admin_router,      prefix=f"{settings.API_V1_PREFIX}/admin",      tags=["Admin"])
app.include_router(media_router,      prefix=f"{settings.API_V1_PREFIX}/media",      tags=["Media"])
app.include_router(concerns_router,   prefix=f"{settings.API_V1_PREFIX}/concerns",   tags=["Concerns"])
app.include_router(announcements_router, prefix=f"{settings.API_V1_PREFIX}/announcements", tags=["Announcements"])



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


@app.exception_handler(CandidateRejectedError)
async def candidate_rejected_handler(request: Request, exc: CandidateRejectedError):
    return JSONResponse(
        status_code=403,
        content={"detail": exc.message, "remarks": exc.remarks}
    )


@app.exception_handler(CandidateEligibilityError)
async def candidate_eligibility_handler(request: Request, exc: CandidateEligibilityError):
    return JSONResponse(
        status_code=400,
        content={"detail": exc.message}
    )


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

    # Dynamic schema migration for biometric columns
    from sqlalchemy import text, inspect
    from app.db.session import engine
    try:
        async with engine.begin() as conn:
            def run_migration_steps(connection):
                inspector = inspect(connection)
                columns = [c["name"] for c in inspector.get_columns("voters")]
                
                # Add embedding_model_version
                if "embedding_model_version" not in columns:
                    logger.info("Adding embedding_model_version column to voters table...")
                    connection.execute(text(
                        "ALTER TABLE voters ADD COLUMN embedding_model_version VARCHAR(50) NULL"
                    ))
                
                # Add failed_face_attempts
                if "failed_face_attempts" not in columns:
                    logger.info("Adding failed_face_attempts column to voters table...")
                    connection.execute(text(
                        "ALTER TABLE voters ADD COLUMN failed_face_attempts INTEGER DEFAULT 0"
                    ))
                
                # Create indexes
                connection.execute(text(
                    "CREATE INDEX IF NOT EXISTS idx_voters_embedding_model ON voters(embedding_model_version);"
                ))
                connection.execute(text(
                    "CREATE INDEX IF NOT EXISTS idx_voters_failed_face ON voters(failed_face_attempts);"
                ))
                connection.execute(text(
                    "CREATE INDEX IF NOT EXISTS idx_voters_lockout ON voters(lockout_until);"
                ))
                logger.info("Biometric database schema self-healing/migration completed.")
            
            await conn.run_sync(run_migration_steps)
    except Exception as e:
        logger.error(f"Failed to run automatic biometric database migrations: {e}")

    # ── Notice & Meeting System Migrations ──
    try:
        async with engine.begin() as conn:
            def run_notice_meeting_migrations(connection):
                inspector = inspect(connection)
                existing_tables = inspector.get_table_names()

                # Only run Notice & Meeting migrations (Party was removed)
                admin_cols = [c["name"] for c in inspector.get_columns("admin_users")]
                if "role" not in admin_cols:
                    logger.info("Adding role column to admin_users table...")
                    connection.execute(text(
                        "ALTER TABLE admin_users ADD COLUMN role VARCHAR(50) NOT NULL DEFAULT 'SUPER_ADMIN';"
                    ))

                uuid_type = "UUID" if connection.dialect.name == "postgresql" else "VARCHAR(36)"
                default_uuid = "DEFAULT gen_random_uuid()" if connection.dialect.name == "postgresql" else ""
                timestamptz_type = "TIMESTAMPTZ" if connection.dialect.name == "postgresql" else "DATETIME"
                now_func = "NOW()" if connection.dialect.name == "postgresql" else "CURRENT_TIMESTAMP"

                if "notices" not in existing_tables:
                    logger.info("Creating notices table...")
                    connection.execute(text(f"""
                        CREATE TABLE IF NOT EXISTS notices (
                            notice_id {uuid_type} PRIMARY KEY {default_uuid},
                            title VARCHAR(255) NOT NULL,
                            content TEXT NOT NULL,
                            priority VARCHAR(50) NOT NULL DEFAULT 'LOW',
                            pdf_url VARCHAR(500),
                            qr_code VARCHAR(255),
                            created_at {timestamptz_type} DEFAULT {now_func},
                            created_by {uuid_type} NOT NULL REFERENCES admin_users(admin_id) ON DELETE CASCADE
                        );
                    """))

                if "notice_recipients" not in existing_tables:
                    logger.info("Creating notice_recipients table...")
                    connection.execute(text(f"""
                        CREATE TABLE IF NOT EXISTS notice_recipients (
                            id {uuid_type} PRIMARY KEY {default_uuid},
                            notice_id {uuid_type} NOT NULL REFERENCES notices(notice_id) ON DELETE CASCADE,
                            recipient_voter_id {uuid_type} REFERENCES voters(voter_id) ON DELETE CASCADE,
                            role_target VARCHAR(50) NOT NULL DEFAULT 'ALL',
                            is_read BOOLEAN NOT NULL DEFAULT FALSE
                        );
                    """))

                if "admin_meetings" not in existing_tables:
                    logger.info("Creating admin_meetings table...")
                    connection.execute(text(f"""
                        CREATE TABLE IF NOT EXISTS admin_meetings (
                            meeting_id {uuid_type} PRIMARY KEY {default_uuid},
                            title VARCHAR(255) NOT NULL,
                            agenda TEXT NOT NULL,
                            meeting_time {timestamptz_type} NOT NULL,
                            jitsi_link VARCHAR(500) NOT NULL,
                            created_by {uuid_type} NOT NULL REFERENCES admin_users(admin_id) ON DELETE CASCADE,
                            created_at {timestamptz_type} DEFAULT {now_func}
                        );
                    """))

                if "meeting_participants" not in existing_tables:
                    logger.info("Creating meeting_participants table...")
                    connection.execute(text(f"""
                        CREATE TABLE IF NOT EXISTS meeting_participants (
                            id {uuid_type} PRIMARY KEY {default_uuid},
                            meeting_id {uuid_type} NOT NULL REFERENCES admin_meetings(meeting_id) ON DELETE CASCADE,
                            admin_id {uuid_type} NOT NULL REFERENCES admin_users(admin_id) ON DELETE CASCADE,
                            attended BOOLEAN NOT NULL DEFAULT FALSE
                        );
                    """))

                logger.info("Notice and Meeting system database migrations completed.")

            await conn.run_sync(run_notice_meeting_migrations)
    except Exception as e:
        logger.error(f"Failed to run notice/meeting migrations: {e}")

    # Dynamic seeding of admin users
    try:
        from seed_admin import seed_all_admins
        from app.db.session import SessionLocal
        async with SessionLocal() as db_session:
            await seed_all_admins(db_session)
        logger.info("Admin seeding completed.")
    except Exception as e:
        logger.error(f"Failed to run admin seeding: {e}")


    # Warmup ArcFace model
    if settings.WARMUP_BIOMETRIC_MODEL:
        try:
            from app.services.face_service import warmup_model
            warmup_model()
        except Exception as e:
            logger.error(f"Model warmup failed: {e}")
            raise SystemExit("Startup terminated: Face recognition model could not be loaded/warmed up.")
    else:
        logger.info("Biometric model warmup skipped via configuration settings (WARMUP_BIOMETRIC_MODEL=False).")

    # Run automatic Facenet -> ArcFace migration for existing reference photos
    try:
        from app.services.face_service import migrate_voters_to_arcface
        from app.db.session import SessionLocal
        async with SessionLocal() as db_session:
            await migrate_voters_to_arcface(db_session)
    except Exception as e:
        logger.error(f"Automatic face embedding migration failed: {e}")

    logger.info(f"{settings.APP_NAME} started successfully.")


# ── Dev OTP Retrieval Backdoor ─────────────────────────────────
if settings.APP_ENV == "development":
    @app.get("/dev/latest-otp", tags=["Dev"])
    async def dev_latest_otp():
        """Retrieve the latest OTPs generated in dev mode for automated testing."""
        import os
        otp_dict = {}
        
        otp_path = os.path.join(os.getcwd(), "latest_otp.txt")
        sms_path = os.path.join(os.getcwd(), "latest_sms_otp.txt")
        
        if os.path.exists(otp_path):
            with open(otp_path, "r", encoding="utf-8") as f:
                content = f.read().strip()
                if ":" in content:
                    email, otp = content.split(":", 1)
                    otp_dict["email"] = email
                    otp_dict["email_otp"] = otp
                    
        if os.path.exists(sms_path):
            with open(sms_path, "r", encoding="utf-8") as f:
                content = f.read().strip()
                if ":" in content:
                    phone, otp = content.split(":", 1)
                    otp_dict["phone"] = phone
                    otp_dict["sms_otp"] = otp
                    
        return otp_dict


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
