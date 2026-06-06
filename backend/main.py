import os
os.environ["TF_USE_LEGACY_KERAS"] = "1"

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
from app.routes.parties import router as parties_router
from app.routes.voter_parties import router as voter_parties_router

from app.utils.logger import logger
from contextlib import asynccontextmanager


# ── Lifespan ──────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application startup and shutdown lifecycle."""
    # Debug bypass flags — set to True to skip problematic startup steps
    # when diagnosing connection failures.
    SKIP_MIGRATIONS = False      # Bypass self-healing migrations
    SKIP_SCHEMA_VALIDATION = False  # Skip schema column validation
    SKIP_ADMIN_SEEDING = False    # Skip admin seeding
    SKIP_FACE_MIGRATION = False   # Skip Facenet→Arcface migration

    import time

    # ── Startup ───────────────────────────────────────────────
    startup_validation_start = time.perf_counter()

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

    # DB connection check (DB Init Time)
    db_init_start = time.perf_counter()
    from app.db.session import check_db_connection, engine, _db_host, _db_name
    logger.info(f"=== STARTUP: Connecting to DB host='{_db_host}' database='{_db_name}' ===")
    try:
        await check_db_connection()
        logger.info(f"=== STARTUP: DB connection successful (host={_db_host}, db={_db_name}) ===")
    except Exception as e:
        logger.error(f"=== STARTUP FAILURE: DB connection failed (host={_db_host}, db={_db_name}): {e} ===")
        raise
    db_init_time = time.perf_counter() - db_init_start

    # Check/run dynamic migrations
    migration_start = time.perf_counter()
    TARGET_VERSION = 1
    run_migrations = False
    current_version = 0

    from sqlalchemy import text, inspect

    if SKIP_MIGRATIONS:
        logger.info("=== STARTUP: SKIP_MIGRATIONS=True — bypassing migration check ===")
    else:
        logger.info("=== STARTUP: Checking schema version ===")
        try:
            async with engine.begin() as conn:
                def check_version(connection):
                    inspector = inspect(connection)
                    if "schema_version" not in inspector.get_table_names():
                        return 0
                    res = connection.execute(text("SELECT version FROM schema_version LIMIT 1")).fetchone()
                    return res[0] if res else 0
                current_version = await conn.run_sync(check_version)
                if current_version < TARGET_VERSION:
                    run_migrations = True
        except Exception as e:
            logger.error(f"=== STARTUP: Failed to check schema version: {e} ===")
            run_migrations = True

        if run_migrations:
            logger.info(f"=== STARTUP: Schema version {current_version} < {TARGET_VERSION}. Running self-healing migrations... ===")
            from app.db.session import retry_operation

            async def _run_migrations():
                async with engine.begin() as conn:
                    def run_all_migrations(connection):
                        inspector = inspect(connection)
                        existing_tables = inspector.get_table_names()

                        # 1. Biometric Columns Migration
                        voters_cols = [c["name"] for c in inspector.get_columns("voters")]
                        if "embedding_model_version" not in voters_cols:
                            logger.info("Adding embedding_model_version column to voters table...")
                            connection.execute(text(
                                "ALTER TABLE voters ADD COLUMN embedding_model_version VARCHAR(50) NULL"
                            ))
                        if "failed_face_attempts" not in voters_cols:
                            logger.info("Adding failed_face_attempts column to voters table...")
                            connection.execute(text(
                                "ALTER TABLE voters ADD COLUMN failed_face_attempts INTEGER DEFAULT 0"
                            ))
                        if "failed_verify_id_attempts" not in voters_cols:
                            logger.info("Adding failed_verify_id_attempts column to voters table...")
                            connection.execute(text(
                                "ALTER TABLE voters ADD COLUMN failed_verify_id_attempts INTEGER DEFAULT 0"
                            ))
                        if "verify_id_lockout_until" not in voters_cols:
                            logger.info("Adding verify_id_lockout_until column to voters table...")
                            connection.execute(text(
                                "ALTER TABLE voters ADD COLUMN verify_id_lockout_until TIMESTAMP WITH TIME ZONE NULL"
                            ))
                        connection.execute(text(
                            "CREATE INDEX IF NOT EXISTS idx_voters_embedding_model ON voters(embedding_model_version);"
                        ))
                        connection.execute(text(
                            "CREATE INDEX IF NOT EXISTS idx_voters_failed_face ON voters(failed_face_attempts);"
                        ))
                        connection.execute(text(
                            "CREATE INDEX IF NOT EXISTS idx_voters_lockout ON voters(lockout_until);"
                        ))
                        connection.execute(text(
                            "CREATE INDEX IF NOT EXISTS idx_voters_verify_id_lockout ON voters(verify_id_lockout_until);"
                        ))

                        # 2. Notice & Meeting System Migrations
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

                        if "otp_attempts" not in existing_tables:
                            logger.info("Creating otp_attempts table...")
                            connection.execute(text(f"""
                                CREATE TABLE IF NOT EXISTS otp_attempts (
                                    attempt_id {uuid_type} PRIMARY KEY {default_uuid},
                                    recipient VARCHAR(255) NOT NULL,
                                    ip_address VARCHAR(45),
                                    attempt_type VARCHAR(20) NOT NULL,
                                    success BOOLEAN DEFAULT FALSE,
                                    created_at {timestamptz_type} DEFAULT {now_func}
                                );
                            """))
                            connection.execute(text(
                                "CREATE INDEX IF NOT EXISTS idx_otp_attempts_recipient ON otp_attempts(recipient);"
                            ))
                            connection.execute(text(
                                "CREATE INDEX IF NOT EXISTS idx_otp_attempts_created ON otp_attempts(created_at);"
                            ))
                            connection.execute(text(
                                "CREATE INDEX IF NOT EXISTS idx_otp_attempts_type ON otp_attempts(attempt_type);"
                            ))

                        # 3. Party / Invitation System Migrations
                        if "parties" in existing_tables:
                            parties_cols = [c["name"] for c in inspector.get_columns("parties")]
                            if "position_id" not in parties_cols:
                                logger.warning("Database schema out of sync: parties table is missing position_id column. Reconciling schema...")
                                if connection.dialect.name == "postgresql":
                                    connection.execute(text("ALTER TABLE candidates DROP CONSTRAINT IF EXISTS candidates_party_id_fkey;"))
                                    connection.execute(text("DROP TABLE IF EXISTS party_invitations CASCADE;"))
                                    connection.execute(text("DROP TABLE IF EXISTS party_members CASCADE;"))
                                    connection.execute(text("DROP TABLE IF EXISTS parties CASCADE;"))
                                else:
                                    connection.execute(text("DROP TABLE IF EXISTS party_invitations;"))
                                    connection.execute(text("DROP TABLE IF EXISTS party_members;"))
                                    connection.execute(text("DROP TABLE IF EXISTS parties;"))
                                existing_tables = [t for t in existing_tables if t not in ["parties", "party_members", "party_invitations"]]

                        if connection.dialect.name == "postgresql":
                            connection.execute(text("""
                                DO $$ BEGIN
                                    CREATE TYPE party_status AS ENUM (
                                        'PENDING_APPROVAL','APPROVED','REJECTED','CHANGES_REQUESTED'
                                    );
                                EXCEPTION WHEN duplicate_object THEN NULL;
                                END $$;
                            """))
                            connection.execute(text("""
                                DO $$ BEGIN
                                    CREATE TYPE invitation_status AS ENUM (
                                        'PENDING','ACCEPTED','REJECTED','EXPIRED','CANCELLED'
                                    );
                                EXCEPTION WHEN duplicate_object THEN NULL;
                                END $$;
                            """))

                        if "parties" not in existing_tables:
                            logger.info("Creating parties table...")
                            connection.execute(text(f"""
                                CREATE TABLE IF NOT EXISTS parties (
                                    party_id {uuid_type} PRIMARY KEY {default_uuid},
                                    election_id {uuid_type} NOT NULL REFERENCES elections(election_id) ON DELETE CASCADE,
                                    position_id {uuid_type} REFERENCES positions(position_id) ON DELETE SET NULL,
                                    leader_candidate_id {uuid_type} REFERENCES candidates(candidate_id) ON DELETE SET NULL,
                                    name VARCHAR(150) NOT NULL UNIQUE,
                                    symbol VARCHAR(100),
                                    slogan VARCHAR(300),
                                    manifesto TEXT,
                                    logo_url VARCHAR(500),
                                    ai_analysis TEXT,
                                    status VARCHAR(30) NOT NULL DEFAULT 'PENDING_APPROVAL',
                                    admin_remarks VARCHAR(1000),
                                    created_at {timestamptz_type} DEFAULT {now_func},
                                    updated_at {timestamptz_type}
                                );
                            """))
                            connection.execute(text("CREATE INDEX IF NOT EXISTS idx_parties_election ON parties(election_id);"))
                            connection.execute(text("CREATE INDEX IF NOT EXISTS idx_parties_status ON parties(status);"))

                        if "party_members" not in existing_tables:
                            logger.info("Creating party_members table...")
                            connection.execute(text(f"""
                                CREATE TABLE IF NOT EXISTS party_members (
                                    id {uuid_type} PRIMARY KEY {default_uuid},
                                    party_id {uuid_type} NOT NULL REFERENCES parties(party_id) ON DELETE CASCADE,
                                    candidate_id {uuid_type} NOT NULL REFERENCES candidates(candidate_id) ON DELETE CASCADE,
                                    role VARCHAR(100) NOT NULL DEFAULT 'MEMBER',
                                    position VARCHAR(200),
                                    joined_at {timestamptz_type} DEFAULT {now_func}
                                );
                            """))
                            connection.execute(text("CREATE INDEX IF NOT EXISTS idx_party_members_party ON party_members(party_id);"))
                            connection.execute(text("CREATE INDEX IF NOT EXISTS idx_party_members_candidate ON party_members(candidate_id);"))

                        if "party_invitations" not in existing_tables:
                            logger.info("Creating party_invitations table...")
                            connection.execute(text(f"""
                                CREATE TABLE IF NOT EXISTS party_invitations (
                                    invitation_id {uuid_type} PRIMARY KEY {default_uuid},
                                    party_id {uuid_type} NOT NULL REFERENCES parties(party_id) ON DELETE CASCADE,
                                    invited_voter_id {uuid_type} NOT NULL REFERENCES voters(voter_id) ON DELETE CASCADE,
                                    invited_by_candidate_id {uuid_type} NOT NULL REFERENCES candidates(candidate_id) ON DELETE CASCADE,
                                    role VARCHAR(100) NOT NULL DEFAULT 'MEMBER',
                                    position VARCHAR(200),
                                    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
                                    message VARCHAR(500),
                                    created_at {timestamptz_type} DEFAULT {now_func},
                                    responded_at {timestamptz_type},
                                    expires_at {timestamptz_type} NOT NULL
                                );
                            """))
                            connection.execute(text("CREATE INDEX IF NOT EXISTS idx_party_invitations_party ON party_invitations(party_id);"))
                            connection.execute(text("CREATE INDEX IF NOT EXISTS idx_party_invitations_voter ON party_invitations(invited_voter_id);"))
                            connection.execute(text("CREATE INDEX IF NOT EXISTS idx_party_invitations_status ON party_invitations(status);"))

                        cand_cols = [c["name"] for c in inspector.get_columns("candidates")]
                        if "candidate_type" not in cand_cols:
                            logger.info("Adding candidate_type column to candidates...")
                            connection.execute(text(
                                "ALTER TABLE candidates ADD COLUMN candidate_type VARCHAR(20) NOT NULL DEFAULT 'INDEPENDENT';"
                            ))
                            connection.execute(text("CREATE INDEX IF NOT EXISTS idx_candidates_type ON candidates(candidate_type);"))

                        if "party_id" not in cand_cols:
                            logger.info("Adding party_id column to candidates...")
                            connection.execute(text(
                                "ALTER TABLE candidates ADD COLUMN party_id UUID REFERENCES parties(party_id) ON DELETE SET NULL;"
                            ))
                            connection.execute(text("CREATE INDEX IF NOT EXISTS idx_candidates_party ON candidates(party_id);"))

                        if "party_role" not in cand_cols:
                            logger.info("Adding party_role column to candidates...")
                            connection.execute(text(
                                "ALTER TABLE candidates ADD COLUMN party_role VARCHAR(100);"
                            ))

                        if connection.dialect.name == "postgresql":
                            connection.execute(text("""
                                DO $$
                                BEGIN
                                    IF NOT EXISTS (
                                        SELECT 1 FROM pg_constraint WHERE conname = 'candidates_party_id_fkey'
                                    ) THEN
                                        ALTER TABLE candidates 
                                        ADD CONSTRAINT candidates_party_id_fkey 
                                        FOREIGN KEY (party_id) REFERENCES parties(party_id) ON DELETE SET NULL;
                                    END IF;
                                END $$;
                            """))

                        # Create or update schema version
                        if "schema_version" not in existing_tables:
                            connection.execute(text("CREATE TABLE schema_version (version INTEGER PRIMARY KEY)"))
                            connection.execute(text("INSERT INTO schema_version (version) VALUES (:v)"), {"v": TARGET_VERSION})
                        else:
                            connection.execute(text("UPDATE schema_version SET version = :v"), {"v": TARGET_VERSION})

                    await conn.run_sync(run_all_migrations)
                    logger.info("Self-healing migrations completed successfully.")

            try:
                await retry_operation(_run_migrations, max_retries=2, label="self-healing migrations")
            except Exception as e:
                logger.error(f"=== STARTUP: Self-healing migrations failed after retries: {e} ===")
        else:
            logger.info(f"=== STARTUP: Schema version {current_version} is up to date. Skipping dynamic migrations. ===")

        logger.info("=== STARTUP: Migration check complete ===")

    migration_time = time.perf_counter() - migration_start

    # Seeding
    admin_seed_start = time.perf_counter()
    if SKIP_ADMIN_SEEDING:
        logger.info("=== STARTUP: SKIP_ADMIN_SEEDING=True — bypassing admin seeding ===")
    else:
        try:
            from seed_admin import seed_all_admins
            from app.db.session import SessionLocal, retry_operation
            async def _seed_admins():
                async with SessionLocal() as db_session:
                    await seed_all_admins(db_session)
            await retry_operation(_seed_admins, max_retries=2, label="admin seeding")
            logger.info("=== STARTUP: Admin seeding completed ===")
        except Exception as e:
            logger.error(f"=== STARTUP: Admin seeding failed: {e} ===")
    db_init_time += (time.perf_counter() - admin_seed_start)

    # Schema Validation
    validation_start = time.perf_counter()
    if SKIP_SCHEMA_VALIDATION:
        logger.info("=== STARTUP: SKIP_SCHEMA_VALIDATION=True — bypassing schema validation ===")
    else:
        try:
            from app.db.session import retry_operation
            async def _validate_schema():
                async with engine.begin() as conn:
                    def validate_schema(connection):
                        inspector = inspect(connection)
                        tables = inspector.get_table_names()
                        errors = []

                        required_tables = ["parties", "party_members", "party_invitations", "candidates", "voters", "admin_users"]
                        for tbl in required_tables:
                            if tbl not in tables:
                                errors.append(f"Table '{tbl}' is missing from the database schema!")

                        if settings.APP_ENV != "production":
                            columns_cache = {}
                            def get_cached_columns(table_name):
                                if table_name not in columns_cache:
                                    columns_cache[table_name] = [c["name"] for c in inspector.get_columns(table_name)]
                                return columns_cache[table_name]

                            if "voters" in tables:
                                voter_cols = get_cached_columns("voters")
                                for col in ["embedding_model_version", "failed_face_attempts"]:
                                    if col not in voter_cols:
                                        errors.append(f"Column 'voters.{col}' is missing!")

                            if "candidates" in tables:
                                cand_cols = get_cached_columns("candidates")
                                for col in ["candidate_type", "party_id", "party_role"]:
                                    if col not in cand_cols:
                                        errors.append(f"Column 'candidates.{col}' is missing!")

                            if "parties" in tables:
                                parties_cols = get_cached_columns("parties")
                                for col in ["party_id", "election_id", "position_id", "leader_candidate_id", "name", "symbol", "slogan", "manifesto", "logo_url", "status", "admin_remarks", "created_at", "updated_at"]:
                                    if col not in parties_cols:
                                        errors.append(f"Column 'parties.{col}' is missing!")

                            if "party_members" in tables:
                                mem_cols = get_cached_columns("party_members")
                                for col in ["id", "party_id", "candidate_id", "role", "position", "joined_at"]:
                                    if col not in mem_cols:
                                        errors.append(f"Column 'party_members.{col}' is missing!")

                            if "party_invitations" in tables:
                                inv_cols = get_cached_columns("party_invitations")
                                for col in ["invitation_id", "party_id", "invited_voter_id", "invited_by_candidate_id", "role", "position", "status", "message", "created_at", "responded_at", "expires_at"]:
                                    if col not in inv_cols:
                                        errors.append(f"Column 'party_invitations.{col}' is missing!")
                        else:
                            if "voters" in tables:
                                voter_cols = [c["name"] for c in inspector.get_columns("voters")]
                                if "embedding_model_version" not in voter_cols:
                                    errors.append("Column 'voters.embedding_model_version' is missing!")
                            if "candidates" in tables:
                                cand_cols = [c["name"] for c in inspector.get_columns("candidates")]
                                if "party_id" not in cand_cols:
                                    errors.append("Column 'candidates.party_id' is missing!")

                        if errors:
                            for err in errors:
                                logger.error(f"SCHEMA VALIDATION ERROR: {err}")
                        else:
                            logger.info("=== STARTUP: Database schema validation succeeded ===")

                    await conn.run_sync(validate_schema)
            await retry_operation(_validate_schema, max_retries=2, label="schema validation")
        except Exception as e:
            logger.error(f"=== STARTUP: Schema validation failed: {e} ===")

    validation_time = time.perf_counter() - validation_start

    # ArcFace warmup
    model_load_start = time.perf_counter()
    model_loaded_status = "skipped"

    # Always Warmup OTP Abuse Service
    try:
        from app.security.otp_abuse_service import OTPAbuseService
        logger.info("OTP abuse prevention service initialized.")
    except Exception as e:
        logger.error(f"OTP abuse service init failed: {e}")

    if settings.PRELOAD_ARCFACE:
        try:
            from app.services.face_service import warmup_model
            warmup_model()
            model_loaded_status = f"{time.perf_counter() - model_load_start:.2f}s"
        except Exception as e:
            logger.error(f"Model warmup failed: {e}")
            raise SystemExit("Startup terminated: Face recognition model could not be loaded/warmed up.")
            
    model_load_time = time.perf_counter() - model_load_start

    # Run automatic Facenet -> ArcFace migration for existing reference photos
    if SKIP_FACE_MIGRATION:
        logger.info("=== STARTUP: SKIP_FACE_MIGRATION=True — bypassing face embedding migration ===")
    else:
        try:
            from app.services.face_service import migrate_voters_to_arcface
            from app.db.session import SessionLocal, retry_operation
            async def _migrate_faces():
                async with SessionLocal() as db_session:
                    await migrate_voters_to_arcface(db_session)
            await retry_operation(_migrate_faces, max_retries=2, label="face embedding migration")
            logger.info("=== STARTUP: Face embedding migration completed ===")
        except Exception as e:
            logger.error(f"=== STARTUP: Face embedding migration failed: {e} ===")

    total_startup_time = time.perf_counter() - startup_validation_start
    
    # Timing Logs Output
    logger.info("====================================")
    logger.info("      STARTUP TIMING METRICS")
    logger.info("====================================")
    logger.info(f"DB Init: {db_init_time:.2f}s")
    logger.info(f"Migration: {migration_time:.2f}s")
    logger.info(f"Validation: {validation_time:.2f}s")
    logger.info(f"ArcFace: {model_loaded_status}")
    logger.info(f"Total Startup: {total_startup_time:.2f}s")
    logger.info("====================================")
    logger.info(f"{settings.APP_NAME} started successfully.")

    yield

    # ── Shutdown ────────────────────────────────────────────────
    logger.info(f"{settings.APP_NAME} shutting down.")


