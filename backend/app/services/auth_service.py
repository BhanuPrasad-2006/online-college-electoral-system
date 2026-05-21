import asyncio
import jwt
import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import joinedload
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.voter import Voter
from app.models.candidate import Candidate
from app.models.admin_user import AdminUser

from app.security.password_service import verify_password, hash_password
from app.security.jwt_service import (
    create_access_token,
    create_otp_session_token,
    decode_access_token,
)

from app.services.otp_service import (
    create_and_store_otp,
    verify_otp,
)

from app.services.email_service import send_otp_email
from app.services.sms_service import send_otp_sms, send_custom_sms

from app.enums.otp_type import OTPTypeEnum
from app.enums.roles import UserRoleEnum

from app.core.config import settings

from app.exceptions.auth_exceptions import (
    InvalidCredentialsError,
    AccountNotVerifiedError,
    OTPError,
    OTPSessionExpiredError,
    MobileEmailMismatchError,
    CandidateRejectedError,
    CandidateEligibilityError,
)

from app.utils.logger import logger


# =========================================================
# HELPERS
# =========================================================

def _mask_email(email: str) -> str:
    local, domain = email.split("@")
    return f"{local[:2]}***@{domain}"


def _mask_mobile(mobile: str) -> str:
    return f"{'*' * 6}{mobile[-4:]}"


def _normalize_email(email: str) -> str:
    return email.strip().lower()


def _email_equals(column, email: str):
    return func.lower(column) == _normalize_email(email)


# =========================================================
# VOTER LOGIN STEP 1
# =========================================================

async def voter_login_step1(
    db: AsyncSession,
    email: str,
    password: str,
) -> dict:

    result = await db.execute(
        select(Voter).where(_email_equals(Voter.college_email, email))
    )

    voter = result.scalars().first()

    if not voter:
        raise InvalidCredentialsError()

    if not verify_password(password, voter.password_hash):
        raise InvalidCredentialsError()

    if not voter.is_verified:
        raise AccountNotVerifiedError()

    otp_record, email_otp = await create_and_store_otp(
        db=db,
        recipient=voter.college_email,
        otp_type=OTPTypeEnum.EMAIL,
    )

    # Fire SMTP email sending in the background to ensure instant login response
    asyncio.create_task(
        send_otp_email(
            to_email=voter.college_email,
            recipient_name=voter.full_name,
            otp=email_otp,
            purpose="login",
        )
    )

    await db.commit()

    session_token = create_otp_session_token(
        voter_id=str(voter.voter_id),
        email=voter.college_email,
        otp_id=str(otp_record.otp_id),
    )

    return {
        "otp_session_token": session_token,
        "hint": f"OTP sent to {_mask_email(voter.college_email)}",
    }


# =========================================================
# VOTER LOGIN STEP 2
# =========================================================

async def voter_login_step2(
    db: AsyncSession,
    otp_session_token: str,
    otp: str,
) -> dict:

    try:
        payload = decode_access_token(otp_session_token)

    except jwt.ExpiredSignatureError:
        raise OTPSessionExpiredError()

    except jwt.PyJWTError:
        raise InvalidCredentialsError("Invalid session token")

    user_id = payload.get("sub")

    try:
        voter_uuid = uuid.UUID(user_id)
    except ValueError:
        raise InvalidCredentialsError("Invalid voter ID")

    result = await db.execute(
        select(Voter).where(
            Voter.voter_id == voter_uuid
        )
    )

    voter = result.scalars().first()

    if not voter:
        raise InvalidCredentialsError("Voter not found")

    ok, msg = await verify_otp(
        db=db,
        recipient=voter.college_email,
        plain_otp=otp,
        otp_type=OTPTypeEnum.EMAIL,
    )

    if not ok:
        raise OTPError(msg)

    await db.commit()

    access_token = create_access_token(
        data={
            "sub": str(voter.voter_id),
            "role": UserRoleEnum.VOTER.value,
            "email": voter.college_email,
        }
    )

    # Trigger login security alert SMS if mobile number exists
    if voter.mobile_number:
        try:
            msg = "Security Alert: You have successfully logged in to CollegeVote. If this wasn't you, please secure your account or change your password immediately."
            asyncio.create_task(send_custom_sms(voter.mobile_number, msg))
        except Exception:
            pass

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "role": UserRoleEnum.VOTER.value,
        "user_id": str(voter.voter_id),
        "full_name": voter.full_name,
        "expires_in_seconds": settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    }


