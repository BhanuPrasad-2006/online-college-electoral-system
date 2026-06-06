from pydantic_settings import BaseSettings
from functools import lru_cache
from pydantic import ConfigDict, field_validator


class Settings(BaseSettings):

    # App
    APP_NAME: str = "College Election API"
    APP_ENV: str = "development"
    DEBUG: bool = False
    API_V1_PREFIX: str = "/api/v1"

    @field_validator("DEBUG", mode="before")
    @classmethod
    def parse_debug(cls, value):
        if isinstance(value, str):
            normalized = value.strip().lower()
            if normalized in {"release", "prod", "production", "false", "0", "no", "off"}:
                return False
            if normalized in {"dev", "development", "debug", "true", "1", "yes", "on"}:
                return True
        return value

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://user:password@localhost:5432/election_db"
    DATABASE_POOLER_URL: str = ""

    # Supabase Storage
    SUPABASE_URL: str = ""
    NEXT_PUBLIC_SUPABASE_URL: str = ""
    SUPABASE_SERVICE_ROLE_KEY: str = ""
    SUPABASE_STORAGE_BUCKET: str = "campaign-media"

    # JWT
    JWT_SECRET_KEY: str
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 180
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    ENABLE_DEVICE_FINGERPRINT_BINDING: bool = False

    # OTP
    OTP_EXPIRE_MINUTES: int = 5
    OTP_LENGTH: int = 6

    # Gmail SMTP
    GMAIL_SENDER_EMAIL: str = "your-email@gmail.com"
    GMAIL_APP_PASSWORD: str = "your-gmail-app-password"

    # Fast2SMS
    FAST2SMS_API_KEY: str = "your-fast2sms-api-key"
    FAST2SMS_SENDER_ID: str = "ELCVOT"

    # Redis
    REDIS_URL: str = "redis://localhost:6379"
    USE_REDIS: bool = False

    # ── Security Settings ──────────────────────────────────────

    # Google reCAPTCHA
    RECAPTCHA_SECRET_KEY: str = ""

    # Rate limiting
    RATE_LIMIT_NORMAL_PER_MINUTE: int = 100
    RATE_LIMIT_AUTH_PER_MINUTE: int = 10
    RATE_LIMIT_OTP_SEND_PER_MINUTE: int = 3
    RATE_LIMIT_OTP_VERIFY_PER_MINUTE: int = 5
    RATE_LIMIT_FACE_PER_MINUTE: int = 3
    RATE_LIMIT_VOTE_PER_MINUTE: int = 5
    RATE_LIMIT_ADMIN_ACTION_PER_MINUTE: int = 10

    # OTP abuse prevention
    OTP_MAX_ATTEMPTS: int = 5
    OTP_RESEND_COOLDOWN_SECONDS: int = 60
    OTP_MAX_SENDS_PER_HOUR: int = 10
    OTP_LOCKOUT_MINUTES: int = 15

    # Face verification abuse
    FACE_MAX_ATTEMPTS: int = 3
    FACE_LOCKOUT_MINUTES: int = 15
    FACE_DAILY_LIMIT: int = 50       # Max face verification attempts per voter per day
    FACE_SERVICE_RATE_LIMIT: int = 10 # Max calls to extract_face_embedding per identifier per minute
    FACE_ENFORCE_SIDE_ANGLE: bool = True

    # Suspicious activity detection
    SUSPICIOUS_ACTIVITY_ENABLED: bool = True
    SUSPICIOUS_MAX_FAILED_LOGINS: int = 10
    SUSPICIOUS_WINDOW_MINUTES: int = 15
    SUSPICIOUS_TEMP_BLOCK_MINUTES: int = 30

    # Exponential lockout backoff multipliers (consecutive lockout cycles)
    LOCKOUT_BACKOFF_MINUTES: list[int] = [15, 30, 60, 1440]  # 15min → 30min → 1hr → 24hr

    # File upload limits
    MAX_IMAGE_SIZE: int = 5 * 1024 * 1024  # 5 MB
    MAX_DOCUMENT_SIZE: int = 10 * 1024 * 1024  # 10 MB
    MAX_VIDEO_SIZE: int = 20 * 1024 * 1024  # 20 MB
    MAX_REQUEST_SIZE: int = 25 * 1024 * 1024  # 25 MB

    # AI Chatbot (Gemini 2.5 Flash)
    # Get your free API key at: https://aistudio.google.com/app/apikey
    # Then paste it in backend/.env as: GEMINI_API_KEY=your_key_here
    GEMINI_API_KEY: str = ""

    # AI Microservice
    AI_SERVICE_URL: str = "http://localhost:8001"
    AI_SERVICE_API_KEY: str = "default-ai-service-key-change-in-prod"

    # Face matching thresholds used by live verification
    # FaceNet128 with euclidean_l2: typical range 0–4. Verified same person = ~0.3–0.9, different = 1.0+
    # Standard recommended threshold: 1.1–1.2 (DeepFace default is 0.8 which is too strict for webcam)
    FACE_MATCH_THRESHOLD: float = 1.15
    # Cosine threshold lowered to 0.45 — webcam compressed frames vs enrollment photo
    # typically score 0.55–0.75. 0.68 was rejecting real matches.
    FACE_MATCH_COSINE_THRESHOLD: float = 0.45
    ENABLE_FACE_VERIFICATION: bool = True
    WARMUP_BIOMETRIC_MODEL: bool = True
    PRELOAD_ARCFACE: bool = False
    SQLALCHEMY_ECHO: bool = False

    ALLOWED_ORIGINS: list[str] = [
        # ── Production ─────────────────────────────────────────────
        "https://online-college-electoral-system.vercel.app",
        # ── Local development ──────────────────────────────────────
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:8080",
        "http://127.0.0.1:8080",
        "http://localhost:8081",
        "http://127.0.0.1:8081",
        "http://localhost:8082",
        "http://127.0.0.1:8082",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
    ]

    @field_validator("ALLOWED_ORIGINS", mode="before")
    @classmethod
    def parse_allowed_origins(cls, value):
        if isinstance(value, str):
            if value.startswith("[") and value.endswith("]"):
                import json
                try:
                    return json.loads(value)
                except Exception:
                    pass
            return [x.strip() for x in value.split(",") if x.strip()]
        return value

    @field_validator("SUPABASE_URL", mode="before")
    @classmethod
    def parse_supabase_url(cls, value):
        if isinstance(value, str):
            return value.strip()
        return value

    @property
    def supabase_project_url(self) -> str:
        return (self.SUPABASE_URL or self.NEXT_PUBLIC_SUPABASE_URL).rstrip("/")

    model_config = ConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
