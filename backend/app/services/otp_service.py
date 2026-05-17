import secrets
import string
import bcrypt

from datetime import datetime, timedelta, timezone

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_

from app.core.config import settings
from app.models.otp_request import OTPRequest
from app.enums.otp_type import OTPTypeEnum


# =========================================================
# HASHING
# =========================================================

def _otp_hash(otp: str) -> str:
    return bcrypt.hashpw(
        otp.encode(),
        bcrypt.gensalt(rounds=10),
    ).decode()


def _otp_verify(otp: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(
            otp.encode(),
            hashed.encode(),
        )
    except Exception:
        return False


# =========================================================
# OTP GENERATION
# =========================================================

def _generate_otp(length: int | None = None) -> str:
    length = length or settings.OTP_LENGTH

    return "".join(
        secrets.choice(string.digits)
        for _ in range(length)
    )


# =========================================================
# CREATE OTP
# =========================================================

async def create_and_store_otp(
    db: AsyncSession,
    recipient: str,
    otp_type: OTPTypeEnum,
) -> tuple[OTPRequest, str]:

    """
    Generate OTP, hash it, store in DB.

    Returns:
        (otp_record, plain_otp)
    """

    # Invalidate previous OTPs
    old_stmt = select(OTPRequest).where(
        and_(
            OTPRequest.recipient == recipient,
            OTPRequest.otp_type == otp_type,
            OTPRequest.is_used == False,  # noqa
        )
    )

    old_result = await db.execute(old_stmt)

    for old_otp in old_result.scalars().all():
        old_otp.is_used = True

    # Generate OTP
    plain_otp = _generate_otp()

    # Hash OTP
    hashed_otp = _otp_hash(plain_otp)

    # Expiry
    expires_at = (
        datetime.now(timezone.utc)
        + timedelta(minutes=settings.OTP_EXPIRE_MINUTES)
    )

    # Create DB record
    otp_record = OTPRequest(
        recipient=recipient,
        otp_type=otp_type,
        otp_hash=hashed_otp,
        expires_at=expires_at,
        is_used=False,
    )

    db.add(otp_record)

    await db.flush()
    await db.refresh(otp_record)

    return otp_record, plain_otp


# =========================================================
# VERIFY OTP
# =========================================================

async def verify_otp(
    db: AsyncSession,
    recipient: str,
    plain_otp: str,
    otp_type: OTPTypeEnum,
) -> tuple[bool, str]:

    """
    Verify OTP.

    Returns:
        (success, message)
    """

    stmt = select(OTPRequest).where(
        and_(
            OTPRequest.recipient == recipient,
            OTPRequest.otp_type == otp_type,
            OTPRequest.is_used == False,  # noqa
        )
    ).order_by(
        OTPRequest.created_at.desc()
    )

    result = await db.execute(stmt)

    otp_record = result.scalars().first()

    # No OTP
    if not otp_record:
        return False, "No active OTP found"

    # Expiry handling
    now = datetime.now(timezone.utc)

    expires_at = otp_record.expires_at

    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(
            tzinfo=timezone.utc
        )

    if now > expires_at:
        otp_record.is_used = True
        return False, "OTP expired"

    # Wrong OTP
    print("ENTERED OTP:", plain_otp)
    print("HASH IN DB:", otp_record.otp_hash)
    print("RECIPIENT:", otp_record.recipient)
    print("IS USED:", otp_record.is_used)

    is_valid = _otp_verify(
    str(plain_otp).strip(),
    otp_record.otp_hash.strip(),
)

    print("OTP VALID:", is_valid)

    if not is_valid:
        return False, "Invalid OTP"

    # Success
    otp_record.is_used = True

    return True, "OTP verified successfully"