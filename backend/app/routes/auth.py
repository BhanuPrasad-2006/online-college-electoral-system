import uuid
import jwt
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, status, HTTPException, Request
from app.middleware.rate_limit import limiter
from app.security.device_fingerprint import generate_fingerprint
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.config import settings
from app.db.session import get_db
from app.api.deps import get_current_user
from app.models.voter import Voter
from app.models.candidate import Candidate
from app.models.position import Position
from app.models.election import Election
from app.enums.election_status import ElectionStatusEnum
from app.schemas.auth_schema import (
    VoterLoginRequest,
    VoterOTPVerifyRequest,
    CandidateLoginRequest,
    CandidateOTPVerifyRequest,
    AdminLoginRequest,
    AdminOTPVerifyRequest,
    PasswordChangeRequest,
    PasswordChangeConfirmRequest,
    ForgotPasswordRequest,
    ForgotPasswordConfirmRequest,
    ResendOTPRequest,
    OTPSentResponse,
    AuthTokenResponse,
    CandidateCheckRequest,
    CandidateInitiateRequest,
)
from app.services.auth_service import (
    voter_login_step1,
    voter_login_step2,
    candidate_login_step1,
    candidate_login_step2,
    admin_login_step1,
    admin_login_step2,
    request_password_change_otp,
    confirm_password_change,
    request_forgot_password_otp,
    confirm_forgot_password,
    resend_voter_otp,
    resend_candidate_otp,
    resend_candidate_email_otp,
    resend_candidate_sms_otp,
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
@limiter.limit("10/minute")
async def voter_login(
    request: Request,
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
    request: Request,
    body: VoterOTPVerifyRequest,
    db: AsyncSession = Depends(get_db),
):
    result = await voter_login_step2(db, body.otp_session_token, body.otp, device_fingerprint=generate_fingerprint(request))
    return AuthTokenResponse(**result)


# ─── Candidate Routes ────────────────────────────────────────

@router.post("/candidate/check", status_code=status.HTTP_200_OK)
async def candidate_check(
    body: CandidateCheckRequest,
    db: AsyncSession = Depends(get_db),
):
    email_norm = body.email.strip().lower()
    mobile_norm = body.mobile_number.strip().replace("+91", "").replace(" ", "").replace("-", "")

    # 1. Check if candidate exists
    # Find voter by email first
    voter_res = await db.execute(select(Voter).where(Voter.college_email == email_norm))
    voter = voter_res.scalar_one_or_none()

    if voter:
        # Check if they have a candidate record
        cand_res = await db.execute(select(Candidate).where(Candidate.voter_id == voter.voter_id))
        candidate = cand_res.scalar_one_or_none()

        if candidate:
            # Validate that the entered mobile matches the candidate's registered mobile number!
            stored_mobile = candidate.mobile_number.replace("+91", "").replace(" ", "").replace("-", "").strip()
            entered_mobile = mobile_norm.strip()
            if stored_mobile != entered_mobile:
                return {
                    "status": "ineligible",
                    "reason": "Invalid email or mobile number."
                }
            # Existing candidate
            return {"status": "exists"}

        # Eligible voter but not candidate
        if voter.year_of_study in [3, 4]:
            # Generate temporary token
            expire = datetime.now(timezone.utc) + timedelta(minutes=20)
            payload = {
                "sub": str(voter.voter_id),
                "email": voter.college_email,
                "mobile_number": body.mobile_number,
                "year_of_study": voter.year_of_study,
                "type": "candidate_eligibility_session",
                "exp": expire,
            }
            token = jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm="HS256")
            return {
                "status": "eligible",
                "token": token,
                "voter_details": {
                    "full_name": voter.full_name,
                    "department": voter.department or "",
                    "semester": f"{voter.year_of_study * 2}th" if voter.year_of_study else ""
                }
            }
        else:
            return {
                "status": "ineligible",
                "reason": "Only 3rd and 4th year students can become candidates."
            }

    # 2. Not yet voter in the database
    # Check college email validity
    if not (email_norm.endswith("@college.edu.in") or email_norm.endswith("@dsce.edu.in")):
        return {
            "status": "ineligible",
            "reason": "Invalid college email. You must use your official college email address (@college.edu.in) to register as a candidate."
        }

    return {"status": "need_year"}


