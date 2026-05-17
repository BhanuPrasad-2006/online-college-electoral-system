from fastapi import APIRouter, Depends, status, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.session import get_db
from app.api.deps import get_current_user
from app.models.voter import Voter
from app.models.candidate import Candidate
from app.models.position import Position
from app.schemas.auth_schema import (
    VoterLoginRequest,
    VoterOTPVerifyRequest,
    CandidateLoginRequest,
    CandidateOTPVerifyRequest,
    AdminLoginRequest,
    AdminOTPVerifyRequest,
    OTPSentResponse,
    AuthTokenResponse,
)
from app.services.auth_service import (
    voter_login_step1,
    voter_login_step2,
    candidate_login_step1,
    candidate_login_step2,
    admin_login_step1,
    admin_login_step2,
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
# ─── Admin Routes ─────────────────────────────────────────────

@router.post(
    "/admin/login",
    response_model=OTPSentResponse,
    status_code=status.HTTP_200_OK,
    summary="Admin Step 1 — Email + Password + Mobile OTP dispatch",
)
async def admin_login(
    body: AdminLoginRequest,
    db: AsyncSession = Depends(get_db),
):
    result = await admin_login_step1(
        db, body.email, body.mobile_number, body.password
    )
    return OTPSentResponse(
        message="OTP sent to your registered email and mobile number.",
        otp_session_token=result["otp_session_token"],
        hint=result["hint"],
    )


@router.post(
    "/admin/verify-otp",
    response_model=AuthTokenResponse,
    status_code=status.HTTP_200_OK,
    summary="Admin Step 2 — Verify Email OTP + SMS OTP",
)
async def admin_verify_otp(
    body: AdminOTPVerifyRequest,
    db: AsyncSession = Depends(get_db),
):
    result = await admin_login_step2(
        db, body.otp_session_token, body.email_otp, body.sms_otp
    )
    return AuthTokenResponse(**result)


# ─── Profile Endpoints ────────────────────────────────────────

@router.get("/voter/me")
async def get_voter_profile(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Fetch current logged-in voter's profile from the database without password."""
    voter_id = current_user.get("user_id")
    if not voter_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")

    query = select(Voter).where(Voter.voter_id == voter_id)
    result = await db.execute(query)
    voter = result.scalar_one_or_none()

    if not voter:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Voter not found")

    # Format year suffix nicely
    year = voter.year_of_study
    if year:
        suffixes = {1: "st", 2: "nd", 3: "rd"}
        suffix = suffixes.get(year, "th")
        year_str = f"{year}{suffix} Year"
    else:
        year_str = "—"

    return {
        "name": voter.full_name,
        "email": voter.college_email,
        "department": voter.department or "—",
        "year": year_str,
        "studentId": voter.student_id or "—",
        "voted": voter.has_voted,
    }


@router.get("/candidate/me")
async def get_candidate_profile(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Fetch current logged-in candidate's profile from the database."""
    voter_id = current_user.get("user_id")
    if not voter_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")

    query = select(Candidate).where(Candidate.voter_id == voter_id)
    result = await db.execute(query)
    candidate = result.scalar_one_or_none()

    voter_query = select(Voter).where(Voter.voter_id == voter_id)
    voter_result = await db.execute(voter_query)
    voter = voter_result.scalar_one_or_none()

    if not voter:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found")

    position_title = "—"
    status_str = "Pending"
    if candidate:
        status_str = candidate.status.value if hasattr(candidate.status, "value") else str(candidate.status)
        if candidate.position_id:
            pos_query = select(Position).where(Position.position_id == candidate.position_id)
            pos_result = await db.execute(pos_query)
            position = pos_result.scalar_one_or_none()
            if position:
                position_title = position.title

    year = voter.year_of_study
    if year:
        suffixes = {1: "st", 2: "nd", 3: "rd"}
        suffix = suffixes.get(year, "th")
        year_str = f"{year}{suffix} Year"
    else:
        year_str = "—"

    return {
        "name": voter.full_name,
        "email": voter.college_email,
        "department": voter.department or "—",
        "year": year_str,
        "position": position_title,
        "status": status_str,
    }