# =========================================================
# CANDIDATE LOGIN STEP 1
# =========================================================

async def candidate_login_step1(
    db: AsyncSession,
    email: str,
    mobile_number: str,
    password: str,
) -> dict:

    voter_result = await db.execute(
        select(Voter).where(
            _email_equals(Voter.college_email, email)
        )
    )

    voter = voter_result.scalars().first()

    if not voter:
        raise InvalidCredentialsError("Voter profile not found. You must be registered as a voter first.")

    if not verify_password(password, voter.password_hash):
        raise InvalidCredentialsError("Invalid credentials. Please check your email and password.")

    if not voter.is_verified:
        raise AccountNotVerifiedError()

    candidate_result = await db.execute(
        select(Candidate).where(
            Candidate.voter_id == voter.voter_id
        )
    )

    candidate = candidate_result.scalars().first()

    if candidate:
        # Case 1: Candidate is already registered!
        status_str = candidate.status.value if hasattr(candidate.status, "value") else str(candidate.status)
        if status_str == "REJECTED":
            # Problem 3: If candidate is rejected by admin -> no otp, no dashboard, tells you are rejected and reason
            raise CandidateRejectedError(
                message="Your candidate registration was rejected by the admin.",
                remarks=candidate.admin_remarks or "No remarks provided by admin."
            )

        # Validate stored mobile matches entered mobile
        stored_mobile = candidate.mobile_number.replace("+91", "").replace(" ", "").strip()
        entered_mobile = mobile_number.replace("+91", "").replace(" ", "").strip()
        if stored_mobile != entered_mobile:
            raise MobileEmailMismatchError("Mobile number does not match registered candidate mobile.")

        # Generate and store OTPs
        email_otp_record, email_otp = await create_and_store_otp(
            db=db,
            recipient=voter.college_email,
            otp_type=OTPTypeEnum.EMAIL,
        )

        sms_otp_record, sms_otp = await create_and_store_otp(
            db=db,
            recipient=candidate.mobile_number,
            otp_type=OTPTypeEnum.SMS,
        )

        # Send OTPs
        asyncio.create_task(
            send_otp_email(
                to_email=voter.college_email,
                recipient_name=voter.full_name,
                otp=email_otp,
                purpose="login",
            )
        )
        asyncio.create_task(
            send_otp_sms(
                mobile_number=candidate.mobile_number,
                otp=sms_otp,
                recipient_name=voter.full_name,
            )
        )

        await db.commit()

        session_token = create_otp_session_token(
            voter_id=str(voter.voter_id),
            email=voter.college_email,
            otp_id=str(email_otp_record.otp_id),
            is_registered=True,
            mobile_number=candidate.mobile_number,
        )

        return {
            "otp_session_token": session_token,
            "hint": f"OTP sent to {_mask_email(voter.college_email)} and {_mask_mobile(candidate.mobile_number)}",
            "is_registered": True,
        }

    else:
        # Case 2: Candidate is NOT registered yet! Verify Voter's year of study eligibility!
        # Only 3rd and 4th year voters are eligible to register as candidates.
        if voter.year_of_study in [1, 2]:
            raise CandidateEligibilityError(
                "First and second-year students are not eligible to contest elections."
            )

        # Proceed to send OTP for candidate registration check!
        # Validate format of entered mobile
        entered_mobile = mobile_number.replace("+91", "").replace(" ", "").strip()
        if len(entered_mobile) != 10 or not entered_mobile.isdigit():
            raise MobileEmailMismatchError("Invalid mobile number format. Must be 10 digits.")

        full_mobile = f"+91 {entered_mobile}"

        # Generate and store OTPs
        email_otp_record, email_otp = await create_and_store_otp(
            db=db,
            recipient=voter.college_email,
            otp_type=OTPTypeEnum.EMAIL,
        )

        sms_otp_record, sms_otp = await create_and_store_otp(
            db=db,
            recipient=full_mobile,
            otp_type=OTPTypeEnum.SMS,
        )

        # Send OTPs
        asyncio.create_task(
            send_otp_email(
                to_email=voter.college_email,
                recipient_name=voter.full_name,
                otp=email_otp,
                purpose="registration",
            )
        )
        asyncio.create_task(
            send_otp_sms(
                mobile_number=full_mobile,
                otp=sms_otp,
                recipient_name=voter.full_name,
            )
        )

        await db.commit()

        session_token = create_otp_session_token(
            voter_id=str(voter.voter_id),
            email=voter.college_email,
            otp_id=str(email_otp_record.otp_id),
            is_registered=False,
            mobile_number=full_mobile,
        )

        return {
            "otp_session_token": session_token,
            "hint": f"Verification OTP sent to {_mask_email(voter.college_email)} and {_mask_mobile(full_mobile)}",
            "is_registered": False,
        }


