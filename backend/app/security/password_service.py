"""Password service — hashing and verification."""

from app.core.security import get_password_hash, verify_password


class PasswordService:
    @staticmethod
    def hash(password: str) -> str:
        return get_password_hash(password)

    @staticmethod
    def verify(plain: str, hashed: str) -> bool:
        return verify_password(plain, hashed)
