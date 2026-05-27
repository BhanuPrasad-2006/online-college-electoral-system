import asyncio
from datetime import timedelta, datetime, timezone
import jwt
import uuid

from sqlalchemy import select
from sqlalchemy.orm import joinedload
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.voter import Voter
from app.models.candidate import Candidate
from app.models.admin_user import AdminUser
from app.models.election import Election
from app.enums.election_status import ElectionStatusEnum

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


async def _get_token_expiry_minutes(db: AsyncSession) -> int:
        """
        Get token expiration minutes: 15 minutes during active voting
        (enough time to browse candidates, read manifestos, and do face auth),
        180 minutes (3 hours) otherwise.
        """
        try:
            result = await db.execute(
                select(Election).where(Election.status == ElectionStatusEnum.VOTING_OPEN)
            )
            voting_open_election = result.scalars().first()
            if voting_open_election:
                return 15
            return 180
        except Exception as e:
            logger.error(f"Error checking voting_open election status: {e}")
            return 180


# =========================================================
# VOTER LOGIN STEP 1
# =========================================================

async def voter_login_step1(
    db: AsyncSession,
    email: str,
    password: str,
) -> dict:
    email = email.strip().lower()

    result = await db.execute(
        select(Voter).where(Voter.college_email == email)
    )

    voter = result.scalars().first()

    if not voter:
        raise InvalidCredentialsError()

    # Check lockout
    now = datetime.now(timezone.utc)
    if voter.lockout_until:
        lockout_until = voter.lockout_until
        if lockout_until.tzinfo is None:
            lockout_until = lockout_until.replace(tzinfo=timezone.utc)
        if now < lockout_until:
            remaining = int((lockout_until - now).total_seconds())
            raise OTPError(
                f"Account locked due to multiple failed OTP attempts. "
                f"Try again in {remaining // 60}m {remaining % 60}s."
            )

    if not verify_password(password, voter.password_hash):
        raise InvalidCredentialsError()

    if not voter.is_verified:
        raise AccountNotVerifiedError()

    otp_record, email_otp = await create_and_store_otp(
        db=db,
        recipient=voter.college_email,
        otp_type=OTPTypeEnum.EMAIL,
        expires_in_minutes=3,
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

    voter_id_str = str(voter.voter_id)
    college_email = voter.college_email
    otp_id_str = str(otp_record.otp_id)

    await db.commit()

    session_token = create_otp_session_token(
        voter_id=voter_id_str,
        email=college_email,
        otp_id=otp_id_str,
        expires_in_minutes=3,
    )

    return {
        "otp_session_token": session_token,
        "hint": f"OTP sent to {_mask_email(college_email)}",
    }


# =========================================================
# VOTER LOGIN STEP 2
# =========================================================

async def voter_login_step2(
    db: AsyncSession,
    otp_session_token: str,
    otp: str,
    device_fingerprint: str | None = None,
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

    # Check lockout
    now = datetime.now(timezone.utc)
    if voter.lockout_until:
        lockout_until = voter.lockout_until
        if lockout_until.tzinfo is None:
            lockout_until = lockout_until.replace(tzinfo=timezone.utc)
        if now < lockout_until:
            remaining = int((lockout_until - now).total_seconds())
            raise OTPError(
                f"Account locked due to multiple failed OTP attempts. "
                f"Try again in {remaining // 60}m {remaining % 60}s."
            )

    ok, msg = await verify_otp(
        db=db,
        recipient=voter.college_email,
        plain_otp=otp,
        otp_type=OTPTypeEnum.EMAIL,
    )

    if not ok:
        voter.failed_attempts = (voter.failed_attempts or 0) + 1
        if voter.failed_attempts >= 3:
            voter.lockout_until = datetime.now(timezone.utc) + timedelta(minutes=15)
            await db.commit()
            raise OTPError(
                "Account locked. Too many failed attempts. Please try again after 15 minutes."
            )
        await db.commit()
        raise OTPError(msg)

    # Reset lockout on success
    voter.failed_attempts = 0
    voter.lockout_until = None

    voter_id_str = str(voter.voter_id)
    college_email = voter.college_email
    mobile_number = voter.mobile_number
    full_name = voter.full_name

    expiry_minutes = await _get_token_expiry_minutes(db)

    await db.commit()

    import secrets
    csrf_token = secrets.token_hex(16)

    access_token = create_access_token(
        data={
            "sub": voter_id_str,
            "role": UserRoleEnum.VOTER.value,
            "email": college_email,
            "csrf_token": csrf_token,
        },
        expires_delta=timedelta(minutes=expiry_minutes),
        device_fingerprint=device_fingerprint,
    )

    # Login security alert SMS removed per user preference

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "role": UserRoleEnum.VOTER.value,
        "user_id": voter_id_str,
        "full_name": full_name,
        "expires_in_seconds": expiry_minutes * 60,
        "csrf_token": csrf_token,
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
    email = email.strip().lower()
    mobile_number = mobile_number.strip().replace(" ", "").replace("-", "")
    if mobile_number.startswith("+91"):
        mobile_number = mobile_number[3:]

    voter_result = await db.execute(
        select(Voter).where(
            Voter.college_email == email
        )
    )

    voter = voter_result.scalars().first()

    if not voter:
        raise InvalidCredentialsError("Voter profile not found. You must be registered as a voter first.")

    # Check lockout
    now = datetime.now(timezone.utc)
    if voter.lockout_until:
        lockout_until = voter.lockout_until
        if lockout_until.tzinfo is None:
            lockout_until = lockout_until.replace(tzinfo=timezone.utc)
        if now < lockout_until:
            remaining = int((lockout_until - now).total_seconds())
            raise OTPError(
                f"Account locked due to multiple failed OTP attempts. "
                f"Try again in {remaining // 60}m {remaining % 60}s."
            )

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
            expires_in_minutes=5,
        )

        sms_otp_record, sms_otp = await create_and_store_otp(
            db=db,
            recipient=candidate.mobile_number,
            otp_type=OTPTypeEnum.SMS,
            expires_in_minutes=5,
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

        voter_id_str = str(voter.voter_id)
        college_email = voter.college_email
        otp_id_str = str(email_otp_record.otp_id)
        cand_mobile = candidate.mobile_number

        await db.commit()

        session_token = create_otp_session_token(
            voter_id=voter_id_str,
            email=college_email,
            otp_id=otp_id_str,
            expires_in_minutes=5,
            is_registered=True,
            mobile_number=cand_mobile,
        )

        return {
            "otp_session_token": session_token,
            "hint": f"OTP sent to {_mask_email(college_email)} and {_mask_mobile(cand_mobile)}",
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
            expires_in_minutes=5,
        )

        sms_otp_record, sms_otp = await create_and_store_otp(
            db=db,
            recipient=full_mobile,
            otp_type=OTPTypeEnum.SMS,
            expires_in_minutes=5,
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

        voter_id_str = str(voter.voter_id)
        college_email = voter.college_email
        otp_id_str = str(email_otp_record.otp_id)

        await db.commit()

        session_token = create_otp_session_token(
            voter_id=voter_id_str,
            email=college_email,
            otp_id=otp_id_str,
            expires_in_minutes=5,
            is_registered=False,
            mobile_number=full_mobile,
        )

        return {
            "otp_session_token": session_token,
            "hint": f"Verification OTP sent to {_mask_email(college_email)} and {_mask_mobile(full_mobile)}",
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
    device_fingerprint: str | None = None,
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

    # Check lockout
    now = datetime.now(timezone.utc)
    if voter.lockout_until:
        lockout_until = voter.lockout_until
        if lockout_until.tzinfo is None:
            lockout_until = lockout_until.replace(tzinfo=timezone.utc)
        if now < lockout_until:
            remaining = int((lockout_until - now).total_seconds())
            raise OTPError(
                f"Account locked due to multiple failed OTP attempts. "
                f"Try again in {remaining // 60}m {remaining % 60}s."
            )

    # 1. Verify Email OTP
    email_ok, email_msg = await verify_otp(
        db=db,
        recipient=voter.college_email,
        plain_otp=email_otp,
        otp_type=OTPTypeEnum.EMAIL,
    )

    # 2. Verify SMS OTP
    sms_ok, sms_msg = await verify_otp(
        db=db,
        recipient=mobile_number,
        plain_otp=sms_otp,
        otp_type=OTPTypeEnum.SMS,
    )

    if not email_ok or not sms_ok:
        voter.failed_attempts = (voter.failed_attempts or 0) + 1
        if voter.failed_attempts >= 3:
            voter.lockout_until = datetime.now(timezone.utc) + timedelta(minutes=15)
            await db.commit()
            raise OTPError(
                "Account locked. Too many failed attempts. Please try again after 15 minutes."
            )
        await db.commit()
        if not email_ok:
            raise OTPError(email_msg)
        else:
            raise OTPError(sms_msg)

    # Reset lockout on success
    voter.failed_attempts = 0
    voter.lockout_until = None

    college_email = voter.college_email
    voter_id_str = str(voter.voter_id)
    full_name = voter.full_name
    department = voter.department
    year_of_study = voter.year_of_study

    candidate = None
    candidate_id_str = None
    if is_registered:
        candidate_result = await db.execute(
            select(Candidate).where(Candidate.voter_id == voter_uuid)
        )
        candidate = candidate_result.scalars().first()
        if not candidate:
            raise InvalidCredentialsError("Candidate profile not found")

        candidate_id_str = str(candidate.candidate_id)
        candidate.mobile_verified = True

    expiry_minutes = await _get_token_expiry_minutes(db)

    await db.commit()

    import secrets
    csrf_token = secrets.token_hex(16)

    # If is_registered is True, we have an existing candidate profile
    if is_registered:
        # Access token sub is the candidate_id for registered candidates
        access_token = create_access_token(
            data={
                "sub": candidate_id_str,
                "role": UserRoleEnum.CANDIDATE.value,
                "email": college_email,
                "csrf_token": csrf_token,
            },
            expires_delta=timedelta(minutes=expiry_minutes),
            device_fingerprint=device_fingerprint,
        )

        return {
            "access_token": access_token,
            "token_type": "bearer",
            "role": UserRoleEnum.CANDIDATE.value,
            "user_id": candidate_id_str,
            "full_name": full_name,
            "expires_in_seconds": expiry_minutes * 60,
            "is_registered": True,
            "department": department,
            "semester": str((year_of_study * 2) - 1) if year_of_study is not None else None,
            "csrf_token": csrf_token,
        }
    else:
        # If not registered yet, we create a temporary registration JWT token!
        # Its role is still candidate, but is_registered is returned as False!
        # The frontend will receive this, see is_registered=False, and render the wizard using this JWT token!
        access_token = create_access_token(
            data={
                "sub": voter_id_str,
                "role": UserRoleEnum.CANDIDATE.value,
                "email": college_email,
                "temp_reg": True,
                "mobile_number": mobile_number,
                "csrf_token": csrf_token,
            },
            expires_delta=timedelta(minutes=expiry_minutes),
            device_fingerprint=device_fingerprint,
        )

        return {
            "access_token": access_token,
            "token_type": "bearer",
            "role": UserRoleEnum.CANDIDATE.value,
            "user_id": voter_id_str,
            "full_name": full_name,
            "expires_in_seconds": expiry_minutes * 60,
            "is_registered": False,
            "department": department,
            "semester": str((year_of_study * 2) - 1) if year_of_study is not None else None,
            "mobile_number": mobile_number,
            "csrf_token": csrf_token,
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
    email = email.strip().lower()
    mobile_number = mobile_number.strip().replace(" ", "").replace("-", "")
    if mobile_number.startswith("+91"):
        mobile_number = mobile_number[3:]

    # 1. Fetch admin user
    result = await db.execute(
        select(AdminUser).where(AdminUser.email == email)
    )
    admin = result.scalars().first()

    if not admin:
        raise InvalidCredentialsError("Invalid email or password")

    # Check lockout
    now = datetime.now(timezone.utc)
    if admin.lockout_until:
        lockout_until = admin.lockout_until
        if lockout_until.tzinfo is None:
            lockout_until = lockout_until.replace(tzinfo=timezone.utc)
        if now < lockout_until:
            remaining = int((lockout_until - now).total_seconds())
            raise OTPError(
                f"Account locked due to multiple failed OTP attempts. "
                f"Try again in {remaining // 60}m {remaining % 60}s."
            )

    if not verify_password(password, admin.password_hash):
        raise InvalidCredentialsError("Invalid email or password")

    # 2. Create and store OTPs
    email_otp_record, email_otp = await create_and_store_otp(
        db=db,
        recipient=admin.email,
        otp_type=OTPTypeEnum.EMAIL,
        expires_in_minutes=3,
    )

    sms_otp_record, sms_otp = await create_and_store_otp(
        db=db,
        recipient=mobile_number,
        otp_type=OTPTypeEnum.SMS,
        expires_in_minutes=3,
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

    admin_id_str = str(admin.admin_id)
    admin_email = admin.email

    await db.commit()

    # 4. Generate OTP session token
    expire = datetime.now(timezone.utc) + timedelta(minutes=3)
    payload = {
        "sub": admin_id_str,
        "email": admin_email,
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
    device_fingerprint: str | None = None,
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

    # Check lockout
    now = datetime.now(timezone.utc)
    if admin.lockout_until:
        lockout_until = admin.lockout_until
        if lockout_until.tzinfo is None:
            lockout_until = lockout_until.replace(tzinfo=timezone.utc)
        if now < lockout_until:
            remaining = int((lockout_until - now).total_seconds())
            raise OTPError(
                f"Account locked due to multiple failed OTP attempts. "
                f"Try again in {remaining // 60}m {remaining % 60}s."
            )

    # Verify both OTPs
    email_ok, email_msg = await verify_otp(
        db=db,
        recipient=admin.email,
        plain_otp=email_otp,
        otp_type=OTPTypeEnum.EMAIL,
    )

    if not email_ok:
        admin.failed_attempts = (admin.failed_attempts or 0) + 1
        if admin.failed_attempts >= 3:
            admin.lockout_until = datetime.now(timezone.utc) + timedelta(minutes=15)
            await db.commit()
            raise OTPError(
                "Account locked. Too many failed attempts. Please try again after 15 minutes."
            )
        await db.commit()
        raise OTPError(email_msg)

    sms_ok, sms_msg = await verify_otp(
        db=db,
        recipient=mobile,
        plain_otp=sms_otp,
        otp_type=OTPTypeEnum.SMS,
    )

    if not sms_ok:
        admin.failed_attempts = (admin.failed_attempts or 0) + 1
        if admin.failed_attempts >= 3:
            admin.lockout_until = datetime.now(timezone.utc) + timedelta(minutes=15)
            await db.commit()
            raise OTPError(
                "Account locked. Too many failed attempts. Please try again after 15 minutes."
            )
        await db.commit()
        raise OTPError(sms_msg)

    # Success: reset failed attempts and lockout
    admin.failed_attempts = 0
    admin.lockout_until = None

    admin_id_str = str(admin.admin_id)
    admin_email = admin.email
    full_name = admin.full_name

    expiry_minutes = await _get_token_expiry_minutes(db)

    await db.commit()

    import secrets
    csrf_token = secrets.token_hex(16)

    # Generate Access JWT Token for Admin
    access_token = create_access_token(
        data={
            "sub": admin_id_str,
            "role": "admin",
            "email": admin_email,
            "csrf_token": csrf_token,
        },
        expires_delta=timedelta(minutes=expiry_minutes),
        device_fingerprint=device_fingerprint,
    )

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "role": "admin",
        "user_id": admin_id_str,
        "full_name": full_name,
        "expires_in_seconds": expiry_minutes * 60,
        "csrf_token": csrf_token,
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

    college_email = voter.college_email

    await db.commit()

    # 5. Generate OTP session token containing hashed new password!
    new_hash = hash_password(new_password)
    from datetime import datetime, timezone
    expire = datetime.now(timezone.utc) + timedelta(minutes=10)
    payload = {
        "sub": voter_id,
        "email": college_email,
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
    email = email.strip().lower()
    # 1. Fetch voter by email
    query = select(Voter).where(Voter.college_email == email)
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
    query = select(Voter).where(Voter.college_email == email)
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

    # Check lockout
    now = datetime.now(timezone.utc)
    if voter.lockout_until:
        lockout_until = voter.lockout_until
        if lockout_until.tzinfo is None:
            lockout_until = lockout_until.replace(tzinfo=timezone.utc)
        if now < lockout_until:
            remaining = int((lockout_until - now).total_seconds())
            raise OTPError(
                f"Account locked due to multiple failed OTP attempts. "
                f"Try again in {remaining // 60}m {remaining % 60}s."
            )

    # Generate new OTP
    otp_record, email_otp = await create_and_store_otp(
        db=db,
        recipient=voter.college_email,
        otp_type=OTPTypeEnum.EMAIL,
        expires_in_minutes=3,
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

    voter_id_str = str(voter.voter_id)
    college_email = voter.college_email
    otp_id_str = str(otp_record.otp_id)

    await db.commit()

    # Generate a fresh session token
    new_session_token = create_otp_session_token(
        voter_id=voter_id_str,
        email=college_email,
        otp_id=otp_id_str,
        expires_in_minutes=3,
    )

    return {
        "message": "OTP has been successfully resent to your registered email address.",
        "otp_session_token": new_session_token,
        "hint": f"OTP resent to {_mask_email(college_email)}",
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
        expires_in_minutes=5,
    )

    sms_otp_record, sms_otp = await create_and_store_otp(
        db=db,
        recipient=candidate.mobile_number,
        otp_type=OTPTypeEnum.SMS,
        expires_in_minutes=5,
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

    voter_id_str = str(candidate.voter_id)
    college_email = voter.college_email
    otp_id_str = str(email_otp_record.otp_id)
    mobile_num = candidate.mobile_number

    await db.commit()

    # Generate new token
    new_session_token = create_otp_session_token(
        voter_id=voter_id_str,
        email=college_email,
        otp_id=otp_id_str,
        expires_in_minutes=5,
        is_registered=True,
        mobile_number=mobile_num,
    )

    return {
        "message": "OTP has been successfully resent to your registered email and mobile number.",
        "otp_session_token": new_session_token,
        "hint": (
            f"OTP sent to {_mask_email(college_email)} "
            f"and {_mask_mobile(mobile_num)}"
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
        expires_in_minutes=5,
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

    voter_id_str = str(voter.voter_id)
    college_email = voter.college_email
    otp_id_str = str(email_otp_record.otp_id)

    await db.commit()

    # Get values from old payload to preserve registration wizard context
    is_registered = payload.get("is_registered", False)
    mobile_number = payload.get("mobile_number")

    # Generate new token
    new_session_token = create_otp_session_token(
        voter_id=voter_id_str,
        email=college_email,
        otp_id=otp_id_str,
        expires_in_minutes=5,
        is_registered=is_registered,
        mobile_number=mobile_number,
    )

    return {
        "message": "OTP has been successfully resent to your registered email.",
        "otp_session_token": new_session_token,
        "hint": f"OTP sent to {_mask_email(college_email)}",
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
        expires_in_minutes=5,
    )

    # Dispatch in background
    asyncio.create_task(
        send_otp_sms(
            mobile_number=candidate.mobile_number,
            otp=sms_otp,
            recipient_name=voter.full_name,
        )
    )

    voter_id_str = str(candidate.voter_id)
    college_email = voter.college_email
    otp_id_str = str(sms_otp_record.otp_id)
    cand_mobile = candidate.mobile_number

    await db.commit()

    # Get values from old payload to preserve registration wizard context
    is_registered = payload.get("is_registered", False)
    mobile_number = payload.get("mobile_number")

    # Generate new token
    new_session_token = create_otp_session_token(
        voter_id=voter_id_str,
        email=college_email,
        otp_id=otp_id_str,
        expires_in_minutes=5,
        is_registered=is_registered,
        mobile_number=mobile_number,
    )

    return {
        "message": "OTP has been successfully resent to your registered mobile number.",
        "otp_session_token": new_session_token,
        "hint": f"OTP sent to {_mask_mobile(cand_mobile)}",
    }