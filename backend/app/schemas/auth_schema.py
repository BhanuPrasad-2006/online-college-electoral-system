from pydantic import BaseModel, EmailStr
from typing import Optional


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    name: str
    roll_number: str
    department: str
    year: int


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int


class OTPVerifyRequest(BaseModel):
    email: EmailStr
    otp: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class UserResponse(BaseModel):
    id: str
    email: str
    name: str
    roll_number: str
    department: str
    year: int
    role: str
    is_verified: bool

    class Config:
        from_attributes = True