@router.post("/candidate/initiate", status_code=status.HTTP_200_OK)
async def candidate_initiate(
    body: CandidateInitiateRequest,
    db: AsyncSession = Depends(get_db),
):
    email_norm = body.email.strip().lower()

    # 1. College email only
    if not (email_norm.endswith("@college.edu.in") or email_norm.endswith("@dsce.edu.in")):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid college email. You must use your official college email address (@college.edu.in)."
        )

    # 2. Year must be 3 or 4
    if body.year_of_study not in [3, 4]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only 3rd and 4th year students can become candidates."
        )

    # 3. Mobile unique check
    cand_mobile_res = await db.execute(select(Candidate).where(Candidate.mobile_number == body.mobile_number))
    if cand_mobile_res.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This mobile number is already registered for a candidate."
        )

    # 4. Check if registration window is open
    election_res = await db.execute(select(Election).order_by(Election.created_at.desc()))
    election = election_res.scalars().first()
    if not election:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No active election found."
        )

    if election.status not in [ElectionStatusEnum.UPCOMING.value, ElectionStatusEnum.REGISTRATION_OPEN.value]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Candidate registration window is closed."
        )

    now = datetime.now(timezone.utc)
    if election.registration_start and election.registration_end:
        if now < election.registration_start or now > election.registration_end:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Candidate registration window is closed."
            )

    # Generate temporary registration token
    expire = datetime.now(timezone.utc) + timedelta(minutes=20)
    payload = {
        "sub": str(uuid.uuid4()), # generate temp voter ID
        "email": email_norm,
        "mobile_number": body.mobile_number,
        "year_of_study": body.year_of_study,
        "type": "candidate_eligibility_session",
        "exp": expire,
    }
    token = jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm="HS256")

    return {
        "status": "eligible",
        "token": token
    }


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
@limiter.limit("10/minute")
async def candidate_login(
    request: Request,
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
    request: Request,
    body: CandidateOTPVerifyRequest,
    db: AsyncSession = Depends(get_db),
):
    result = await candidate_login_step2(
        db, body.otp_session_token, body.email_otp, body.sms_otp, device_fingerprint=generate_fingerprint(request)
    )
    return AuthTokenResponse(**result)
# ─── Admin Routes ─────────────────────────────────────────────

@router.post(
    "/admin/login",
    response_model=OTPSentResponse,
    status_code=status.HTTP_200_OK,
    summary="Admin Step 1 — Email + Password + Mobile OTP dispatch",
)
@limiter.limit("10/minute")
async def admin_login(
    request: Request,
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
    request: Request,
    body: AdminOTPVerifyRequest,
    db: AsyncSession = Depends(get_db),
):
    result = await admin_login_step2(
        db, body.otp_session_token, body.email_otp, body.sms_otp, device_fingerprint=generate_fingerprint(request)
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
        "voter_code": voter.voter_code or "—",
        "voted": voter.has_voted,
        "vote_permission": voter.vote_permission,
    }