# ── App ───────────────────────────────────────────────────────
app = FastAPI(
    title=settings.APP_NAME,
    description="Secure AI-powered College Online Voting System API",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
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

app.state.limiter = limiter
# Custom rate limit exception handler registered below with other exception handlers
# ── Custom Security, Logging & JWT Middlewares ──────────────
from app.middleware.security_headers import SecurityHeadersMiddleware
from app.middleware.request_size_limit import RequestBodySizeLimitMiddleware
from app.middleware.audit_middleware import AuditMiddleware
from app.middleware.jwt_middleware import JWTMiddleware
from app.middleware.suspicious_activity import SuspiciousActivityMiddleware

app.add_middleware(SuspiciousActivityMiddleware)
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
app.include_router(parties_router,      prefix=f"{settings.API_V1_PREFIX}/parties",       tags=["Parties"])
app.include_router(voter_parties_router, prefix=f"{settings.API_V1_PREFIX}/voter",          tags=["Voter Parties"])



# ── Auth Exception Handlers ──────────────────────────────────
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
from app.middleware.cors import get_cors_headers

def cors_json_response(request: Request, status_code: int, content: dict) -> JSONResponse:
    headers = get_cors_headers(request)
    return JSONResponse(
        status_code=status_code,
        content=content,
        headers=headers
    )


@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    return cors_json_response(
        request,
        status_code=429,
        content={
            "success": False,
            "error": "Rate limit exceeded. Please try again later.",
            "detail": "Rate limit exceeded. Please try again later."
        }
    )


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    return cors_json_response(
        request,
        status_code=exc.status_code,
        content={
            "success": False,
            "error": exc.detail,
            "detail": exc.detail
        }
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    errors = []
    for err in exc.errors():
        loc = " -> ".join(str(x) for x in err.get("loc", []))
        msg = err.get("msg", "")
        errors.append(f"{loc}: {msg}")
    error_msg = "; ".join(errors)
    return cors_json_response(
        request,
        status_code=422,
        content={
            "success": False,
            "error": f"Validation Error: {error_msg}",
            "detail": f"Validation Error: {error_msg}"
        }
    )


@app.exception_handler(InvalidCredentialsError)
async def invalid_credentials_handler(request: Request, exc: InvalidCredentialsError):
    return cors_json_response(
        request,
        status_code=401,
        content={"success": False, "error": exc.message, "detail": exc.message}
    )


@app.exception_handler(AccountNotVerifiedError)
async def account_not_verified_handler(request: Request, exc: AccountNotVerifiedError):
    return cors_json_response(
        request,
        status_code=403,
        content={"success": False, "error": exc.message, "detail": exc.message}
    )


@app.exception_handler(OTPError)
async def otp_error_handler(request: Request, exc: OTPError):
    return cors_json_response(
        request,
        status_code=400,
        content={"success": False, "error": exc.message, "detail": exc.message}
    )


@app.exception_handler(OTPSessionExpiredError)
async def otp_session_expired_handler(request: Request, exc: OTPSessionExpiredError):
    return cors_json_response(
        request,
        status_code=401,
        content={"success": False, "error": exc.message, "detail": exc.message}
    )


@app.exception_handler(MobileEmailMismatchError)
async def mobile_mismatch_handler(request: Request, exc: MobileEmailMismatchError):
    return cors_json_response(
        request,
        status_code=400,
        content={"success": False, "error": exc.message, "detail": exc.message}
    )


@app.exception_handler(AuthException)
async def auth_exception_handler(request: Request, exc: AuthException):
    return cors_json_response(
        request,
        status_code=401,
        content={"success": False, "error": exc.message, "detail": exc.message}
    )


@app.exception_handler(CandidateRejectedError)
async def candidate_rejected_handler(request: Request, exc: CandidateRejectedError):
    return cors_json_response(
        request,
        status_code=403,
        content={
            "success": False,
            "error": exc.message,
            "detail": exc.message,
            "remarks": exc.remarks
        }
    )


@app.exception_handler(CandidateEligibilityError)
async def candidate_eligibility_handler(request: Request, exc: CandidateEligibilityError):
    return cors_json_response(
        request,
        status_code=400,
        content={"success": False, "error": exc.message, "detail": exc.message}
    )


# ── Global Exception Handler ─────────────────────────────────
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return cors_json_response(
        request,
        status_code=500,
        content={
            "success": False,
            "error": "Internal server error. Please try again later.",
            "detail": "Internal server error. Please try again later."
        },
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
