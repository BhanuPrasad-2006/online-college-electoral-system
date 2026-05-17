from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.schemas.auth_schema import (
    VoterLoginRequest,
    VoterOTPVerifyRequest,
    CandidateLoginRequest,
    CandidateOTPVerifyRequest,
    OTPSentResponse,
    AuthTokenResponse,
)
from app.services.auth_service import (
    voter_login_step1,
    voter_login_step2,
    candidate_login_step1,
    candidate_login_step2,
)

router = APIRouter(prefix="/auth", tags=["Authentication"])


# ─── Voter Routes ─────────────────────────────────────────────

@router.post(
    "/voter/login",
    response_model=OTPSentResponse,
    status_code=status.HTTP_200_OK,
    summary="Voter Step 1 — Email + Password",
    description=(
        "Verify voter credentials. On success, sends a 6-digit OTP to the registered email "
        "and returns a short-lived session token (valid 15 min) to be used in step 2."
    ),
)
async def voter_login(
    body: VoterLoginRequest,
    db: AsyncSession = Depends(get_db),
):
    result = await voter_login_step1(db, body.email, body.password)
    return OTPSentResponse(
        message="OTP sent to your registered email address.",
        otp_session_token=result["otp_session_token"],
        hint=result["hint"],
    )


@router.post(
    "/voter/verify-otp",
    response_model=AuthTokenResponse,
    status_code=status.HTTP_200_OK,
    summary="Voter Step 2 — Verify Email OTP",
    description=(
        "Submit the OTP received by email along with the session token from step 1. "
        "Returns a full JWT access token on success."
    ),
)
async def voter_verify_otp(
    body: VoterOTPVerifyRequest,
    db: AsyncSession = Depends(get_db),
):
    result = await voter_login_step2(db, body.otp_session_token, body.otp)
    return AuthTokenResponse(**result)


# ─── Candidate Routes ────────────────────────────────────────

@router.post(
    "/candidate/login",
    response_model=OTPSentResponse,
    status_code=status.HTTP_200_OK,
    summary="Candidate Step 1 — Email + Mobile + Password",
    description=(
        "Verify candidate credentials including mobile number. On success, sends OTP to "
        "both registered email AND mobile (SMS). Returns a 15-min session token."
    ),
)
async def candidate_login(
    body: CandidateLoginRequest,
    db: AsyncSession = Depends(get_db),
):
    result = await candidate_login_step1(
        db, body.email, body.mobile_number, body.password
    )
    return OTPSentResponse(
        message="OTP sent to your registered email and mobile number.",
        otp_session_token=result["otp_session_token"],
        hint=result["hint"],
    )


@router.post(
    "/candidate/verify-otp",
    response_model=AuthTokenResponse,
    status_code=status.HTTP_200_OK,
    summary="Candidate Step 2 — Verify Email OTP + SMS OTP",
    description=(
        "Submit BOTH the email OTP and SMS OTP. Both must be correct. "
        "Returns a full JWT access token on success."
    ),
)
async def candidate_verify_otp(
    body: CandidateOTPVerifyRequest,
    db: AsyncSession = Depends(get_db),
):
    result = await candidate_login_step2(
        db, body.otp_session_token, body.email_otp, body.sms_otp
    )
    return AuthTokenResponse(**result)