# =========================================================
# CANDIDATE LOGIN STEP 2
# =========================================================

async def candidate_login_step2(
    db: AsyncSession,
    otp_session_token: str,
    email_otp: str,
    sms_otp: str,
) -> dict:

    try:
        payload = decode_access_token(otp_session_token)
    except jwt.ExpiredSignatureError:
        raise OTPSessionExpiredError()
    except jwt.PyJWTError:
        raise InvalidCredentialsError("Invalid session token")

    voter_id_str = payload.get("sub")
    is_registered = payload.get("is_registered", False)
    mobile_number = payload.get("mobile_number")

    try:
        voter_uuid = uuid.UUID(voter_id_str)
    except ValueError:
        raise InvalidCredentialsError("Invalid voter ID")

    # Fetch Voter details
    voter_result = await db.execute(
        select(Voter).where(Voter.voter_id == voter_uuid)
    )
    voter = voter_result.scalars().first()
    if not voter:
        raise InvalidCredentialsError("Voter profile not found")

    # 1. Verify Email OTP
    email_ok, email_msg = await verify_otp(
        db=db,
        recipient=voter.college_email,
        plain_otp=email_otp,
        otp_type=OTPTypeEnum.EMAIL,
    )
    if not email_ok:
        raise OTPError(email_msg)

    # 2. Verify SMS OTP
    sms_ok, sms_msg = await verify_otp(
        db=db,
        recipient=mobile_number,
        plain_otp=sms_otp,
        otp_type=OTPTypeEnum.SMS,
    )
    if not sms_ok:
        raise OTPError(sms_msg)

    await db.commit()

    # If is_registered is True, we have an existing candidate profile
    if is_registered:
        candidate_result = await db.execute(
            select(Candidate).where(Candidate.voter_id == voter_uuid)
        )
        candidate = candidate_result.scalars().first()
        if not candidate:
            raise InvalidCredentialsError("Candidate profile not found")

        candidate.mobile_verified = True
        await db.commit()

        # Access token sub is the candidate_id for registered candidates
        access_token = create_access_token(
            data={
                "sub": str(candidate.candidate_id),
                "role": UserRoleEnum.CANDIDATE.value,
                "email": voter.college_email,
            }
        )

        return {
            "access_token": access_token,
            "token_type": "bearer",
            "role": UserRoleEnum.CANDIDATE.value,
            "user_id": str(candidate.candidate_id),
            "full_name": voter.full_name,
            "expires_in_seconds": settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
            "is_registered": True,
            "department": voter.department,
            "semester": str((voter.year_of_study * 2) - 1) if voter.year_of_study is not None else None,
        }
    else:
        # If not registered yet, we create a temporary registration JWT token!
        # Its role is still candidate, but is_registered is returned as False!
        # The frontend will receive this, see is_registered=False, and render the wizard using this JWT token!
        access_token = create_access_token(
            data={
                "sub": str(voter.voter_id),
                "role": UserRoleEnum.CANDIDATE.value,
                "email": voter.college_email,
                "temp_reg": True,
                "mobile_number": mobile_number,
            }
        )

        return {
            "access_token": access_token,
            "token_type": "bearer",
            "role": UserRoleEnum.CANDIDATE.value,
            "user_id": str(voter.voter_id),
            "full_name": voter.full_name,
            "expires_in_seconds": settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
            "is_registered": False,
            "department": voter.department,
            "semester": str((voter.year_of_study * 2) - 1) if voter.year_of_study is not None else None,
            "mobile_number": mobile_number,
        }


