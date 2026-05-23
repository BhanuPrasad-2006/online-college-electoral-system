from pydantic import BaseModel, EmailStr
from typing import Optional


# ─────────────────────────────────────────────
# VOTER AUTH SCHEMAS
# ─────────────────────────────────────────────

class VoterLoginRequest(BaseModel):
    email: EmailStr
    password: str


class VoterOTPVerifyRequest(BaseModel):
    otp_session_token: str
    otp: str


# ─────────────────────────────────────────────
# CANDIDATE AUTH SCHEMAS
# ─────────────────────────────────────────────

class CandidateLoginRequest(BaseModel):
    email: EmailStr
    mobile_number: str
    password: str


class CandidateOTPVerifyRequest(BaseModel):
    otp_session_token: str
    email_otp: str
    sms_otp: str


# ─────────────────────────────────────────────
# RESPONSE SCHEMAS
# ─────────────────────────────────────────────

class OTPSentResponse(BaseModel):
    message: str
    otp_session_token: str
    hint: str


class AuthTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    user_id: str
    full_name: str
    expires_in_seconds: int
    is_registered: Optional[bool] = None
    department: Optional[str] = None
    semester: Optional[str] = None
    csrf_token: Optional[str] = None


# ─────────────────────────────────────────────
# ADMIN AUTH SCHEMAS
# ─────────────────────────────────────────────

class AdminLoginRequest(BaseModel):
    email: EmailStr
    mobile_number: str
    password: str


class AdminOTPVerifyRequest(BaseModel):
    otp_session_token: str
    email_otp: str
    sms_otp: str


# ─────────────────────────────────────────────
# CHANGE PASSWORD SCHEMAS
# ─────────────────────────────────────────────

class PasswordChangeRequest(BaseModel):
    current_password: str
    new_password: str


class PasswordChangeConfirmRequest(BaseModel):
    otp_session_token: str
    otp: str


class ResendOTPRequest(BaseModel):
    otp_session_token: str


# ─────────────────────────────────────────────
# FORGOT PASSWORD SCHEMAS
# ─────────────────────────────────────────────

class ForgotPasswordRequest(BaseModel):
    email: str


class ForgotPasswordConfirmRequest(BaseModel):
    otp_session_token: str
    otp: str
    new_password: str


class CandidateCheckRequest(BaseModel):
    email: EmailStr
    mobile_number: str


class CandidateInitiateRequest(BaseModel):
    email: EmailStr
    mobile_number: str
    year_of_study: int