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
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 5
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

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

    # AI Chatbot (Gemini 2.5 Flash)
    # Get your free API key at: https://aistudio.google.com/app/apikey
    # Then paste it in backend/.env as: GEMINI_API_KEY=your_key_here
    GEMINI_API_KEY: str = ""

    # AI Microservice
    AI_SERVICE_URL: str = "http://localhost:8001"
    AI_SERVICE_API_KEY: str = "default-ai-service-key-change-in-prod"

    ALLOWED_ORIGINS: list[str] = [
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
