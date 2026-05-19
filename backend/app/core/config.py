from pydantic_settings import BaseSettings
from functools import lru_cache
from pydantic import ConfigDict


class Settings(BaseSettings):

    # App
    APP_NAME: str = "College Election API"
    APP_ENV: str = "development"
    DEBUG: bool = False
    API_V1_PREFIX: str = "/api/v1"

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://user:password@localhost:5432/election_db"
    DATABASE_POOLER_URL: str
    # JWT
    JWT_SECRET_KEY: str = "your-super-secret-key-change-in-production"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 5

    # OTP
    OTP_EXPIRE_MINUTES: int = 10
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

    model_config = ConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()