import jwt
import uuid
import re

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.voter import Voter
from app.security.jwt_service import create_otp_session_token, decode_access_token
from app.security.password_service import hash_password
from app.services.otp_service import create_and_store_otp, verify_otp
from app.services.email_service import send_otp_email
from app.enums.otp_type import OTPTypeEnum
from app.exceptions.auth_exceptions import (
    InvalidCredentialsError,
    OTPError,
    OTPSessionExpiredError,
)
from app.utils.logger import logger


PASSWORD_REGEX = re.compile(
    r'^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};\'\\:"|,.<>\/?]).{8,}$'
)


# =========================================================
# STEP 1 — Send OTP to email
# =========================================================

async def forgot_password_send_otp(
    db: AsyncSession,
    email: str,
) -> dict:
    """
    Find voter by email and send a password-reset OTP.
    Always returns success (don't reveal if email exists).
    """
    result = await db.execute(
        select(Voter).where(Voter.college_email == email)
    )
    voter = result.scalars().first()

    if not voter:
        # Security: don't reveal whether the email exists
        return {
            "otp_session_token": "",
            "hint": f"If {email} is registered, an OTP has been sent.",
        }

    otp_record, plain_otp = await create_and_store_otp(
        db=db,
        recipient=voter.college_email,
        otp_type=OTPTypeEnum.PASSWORD_RESET,
    )

    await send_otp_email(
        to_email=voter.college_email,
        recipient_name=voter.full_name,
        otp=plain_otp,
        purpose="password reset",
    )
    logger.info(f"🔑 [DEV] Password reset OTP for {voter.college_email}: {plain_otp}")

    await db.commit()

    session_token = create_otp_session_token(
        voter_id=str(voter.voter_id),
        email=voter.college_email,
        otp_id=str(otp_record.otp_id),
    )

    return {
        "otp_session_token": session_token,
        "hint": f"OTP sent to {voter.college_email[:2]}***@{voter.college_email.split('@')[1]}",
    }


# =========================================================
# STEP 2 — Verify OTP
# =========================================================

async def forgot_password_verify_otp(
    db: AsyncSession,
    otp_session_token: str,
    otp: str,
) -> dict:
    """
    Verify the OTP from email. Returns a short-lived reset token.
    """
    try:
        payload = decode_access_token(otp_session_token)
    except jwt.ExpiredSignatureError:
        raise OTPSessionExpiredError()
    except jwt.PyJWTError:
        raise InvalidCredentialsError("Invalid session token")

    voter_id_str = payload.get("sub")
    email = payload.get("email")

    try:
        voter_uuid = uuid.UUID(voter_id_str)
    except (ValueError, TypeError):
        raise InvalidCredentialsError("Invalid session token")

    ok, msg = await verify_otp(
        db=db,
        recipient=email,
        plain_otp=otp,
        otp_type=OTPTypeEnum.PASSWORD_RESET,
    )

    if not ok:
        raise OTPError(msg)

    await db.commit()

    # Return a fresh session token used for the final reset step
    reset_token = create_otp_session_token(
        voter_id=str(voter_uuid),
        email=email,
        otp_id=str(uuid.uuid4()),   # just a fresh nonce
    )

    return {"reset_token": reset_token}


# =========================================================
# STEP 3 — Reset Password
# =========================================================

async def forgot_password_reset(
    db: AsyncSession,
    reset_token: str,
    new_password: str,
    confirm_password: str,
) -> dict:
    """
    Reset the voter password after OTP has been verified.
    """
    if new_password != confirm_password:
        raise OTPError("Passwords do not match")

    if not PASSWORD_REGEX.match(new_password):
        raise OTPError(
            "Password must be at least 8 characters and contain "
            "uppercase, lowercase, a number, and a special character"
        )

    try:
        payload = decode_access_token(reset_token)
    except jwt.ExpiredSignatureError:
        raise OTPSessionExpiredError()
    except jwt.PyJWTError:
        raise InvalidCredentialsError("Invalid reset token")

    voter_id_str = payload.get("sub")

    try:
        voter_uuid = uuid.UUID(voter_id_str)
    except (ValueError, TypeError):
        raise InvalidCredentialsError("Invalid reset token")

    hashed = hash_password(new_password)

    await db.execute(
        update(Voter)
        .where(Voter.voter_id == voter_uuid)
        .values(password_hash=hashed)
    )
    await db.commit()

    logger.info(f"Password reset successful for voter {voter_uuid}")

    return {"message": "Password reset successful. You can now log in with your new password."}
