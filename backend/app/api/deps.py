"""API dependencies — shared dependency injection for route handlers."""

from typing import Generator
from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.db.session import SessionLocal
from app.security.jwt_service import JWTService


def get_db() -> Generator:
    """Yield a database session per request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


async def get_current_user(db: Session = Depends(get_db)):
    """Extract and validate the current user from JWT token."""
    # TODO: Extract token from Authorization header, decode, and fetch user
    pass


async def get_current_active_user(current_user=Depends(get_current_user)):
    """Ensure the current user is active."""
    if current_user and not current_user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Inactive user")
    return current_user


async def get_admin_user(current_user=Depends(get_current_active_user)):
    """Ensure the current user has admin role."""
    if current_user and current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return current_user


async def get_candidate_user(current_user=Depends(get_current_active_user)):
    """Ensure the current user has candidate role."""
    if current_user and current_user.role not in ("candidate", "admin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Candidate access required")
    return current_user