@router.get("/candidate/me")
async def get_candidate_profile(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Fetch current logged-in candidate's profile from the database."""
    user_id_str = current_user.get("user_id")
    if not user_id_str:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")

    try:
        user_uuid = uuid.UUID(user_id_str)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid UUID format")

    query = select(Candidate).where(Candidate.candidate_id == user_uuid)
    result = await db.execute(query)
    candidate = result.scalar_one_or_none()

    if not candidate:
        # Fallback: check if the subject was voter_id
        query = select(Candidate).where(Candidate.voter_id == user_uuid)
        result = await db.execute(query)
        candidate = result.scalar_one_or_none()

    if not candidate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate profile not found")

    voter_query = select(Voter).where(Voter.voter_id == candidate.voter_id)
    voter_result = await db.execute(voter_query)
    voter = voter_result.scalar_one_or_none()

    if not voter:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Voter profile not found")

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


# ─── Password Change Endpoints ────────────────────────────────

@router.post(
    "/change-password/request",
    status_code=status.HTTP_200_OK,
    summary="Request a password change (Step 1 — Verify current, dispatch OTP)",
)
@limiter.limit("10/minute")
async def request_password_change(
    request: Request,
    body: PasswordChangeRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    voter_id = current_user.get("user_id")
    if not voter_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")

    result = await request_password_change_otp(
        db=db,
        voter_id=voter_id,
        current_password=body.current_password,
        new_password=body.new_password,
    )
    return result


@router.post(
    "/change-password/confirm",
    status_code=status.HTTP_200_OK,
    summary="Confirm password change (Step 2 — Verify OTP, commit change)",
)
async def confirm_password_change_route(
    body: PasswordChangeConfirmRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    voter_id = current_user.get("user_id")
    if not voter_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")

    result = await confirm_password_change(
        db=db,
        voter_id=voter_id,
        otp_session_token=body.otp_session_token,
        otp=body.otp,
    )
    return result


# ─── Forgot Password Endpoints ───────────────────────────────

@router.post(
    "/forgot-password/request",
    status_code=status.HTTP_200_OK,
    summary="Request password reset (Step 1 — Verify email, dispatch OTP)",
)
@limiter.limit("10/minute")
async def forgot_password_request_route(
    request: Request,
    body: ForgotPasswordRequest,
    db: AsyncSession = Depends(get_db),
):
    result = await request_forgot_password_otp(
        db=db,
        email=body.email,
    )
    return result


@router.post(
    "/forgot-password/confirm",
    status_code=status.HTTP_200_OK,
    summary="Confirm password reset (Step 2 — Verify OTP, apply new password)",
)
async def forgot_password_confirm_route(
    body: ForgotPasswordConfirmRequest,
    db: AsyncSession = Depends(get_db),
):
    result = await confirm_forgot_password(
        db=db,
        otp_session_token=body.otp_session_token,
        otp=body.otp,
        new_password=body.new_password,
    )
    return result


# ─── Resend OTP Routes ────────────────────────────────────────

@router.post(
    "/voter/resend-otp",
    response_model=OTPSentResponse,
    status_code=status.HTTP_200_OK,
    summary="Resend Voter Login OTP",
)
@limiter.limit("10/minute")
async def voter_resend_otp_route(
    request: Request,
    body: ResendOTPRequest,
    db: AsyncSession = Depends(get_db),
):
    result = await resend_voter_otp(
        db=db,
        otp_session_token=body.otp_session_token,
    )
    return result


@router.post(
    "/candidate/resend-otp",
    response_model=OTPSentResponse,
    status_code=status.HTTP_200_OK,
    summary="Resend Candidate Login OTP",
)
@limiter.limit("10/minute")
async def candidate_resend_otp_route(
    request: Request,
    body: ResendOTPRequest,
    db: AsyncSession = Depends(get_db),
):
    result = await resend_candidate_otp(
        db=db,
        otp_session_token=body.otp_session_token,
    )
    return result


@router.post(
    "/candidate/resend-email-otp",
    response_model=OTPSentResponse,
    status_code=status.HTTP_200_OK,
    summary="Resend Candidate Email OTP",
)
@limiter.limit("10/minute")
async def candidate_resend_email_otp_route(
    request: Request,
    body: ResendOTPRequest,
    db: AsyncSession = Depends(get_db),
):
    result = await resend_candidate_email_otp(
        db=db,
        otp_session_token=body.otp_session_token,
    )
    return result


@router.post(
    "/candidate/resend-sms-otp",
    response_model=OTPSentResponse,
    status_code=status.HTTP_200_OK,
    summary="Resend Candidate SMS OTP",
)
@limiter.limit("10/minute")
async def candidate_resend_sms_otp_route(
    request: Request,
    body: ResendOTPRequest,
    db: AsyncSession = Depends(get_db),
):
    result = await resend_candidate_sms_otp(
        db=db,
        otp_session_token=body.otp_session_token,
    )
    return result

# ─── Logout Endpoint ──────────────────────────────────────────

from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
security_scheme = HTTPBearer()

@router.post(
    "/logout",
    status_code=status.HTTP_200_OK,
    summary="Logout user and invalidate token",
)
async def logout(
    credentials: HTTPAuthorizationCredentials = Depends(security_scheme),
    db: AsyncSession = Depends(get_db),
):
    token = credentials.credentials
    from app.models.blacklisted_token import BlacklistedToken
    blacklisted = BlacklistedToken(token=token)
    db.add(blacklisted)
    try:
        await db.commit()
    except Exception:
        pass
    return {"message": "Successfully logged out"}

