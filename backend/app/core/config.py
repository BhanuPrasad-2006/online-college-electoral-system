from pydantic_settings import BaseSettings
from typing import List
import json


class Settings(BaseSettings):
    # Database
    DATABASE_URL: str = "postgresql://election_user:election_pass@localhost:5432/college_election"
    REDIS_URL: str = "redis://localhost:6379/0"

    # JWT
    JWT_SECRET_KEY: str = "your-super-secret-jwt-key-change-in-production"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # CORS
    CORS_ORIGINS: List[str] = ["http://localhost:3000"]

    # Email
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""

    # AI Service
    AI_SERVICE_URL: str = "http://localhost:8001"

    class Config:
        env_file = ".env"
        extra = "allow"

    @property
    def async_database_url(self) -> str:
        return self.DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://")


settings = Settings()
