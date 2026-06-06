import sys
import os
import bcrypt


def hash_password(plain_password: str) -> str:
    """Hash a plain password using bcrypt."""
    is_testing = "pytest" in sys.modules or os.getenv("TESTING") == "True"
    rounds = 4 if is_testing else 12
    salt = bcrypt.gensalt(rounds=rounds)
    hashed = bcrypt.hashpw(plain_password.encode("utf-8"), salt)
    return hashed.decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plain password against its bcrypt hash."""
    try:
        return bcrypt.checkpw(
            plain_password.encode("utf-8"),
            hashed_password.encode("utf-8"),
        )
    except Exception:
        return False