# =========================================================
# ADMIN AUTH SERVICES
# =========================================================

async def admin_login_step1(
    db: AsyncSession,
    email: str,
    mobile_number: str,
    password: str,
) -> dict:
    """
    Step 1: Authenticate Admin User by password, generate/dispatch dual OTPs (Email + SMS).
    """
    # 1. Fetch admin user
    result = await db.execute(
        select(AdminUser).where(_email_equals(AdminUser.email, email))
    )
    admin = result.scalars().first()

    if not admin:
        raise InvalidCredentialsError("Invalid email or password")

    if not verify_password(password, admin.password_hash):
        raise InvalidCredentialsError("Invalid email or password")

    # 2. Create and store OTPs
    email_otp_record, email_otp = await create_and_store_otp(
        db=db,
        recipient=admin.email,
        otp_type=OTPTypeEnum.EMAIL,
    )

    sms_otp_record, sms_otp = await create_and_store_otp(
        db=db,
        recipient=mobile_number,
        otp_type=OTPTypeEnum.SMS,
    )

    # 3. Trigger OTP email and SMS in the background
    asyncio.create_task(
        send_otp_email(
            to_email=admin.email,
            recipient_name=admin.full_name,
            otp=email_otp,
            purpose="login",
        )
    )
    asyncio.create_task(
        send_otp_sms(
            mobile_number=mobile_number,
            otp=sms_otp,
            recipient_name=admin.full_name,
        )
    )

    await db.commit()

    # 4. Generate OTP session token
    from datetime import datetime, timedelta, timezone
    expire = datetime.now(timezone.utc) + timedelta(minutes=10)
    payload = {
        "sub": str(admin.admin_id),
        "email": admin.email,
        "mobile": mobile_number,
        "type": "otp_session",
        "exp": expire,
    }
    session_token = jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm="HS256")

    return {
        "otp_session_token": session_token,
        "hint": f"Verification OTPs sent to {email} and +91-{mobile_number[-4:].rjust(10, 'X')}",
    }


