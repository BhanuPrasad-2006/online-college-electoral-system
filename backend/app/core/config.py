from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    SUPABASE_URL: str
    SUPABASE_SERVICE_KEY: str
    SUPABASE_ANON_KEY: str
    JWT_SECRET: str

    

    # ── App ───────────────────────────────────────────────────
    APP_ENV:       str = "development"
    APP_NAME:      str = "College Election System"
    FRONTEND_URL:  str = "http://localhost:3000"

    # ── Supabase / PostgreSQL ─────────────────────────────────
    # Direct connection  → use for Alembic migrations only
    DATABASE_URL: str

    # Session pooler   → use for FastAPI runtime (port 6543)
    DATABASE_POOLER_URL: str

    # ── JWT ───────────────────────────────────────────────────
    JWT_SECRET_KEY:               str
    JWT_ALGORITHM:                str = "HS256"
    ACCESS_TOKEN_EXPIRE_HOURS:    int = 8
    REFRESH_TOKEN_EXPIRE_DAYS:    int = 7

    # ── OTP ───────────────────────────────────────────────────
    OTP_EXPIRE_MINUTES:           int = 10   # email OTP TTL
    OTP_MOBILE_EXPIRE_MINUTES:    int = 5    # mobile OTP TTL
    OTP_MAX_ATTEMPTS:             int = 3    # lock after 3 wrong attempts

    # ── Email (SendGrid / SMTP) ───────────────────────────────
    SMTP_HOST:     str = "smtp.sendgrid.net"
    SMTP_PORT:     int = 587
    SMTP_USER:     str = "apikey"
    SMTP_PASSWORD: str
    FROM_EMAIL:    str

    # ── SMS Gateway (Twilio / Fast2SMS) ──────────────────────
    SMS_PROVIDER:      str = "fast2sms"       # or "twilio"
    SMS_API_KEY:       str = ""
    SMS_SENDER_ID:     str = "CLGELC"

    # ── College Database API ──────────────────────────────────
    # Your college's student validation endpoint
    COLLEGE_DB_API_URL: str = ""
    COLLEGE_DB_API_KEY: str = ""

    # ── Rate Limiting ─────────────────────────────────────────
    RATE_LIMIT_LOGIN:    str = "5/15minutes"
    RATE_LIMIT_OTP:      str = "3/hour"
    RATE_LIMIT_VOTE:     str = "1/session"

    # ── Redis (for rate limiting + session cache) ─────────────
    REDIS_URL: str = "redis://localhost:6379"

    class Config:
        env_file     = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = True
        env_file = ".env"
        extra = "ignore"


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()