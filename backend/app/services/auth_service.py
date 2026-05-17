import asyncio
import jwt
import uuid

from sqlalchemy import select
from sqlalchemy.orm import joinedload
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.voter import Voter
from app.models.candidate import Candidate

from app.security.password_service import verify_password
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
from app.services.sms_service import send_otp_sms

from app.enums.otp_type import OTPTypeEnum
from app.enums.roles import UserRoleEnum

from app.core.config import settings

from app.exceptions.auth_exceptions import (
    InvalidCredentialsError,
    AccountNotVerifiedError,
    OTPError,
    OTPSessionExpiredError,
    MobileEmailMismatchError,
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


# =========================================================
# VOTER LOGIN STEP 1
# =========================================================

async def voter_login_step1(
    db: AsyncSession,
    email: str,
    password: str,
) -> dict:

    result = await db.execute(
        select(Voter).where(Voter.college_email == email)
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

    email_sent = await send_otp_email(
        to_email=voter.college_email,
        recipient_name=voter.full_name,
        otp=email_otp,
        purpose="login",
    )

    if not email_sent:
        logger.error(
            f"Failed to send voter OTP email: {voter.voter_id}"
        )
        raise OTPError("Failed to send OTP email")

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
            Voter.college_email == email
        )
    )

    voter = voter_result.scalars().first()

    if not voter:
        raise InvalidCredentialsError()

    if not verify_password(password, voter.password_hash):
        raise InvalidCredentialsError()

    if not voter.is_verified:
        raise AccountNotVerifiedError()

    candidate_result = await db.execute(
        select(Candidate).where(
            Candidate.voter_id == voter.voter_id
        )
    )

    candidate = candidate_result.scalars().first()

    if not candidate:
        raise InvalidCredentialsError(
            "No candidate profile found"
        )

    stored_mobile = candidate.mobile_number.replace(
        "+91", ""
    ).strip()

    entered_mobile = mobile_number.replace(
        "+91", ""
    ).strip()

    if stored_mobile != entered_mobile:
        raise MobileEmailMismatchError()

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

    email_task = send_otp_email(
        to_email=voter.college_email,
        recipient_name=voter.full_name,
        otp=email_otp,
        purpose="login",
    )

    sms_task = send_otp_sms(
        mobile_number=candidate.mobile_number,
        otp=sms_otp,
        recipient_name=voter.full_name,
    )

    await asyncio.gather(
        email_task,
        sms_task,
        return_exceptions=True,
    )

    await db.commit()

    session_token = create_otp_session_token(
        voter_id=str(candidate.voter_id),
        email=voter.college_email,
        otp_id=str(email_otp_record.otp_id),
    )

    return {
        "otp_session_token": session_token,
        "hint": (
            f"OTP sent to {_mask_email(voter.college_email)} "
            f"and {_mask_mobile(candidate.mobile_number)}"
        ),
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

    try:
        voter_uuid = uuid.UUID(voter_id_str)
    except ValueError:
        raise InvalidCredentialsError("Invalid candidate ID")

    result = await db.execute(
        select(Candidate)
        .options(joinedload(Candidate.voter))
        .where(Candidate.voter_id == voter_uuid)
    )

    candidate = result.scalars().first()

    if not candidate:
        raise InvalidCredentialsError("Candidate not found")

    voter = candidate.voter

    email_ok, email_msg = await verify_otp(
        db=db,
        recipient=voter.college_email,
        plain_otp=email_otp,
        otp_type=OTPTypeEnum.EMAIL,
    )

    if not email_ok:
        raise OTPError(email_msg)

    sms_ok, sms_msg = await verify_otp(
        db=db,
        recipient=candidate.mobile_number,
        plain_otp=sms_otp,
        otp_type=OTPTypeEnum.SMS,
    )

    if not sms_ok:
        raise OTPError(sms_msg)

    candidate.mobile_verified = True

    await db.commit()

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
    }