async def admin_login_step2(
    db: AsyncSession,
    otp_session_token: str,
    email_otp: str,
    sms_otp: str,
) -> dict:
    """
    Step 2: Verify both OTP codes for the admin session and issue access JWT.
    """
    try:
        payload = decode_access_token(otp_session_token)
        if not payload or payload.get("type") != "otp_session":
            raise InvalidCredentialsError("Invalid session token")
    except jwt.PyJWTError:
        raise InvalidCredentialsError("Invalid session token")

    admin_id_str = payload.get("sub")
    email = payload.get("email")
    mobile = payload.get("mobile")

    result = await db.execute(
        select(AdminUser).where(AdminUser.admin_id == admin_id_str)
    )
    admin = result.scalars().first()

    if not admin:
        raise InvalidCredentialsError("Admin user not found")

    # Verify both OTPs
    email_ok, email_msg = await verify_otp(
        db=db,
        recipient=admin.email,
        plain_otp=email_otp,
        otp_type=OTPTypeEnum.EMAIL,
    )

    if not email_ok:
        raise OTPError(email_msg)

    sms_ok, sms_msg = await verify_otp(
        db=db,
        recipient=mobile,
        plain_otp=sms_otp,
        otp_type=OTPTypeEnum.SMS,
    )

    if not sms_ok:
        raise OTPError(sms_msg)

    await db.commit()

    # Generate Access JWT Token for Admin
    access_token = create_access_token(
        data={
            "sub": str(admin.admin_id),
            "role": "admin",
            "email": admin.email,
        }
    )

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "role": "admin",
        "user_id": str(admin.admin_id),
        "full_name": admin.full_name,
        "expires_in_seconds": settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    }


# =========================================================
# PASSWORD CHANGE SERVICES (OTP SECURED)
# =========================================================

async def request_password_change_otp(
    db: AsyncSession,
    voter_id: str,
    current_password: str,
    new_password: str,
) -> dict:
    """
    Step 1: Verify current password, then generate and send Email OTP for password change request.
    """
    # 1. Fetch voter
    user_uuid = uuid.UUID(voter_id)
    cand_query = select(Candidate).where(Candidate.candidate_id == user_uuid)
    cand_result = await db.execute(cand_query)
    candidate = cand_result.scalar_one_or_none()

    if candidate:
        query = select(Voter).where(Voter.voter_id == candidate.voter_id)
    else:
        query = select(Voter).where(Voter.voter_id == user_uuid)

    result = await db.execute(query)
    voter = result.scalar_one_or_none()

    if not voter:
        raise InvalidCredentialsError("Voter profile not found")

    # 2. Verify current password
    if not verify_password(current_password, voter.password_hash):
        raise InvalidCredentialsError("Current password is incorrect")

    # 3. Create and store OTP
    email_otp_record, email_otp = await create_and_store_otp(
        db=db,
        recipient=voter.college_email,
        otp_type=OTPTypeEnum.EMAIL,
    )

    # 4. Trigger OTP email in the background
    asyncio.create_task(
        send_otp_email(
            to_email=voter.college_email,
            recipient_name=voter.full_name,
            otp=email_otp,
            purpose="password_reset",
        )
    )

    await db.commit()

    # 5. Generate OTP session token containing hashed new password!
    new_hash = hash_password(new_password)
    from datetime import datetime, timezone, timedelta
    expire = datetime.now(timezone.utc) + timedelta(minutes=10)
    payload = {
        "sub": voter_id,
        "email": voter.college_email,
        "new_password_hash": new_hash,
        "type": "password_change_session",
        "exp": expire,
    }
    session_token = jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm="HS256")

    email_parts = voter.college_email.split("@")
    masked = email_parts[0][:2] + "***" + "@" + email_parts[1]

    return {
        "otp_session_token": session_token,
        "hint": f"A verification OTP has been sent to your email ({masked}).",
    }


async def confirm_password_change(
    db: AsyncSession,
    voter_id: str,
    otp_session_token: str,
    otp: str,
) -> dict:
    """
    Step 2: Verify Email OTP and apply the new password hash from session token to database.
    """
    try:
        payload = decode_access_token(otp_session_token)
        if not payload or payload.get("type") != "password_change_session":
            raise InvalidCredentialsError("Invalid verification session")
    except jwt.PyJWTError:
        raise InvalidCredentialsError("Invalid verification session")

    token_voter_id = payload.get("sub")
    if token_voter_id != voter_id:
        raise InvalidCredentialsError("Unauthorized password change request")

    email = payload.get("email")
    new_password_hash = payload.get("new_password_hash")

    # Verify the OTP
    email_ok, email_msg = await verify_otp(
        db=db,
        recipient=email,
        plain_otp=otp,
        otp_type=OTPTypeEnum.EMAIL,
    )

    if not email_ok:
        raise OTPError(email_msg)

    # Fetch and update voter password
    user_uuid = uuid.UUID(voter_id)
    cand_query = select(Candidate).where(Candidate.candidate_id == user_uuid)
    cand_result = await db.execute(cand_query)
    candidate = cand_result.scalar_one_or_none()

    if candidate:
        query = select(Voter).where(Voter.voter_id == candidate.voter_id)
    else:
        query = select(Voter).where(Voter.voter_id == user_uuid)

    result = await db.execute(query)
    voter = result.scalar_one_or_none()

    if not voter:
        raise InvalidCredentialsError("Voter profile not found")

    voter.password_hash = new_password_hash
    await db.commit()

    return {
        "message": "Password changed successfully!"
    }


