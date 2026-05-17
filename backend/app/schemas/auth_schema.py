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