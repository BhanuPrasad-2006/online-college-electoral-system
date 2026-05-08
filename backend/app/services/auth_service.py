"""Auth service — handles user registration, login, and token management."""

from sqlalchemy.orm import Session
from app.core.security import get_password_hash, verify_password, create_access_token, create_refresh_token


class AuthService:
    def __init__(self, db: Session):
        self.db = db

    async def register(self, email: str, password: str, name: str, roll_number: str, department: str, year: int):
        """Register a new user."""
        # TODO: Check if email/roll_number already exists
        # TODO: Hash password and create user
        # TODO: Send verification OTP
        pass

    async def login(self, email: str, password: str):
        """Authenticate user and return tokens."""
        # TODO: Verify credentials
        # TODO: Generate access and refresh tokens
        pass

    async def refresh_token(self, refresh_token: str):
        """Refresh access token."""
        # TODO: Validate refresh token and issue new pair
        pass