# =========================================================
# FORGOT PASSWORD SERVICES (OTP SECURED)
# =========================================================

async def request_forgot_password_otp(
    db: AsyncSession,
    email: str,
) -> dict:
    """
    Step 1: Check email exists, then generate and send Email OTP for password reset.
    """
    # 1. Fetch voter by email
    query = select(Voter).where(_email_equals(Voter.college_email, email))
    result = await db.execute(query)
    voter = result.scalar_one_or_none()

    if not voter:
        raise InvalidCredentialsError("Voter with this email does not exist")

    # 2. Create and store OTP
    email_otp_record, email_otp = await create_and_store_otp(
        db=db,
        recipient=email,
        otp_type=OTPTypeEnum.EMAIL,
    )

    # 3. Trigger OTP email in the background
    asyncio.create_task(
        send_otp_email(
            to_email=email,
            recipient_name=voter.full_name,
            otp=email_otp,
            purpose="password_reset",
        )
    )

    await db.commit()

    # 4. Generate OTP session token containing email
    from datetime import datetime, timezone, timedelta
    expire = datetime.now(timezone.utc) + timedelta(minutes=10)
    payload = {
        "sub": email,
        "type": "forgot_password_session",
        "exp": expire,
    }
    session_token = jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm="HS256")

    email_parts = email.split("@")
    masked = email_parts[0][:2] + "***" + "@" + email_parts[1]

    return {
        "otp_session_token": session_token,
        "hint": f"A reset OTP has been sent to your email ({masked}).",
    }


async def confirm_forgot_password(
    db: AsyncSession,
    otp_session_token: str,
    otp: str,
    new_password: str,
) -> dict:
    """
    Step 2: Verify OTP and apply the new password to the Voter account.
    """
    try:
        payload = decode_access_token(otp_session_token)
        if not payload or payload.get("type") != "forgot_password_session":
            raise InvalidCredentialsError("Invalid verification session")
    except jwt.PyJWTError:
        raise InvalidCredentialsError("Invalid verification session")

    email = payload.get("sub")

    # Verify the OTP
    email_ok, email_msg = await verify_otp(
        db=db,
        recipient=email,
        plain_otp=otp,
        otp_type=OTPTypeEnum.EMAIL,
    )

    if not email_ok:
        raise OTPError(email_msg)

    # Fetch and update voter password
    query = select(Voter).where(_email_equals(Voter.college_email, email))
    result = await db.execute(query)
    voter = result.scalar_one_or_none()

    if not voter:
        raise InvalidCredentialsError("Voter profile not found")

    new_hash = hash_password(new_password)
    voter.password_hash = new_hash
    await db.commit()

    return {
        "message": "Password reset successfully!"
    }


# =========================================================
# RESEND OTP SERVICES
# =========================================================

