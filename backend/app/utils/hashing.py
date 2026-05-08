"""Hashing utilities for general-purpose hashing."""

import hashlib
import secrets


def sha256_hash(data: str) -> str:
    """Generate SHA-256 hash of a string."""
    return hashlib.sha256(data.encode()).hexdigest()


def generate_salt() -> str:
    """Generate a random salt."""
    return secrets.token_hex(16)


def hash_with_salt(data: str, salt: str) -> str:
    """Hash data with a salt."""
    return sha256_hash(f"{data}:{salt}")
