from fastapi import APIRouter, Depends, HTTPException, status
from app.core.security import get_current_user

router = APIRouter()


@router.post("/login")
async def login(email: str, password: str):
    """Authenticate user and return JWT tokens."""
    # TODO: Implement login logic
    return {"message": "Login endpoint"}


@router.post("/register")
async def register():
    """Register a new user account."""
    # TODO: Implement registration logic
    return {"message": "Registration endpoint"}


@router.post("/logout")
async def logout(current_user=Depends(get_current_user)):
    """Logout and invalidate tokens."""
    return {"message": "Logged out successfully"}


@router.post("/refresh")
async def refresh_token(refresh_token: str):
    """Refresh access token using refresh token."""
    # TODO: Implement token refresh
    return {"message": "Token refresh endpoint"}


@router.post("/forgot-password")
async def forgot_password(email: str):
    """Send OTP for password reset."""
    # TODO: Implement forgot password
    return {"message": "OTP sent"}


@router.post("/verify-otp")
async def verify_otp(email: str, otp: str):
    """Verify OTP code."""
    # TODO: Implement OTP verification
    return {"message": "OTP verification endpoint"}


@router.get("/me")
async def get_me(current_user=Depends(get_current_user)):
    """Get current user profile."""
    return current_user