async def resend_voter_otp(
    db: AsyncSession,
    otp_session_token: str,
) -> dict:
    """
    Resend OTP for Voter Login based on their active OTP session token.
    """
    try:
        payload = decode_access_token(otp_session_token)
        if not payload or payload.get("type") != "otp_session":
            raise InvalidCredentialsError("Invalid or expired OTP session")
    except jwt.PyJWTError:
        raise InvalidCredentialsError("Invalid or expired OTP session")

    voter_id = payload.get("sub")
    email = payload.get("email")

    voter_uuid = uuid.UUID(voter_id)
    query = select(Voter).where(Voter.voter_id == voter_uuid)
    result = await db.execute(query)
    voter = result.scalar_one_or_none()

    if not voter:
        raise InvalidCredentialsError("Voter profile not found")

    # Generate new OTP
    otp_record, email_otp = await create_and_store_otp(
        db=db,
        recipient=voter.college_email,
        otp_type=OTPTypeEnum.EMAIL,
    )

    # Dispatch email OTP
    asyncio.create_task(
        send_otp_email(
            to_email=voter.college_email,
            recipient_name=voter.full_name,
            otp=email_otp,
            purpose="login",
        )
    )

    await db.commit()

    # Generate a fresh session token
    new_session_token = create_otp_session_token(
        voter_id=str(voter.voter_id),
        email=voter.college_email,
        otp_id=str(otp_record.otp_id),
    )

    return {
        "message": "OTP has been successfully resent to your registered email address.",
        "otp_session_token": new_session_token,
        "hint": f"OTP resent to {_mask_email(voter.college_email)}",
    }


async def resend_candidate_otp(
    db: AsyncSession,
    otp_session_token: str,
) -> dict:
    """
    Resend both Email and SMS OTPs for Candidate Login based on their active OTP session token.
    """
    try:
        payload = decode_access_token(otp_session_token)
        if not payload or payload.get("type") != "otp_session":
            raise InvalidCredentialsError("Invalid or expired OTP session")
    except jwt.PyJWTError:
        raise InvalidCredentialsError("Invalid or expired OTP session")

    voter_id = payload.get("sub")
    
    voter_uuid = uuid.UUID(voter_id)
    # Get voter to get email
    query_v = select(Voter).where(Voter.voter_id == voter_uuid)
    result_v = await db.execute(query_v)
    voter = result_v.scalar_one_or_none()

    if not voter:
        raise InvalidCredentialsError("Voter profile not found")

    # Get candidate to get mobile number
    query_c = select(Candidate).where(Candidate.voter_id == voter_uuid)
    result_c = await db.execute(query_c)
    candidate = result_c.scalar_one_or_none()

    if not candidate:
        raise InvalidCredentialsError("Candidate profile not found")

    # Generate new OTPs
    email_otp_record, email_otp = await create_and_store_otp(
        db=db,
        recipient=voter.college_email,
        otp_type=OTPTypeEnum.EMAIL,
    )

    sms_otp_record, sms_otp = await create_and_store_otp(
        db=db,
        recipient=candidate.mobile_number,
        otp_type=OTPTypeEnum.SMS,
    )

    # Dispatch in background
    asyncio.create_task(
        send_otp_email(
            to_email=voter.college_email,
            recipient_name=voter.full_name,
            otp=email_otp,
            purpose="login",
        )
    )
    asyncio.create_task(
        send_otp_sms(
            mobile_number=candidate.mobile_number,
            otp=sms_otp,
            recipient_name=voter.full_name,
        )
    )

    await db.commit()

    # Generate new token
    new_session_token = create_otp_session_token(
        voter_id=str(candidate.voter_id),
        email=voter.college_email,
        otp_id=str(email_otp_record.otp_id),
        is_registered=True,
        mobile_number=candidate.mobile_number,
    )

    return {
        "message": "OTP has been successfully resent to your registered email and mobile number.",
        "otp_session_token": new_session_token,
        "hint": (
            f"OTP sent to {_mask_email(voter.college_email)} "
            f"and {_mask_mobile(candidate.mobile_number)}"
        ),
    }


async def resend_candidate_email_otp(
    db: AsyncSession,
    otp_session_token: str,
) -> dict:
    """
    Resend ONLY the Email OTP for Candidate Login based on their active OTP session token.
    """
    try:
        payload = decode_access_token(otp_session_token)
        if not payload or payload.get("type") != "otp_session":
            raise InvalidCredentialsError("Invalid or expired OTP session")
    except jwt.PyJWTError:
        raise InvalidCredentialsError("Invalid or expired OTP session")

    voter_id = payload.get("sub")
    voter_uuid = uuid.UUID(voter_id)

    # Get voter to get email
    query_v = select(Voter).where(Voter.voter_id == voter_uuid)
    result_v = await db.execute(query_v)
    voter = result_v.scalar_one_or_none()

    if not voter:
        raise InvalidCredentialsError("Voter profile not found")

    # Generate new Email OTP
    email_otp_record, email_otp = await create_and_store_otp(
        db=db,
        recipient=voter.college_email,
        otp_type=OTPTypeEnum.EMAIL,
    )

    # Dispatch in background
    asyncio.create_task(
        send_otp_email(
            to_email=voter.college_email,
            recipient_name=voter.full_name,
            otp=email_otp,
            purpose="login",
        )
    )

    await db.commit()

    # Get values from old payload to preserve registration wizard context
    is_registered = payload.get("is_registered", False)
    mobile_number = payload.get("mobile_number")

    # Generate new token
    new_session_token = create_otp_session_token(
        voter_id=str(voter.voter_id),
        email=voter.college_email,
        otp_id=str(email_otp_record.otp_id),
        is_registered=is_registered,
        mobile_number=mobile_number,
    )

    return {
        "message": "OTP has been successfully resent to your registered email.",
        "otp_session_token": new_session_token,
        "hint": f"OTP sent to {_mask_email(voter.college_email)}",
    }


async def resend_candidate_sms_otp(
    db: AsyncSession,
    otp_session_token: str,
) -> dict:
    """
    Resend ONLY the SMS OTP for Candidate Login based on their active OTP session token.
    """
    try:
        payload = decode_access_token(otp_session_token)
        if not payload or payload.get("type") != "otp_session":
            raise InvalidCredentialsError("Invalid or expired OTP session")
    except jwt.PyJWTError:
        raise InvalidCredentialsError("Invalid or expired OTP session")

    voter_id = payload.get("sub")
    voter_uuid = uuid.UUID(voter_id)

    # Get voter
    query_v = select(Voter).where(Voter.voter_id == voter_uuid)
    result_v = await db.execute(query_v)
    voter = result_v.scalar_one_or_none()

    if not voter:
        raise InvalidCredentialsError("Voter profile not found")

    # Get candidate to get mobile number
    query_c = select(Candidate).where(Candidate.voter_id == voter_uuid)
    result_c = await db.execute(query_c)
    candidate = result_c.scalar_one_or_none()

    if not candidate:
        raise InvalidCredentialsError("Candidate profile not found")

    # Generate new SMS OTP
    sms_otp_record, sms_otp = await create_and_store_otp(
        db=db,
        recipient=candidate.mobile_number,
        otp_type=OTPTypeEnum.SMS,
    )

    # Dispatch in background
    asyncio.create_task(
        send_otp_sms(
            mobile_number=candidate.mobile_number,
            otp=sms_otp,
            recipient_name=voter.full_name,
        )
    )

    await db.commit()

    # Get values from old payload to preserve registration wizard context
    is_registered = payload.get("is_registered", False)
    mobile_number = payload.get("mobile_number")

    # Generate new token
    new_session_token = create_otp_session_token(
        voter_id=str(candidate.voter_id),
        email=voter.college_email,
        otp_id=str(sms_otp_record.otp_id),
        is_registered=is_registered,
        mobile_number=mobile_number,
    )

    return {
        "message": "OTP has been successfully resent to your registered mobile number.",
        "otp_session_token": new_session_token,
        "hint": f"OTP sent to {_mask_mobile(candidate.mobile_number)}",
    }
